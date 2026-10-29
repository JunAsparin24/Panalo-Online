/* =========================================================
   buzzer.js — The phone buzzer.

   0. Players go to the site and type the 4-letter game code shown
      on the host's screen, like Jackbox (or open a link with the
      code already in it: /?room=CODE)
   1. The player picks their team (the list comes from the game)
   2. A big button: TAP TO ANSWER
   3. The first team to tap locks everyone else out until the
      host clicks "Unlock buzzers" in the game (or their 15
      seconds run out). A team that already guessed stays locked
      until the next question.
   4. During Final Wager the phone is for the team's secret wager
      (final-wager-phone.js)

   The phone checks in with the server a few times a second.
   ========================================================= */

const POLL_MS = 400;
const TEAM_KEY = "trivia-buzzer-team";
const PLAYER_KEY = "trivia-buzzer-player";

const teamScreen = document.getElementById("team-screen");
const teamList = document.getElementById("team-list");
const noTeamsMessage = document.getElementById("no-teams-message");
const buzzScreen = document.getElementById("buzz-screen");
const buzzButton = document.getElementById("buzz-button");
const buzzButtonMain = document.getElementById("buzz-button-main");
const buzzButtonSub = document.getElementById("buzz-button-sub");
const buzzStatus = document.getElementById("buzz-status");
const changeTeamButton = document.getElementById("change-team-button");
const connectionBanner = document.getElementById("connection-banner");
const joinScreen = document.getElementById("join-screen");
const joinForm = document.getElementById("join-form");
const joinCodeInput = document.getElementById("join-code");
const joinError = document.getElementById("join-error");

// This game's code, from the link (…/?room=ABCD)
const roomCode = (new URLSearchParams(location.search).get("room") || "").trim().toUpperCase();

const playerId = getOrCreatePlayerId();
let myTeamId = readStorage(TEAM_KEY);
let latestState = null;
let isSendingBuzz = false;
let lastCelebratedBuzzId = null;
let isChoosingTeam = false;

/* ---------- Talking to the server ---------- */

// Gives up on a request after 5 seconds, so one stuck request can't stall the phone
function requestTimeout() {
  return window.AbortSignal && AbortSignal.timeout ? AbortSignal.timeout(5000) : undefined;
}

// "/api/state" → "/api/state?room=ABCD"
function apiUrl(path) {
  return `${path}${path.includes("?") ? "&" : "?"}room=${encodeURIComponent(roomCode)}`;
}

async function checkIn() {
  try {
    const response = await fetch(apiUrl(`/api/state?player=${encodeURIComponent(playerId)}`), { cache: "no-store", signal: requestTimeout() });
    if (response.status === 404) {
      showJoinScreen(true); // no game with this code (or it ended)
      return;
    }
    if (!response.ok) throw new Error(response.status);
    latestState = await response.json();
    applyTheme(cleanTheme(latestState.theme)); // theme.js — the host's theme color
    connectionBanner.hidden = true;
    render();
  } catch (error) {
    connectionBanner.hidden = false;
  }
}

async function buzz() {
  if (isSendingBuzz || !latestState || latestState.locked || latestState.open === false) return;
  if ((latestState.blocked || []).includes(myTeamId)) return;
  isSendingBuzz = true;
  showButton("sending", "…", "");

  try {
    const response = await fetch(apiUrl("/api/buzz"), {
      method: "POST",
      body: JSON.stringify({ teamId: myTeamId, playerId }),
    });
    const result = await response.json();
    if (result.state) latestState = result.state;
  } catch (error) {
    connectionBanner.hidden = false;
  }

  isSendingBuzz = false;
  render();
}

/* ---------- Drawing the screen ---------- */

function render() {
  if (!latestState || isSendingBuzz) return;

  const teams = latestState.teams || [];
  const myTeam = teams.find((team) => team.id === myTeamId);

  // No team chosen yet (or the host renamed/removed it) → pick one
  if (!myTeam || isChoosingTeam) {
    renderTeamPicker(teams);
    return;
  }

  teamScreen.hidden = true;
  changeTeamButton.hidden = false;
  changeTeamButton.textContent = `${myTeam.name} · change`;
  document.documentElement.style.setProperty("--team-color", myTeam.color);

  // Final Wager takes over the phone (final-wager-phone.js)
  const isFinalWager = Boolean(latestState.finalWager && latestState.finalWager.active);
  buzzScreen.hidden = isFinalWager;
  renderFinalWagerPhone(isFinalWager ? latestState.finalWager : null);
  if (isFinalWager) return;

  const winner = latestState.locked ? latestState.winner : null;
  const alreadyGuessed = (latestState.blocked || []).includes(myTeamId);

  if (latestState.open === false && latestState.timeUp) {
    showButton("locked", "Time's up", "Nobody buzzed in 30 seconds");
    buzzStatus.textContent = "Wait for the next question";
  } else if (latestState.open === false) {
    showButton("locked", "Get ready", "Waiting for a question");
    buzzStatus.textContent = "";
  } else if (alreadyGuessed && (!winner || winner.id !== myTeamId)) {
    // Everyone blocked = a Golden Boost (one team plays, no buzzing).
    // Otherwise your team got it wrong and waits for another team to try.
    const everyoneBlocked = teams.every((team) => (latestState.blocked || []).includes(team.id));
    if (everyoneBlocked) {
      showButton("locked", "Locked", "Your team can't buzz on this question");
      buzzStatus.textContent = "Wait for the next question";
    } else {
      showButton("locked", "Locked", "Another team has to try first");
      buzzStatus.textContent = "You can buzz again after another team gets it wrong";
    }
  } else if (!winner) {
    showButton("ready", "Tap to answer", "");
    buzzStatus.textContent = "";
  } else if (winner.id === myTeamId) {
    showButton("won", "You're first!", "Answer now");
    buzzStatus.textContent = "Waiting for the host…";
    celebrate(latestState.buzzId);
  } else {
    showButton("locked", "Locked", `${winner.name} buzzed first`);
    buzzStatus.textContent = "Wait for the host to unlock";
  }
}

function renderTeamPicker(teams) {
  buzzScreen.hidden = true;
  renderFinalWagerPhone(null);
  teamScreen.hidden = false;
  changeTeamButton.hidden = true;
  noTeamsMessage.hidden = teams.length > 0;

  // Only redraw when the team list actually changed (keeps taps reliable)
  const signature = JSON.stringify(teams);
  if (teamList.dataset.signature === signature) return;
  teamList.dataset.signature = signature;

  teamList.innerHTML = "";
  teams.forEach((team) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "team-option";
    button.textContent = team.name;
    button.style.setProperty("--team-color", team.color);
    button.addEventListener("click", () => chooseTeam(team.id));
    teamList.appendChild(button);
  });
}

function chooseTeam(teamId) {
  myTeamId = teamId;
  isChoosingTeam = false;
  writeStorage(TEAM_KEY, teamId);
  render();
}

function showButton(mode, mainText, subText) {
  buzzButton.dataset.mode = mode;
  buzzButton.disabled = mode !== "ready";
  buzzButtonMain.textContent = mainText;
  buzzButtonSub.textContent = subText;
}

// Buzz once and flash when your team gets in first
function celebrate(buzzId) {
  if (lastCelebratedBuzzId === buzzId) return;
  lastCelebratedBuzzId = buzzId;
  if (navigator.vibrate) navigator.vibrate([120, 60, 120]);
}

/* ---------- Buttons ---------- */

// pointerdown fires the instant a finger touches — faster than "click"
buzzButton.addEventListener("pointerdown", (event) => {
  event.preventDefault();
  buzz();
});

// Keyboard (space / enter) for anyone using a laptop as a buzzer
buzzButton.addEventListener("keydown", (event) => {
  if (event.key === " " || event.key === "Enter") {
    event.preventDefault();
    buzz();
  }
});

changeTeamButton.addEventListener("click", () => {
  isChoosingTeam = true;
  teamList.dataset.signature = ""; // force the list to redraw
  render();
});

/* ---------- Joining with a game code ---------- */

function showJoinScreen(wasWrong) {
  joinScreen.hidden = false;
  teamScreen.hidden = true;
  buzzScreen.hidden = true;
  renderFinalWagerPhone(null);
  changeTeamButton.hidden = true;
  connectionBanner.hidden = true;
  joinError.hidden = !wasWrong;
  if (wasWrong) joinCodeInput.value = roomCode;
}

// Opens this page again with the code in the link, so it can be bookmarked or shared
joinForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const code = joinCodeInput.value.trim().toUpperCase();
  if (code) location.href = `${location.pathname}?room=${encodeURIComponent(code)}`;
});

/* ---------- Remembering this phone ---------- */

function getOrCreatePlayerId() {
  let id = readStorage(PLAYER_KEY);
  if (!id) {
    id = "p" + Math.random().toString(36).slice(2, 10);
    writeStorage(PLAYER_KEY, id);
  }
  return id;
}

function readStorage(key) {
  try { return localStorage.getItem(key); } catch (error) { return null; }
}

function writeStorage(key, value) {
  try { localStorage.setItem(key, value); } catch (error) { /* not important */ }
}

/* ---------- Start ---------- */

// Asks again only after the last answer arrives, so the server never
// gets a pile-up of requests from every phone. Stops if the code is wrong.
async function pollLoop() {
  await checkIn();
  if (joinScreen.hidden) setTimeout(pollLoop, POLL_MS);
}

if (roomCode) {
  pollLoop();
} else {
  showJoinScreen(false);
}
