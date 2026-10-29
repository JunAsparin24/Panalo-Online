/* =========================================================
   buzzer-host.js — The host's side of the phone buzzers.

   This only switches on when the game is opened through the
   Trivia Night server (the website — see server/server.js). Opened
   as a plain file, the game works the same, just without buzzers.

   Every game on the website is its own ROOM with a short code.
   This game asks the server for a room when it opens, and gets a
   secret HOST KEY that proves it's the host (sent with every
   request). The room is remembered in this browser, so reloading
   the page keeps the same code and the phones stay connected.

   What it does:
   - sends the team list to the server so phones can pick a team
   - checks the server a few times a second for a buzz
   - when a team buzzes: plays a sound and shows "TEAM X BUZZED IN!"
   - "Unlock buzzers" (or the U key) lets everyone buzz again
   - on an open question, the team that buzzed has 15 seconds to
     answer. If time runs out they get it wrong (✗), and the buzzers
     unlock for everyone else
   - a team that got it wrong (time ran out, or the host unlocked)
     can buzz again on the same question, but only after another
     team has had a go and got it wrong too
   - phones can only buzz while a question card is open; opening
     or closing a question clears any buzz automatically
   - teams get 30 seconds to buzz (question-screen.js); when that
     runs out the buzzers close for the rest of the question
   ========================================================= */

const BUZZER_POLL_MS = 400;
const ANSWER_TIME_MS = 15000;
const ANSWER_TIME_URGENT_MS = 5000; // the countdown turns red from here

const buzzerButton = document.getElementById("buzzer-button");
const buzzerButtonText = document.getElementById("buzzer-button-text");
const homeBuzzerJoin = document.getElementById("home-buzzer-join");
const homeBuzzerUrl = document.getElementById("home-buzzer-url");
const homeBuzzerCode = document.getElementById("home-buzzer-code");
const buzzAlert = document.getElementById("buzz-alert");
const buzzAlertTeam = document.getElementById("buzz-alert-team");
const buzzAlertUnlock = document.getElementById("buzz-alert-unlock");
const buzzAlertTimer = document.getElementById("buzz-alert-timer");
const joinPanel = document.getElementById("buzzer-join-panel");
const joinPanelUnlock = document.getElementById("join-panel-unlock");
const joinPanelClose = document.getElementById("join-panel-close");
const buzzerQrElement = document.getElementById("buzzer-qr");
const buzzerJoinUrl = document.getElementById("buzzer-join-url");
const buzzerPlayerCount = document.getElementById("buzzer-player-count");
const buzzerRoomCode = document.getElementById("buzzer-room-code");
const buzzerCopyButton = document.getElementById("buzzer-copy-link");
const hostScreenInfo = document.getElementById("host-screen-info");
const hostScreenUrl = document.getElementById("host-screen-url");
const hostScreenCode = document.getElementById("host-screen-code");

const ROOM_STORAGE_KEY = "panalo-room";

let isBuzzerConnected = false;
let buzzerRoom = null;       // { room, hostKey, hostCode } from the server
let buzzerState = null;      // the latest state from the server
let lastSeenBuzzId = null;   // to spot a *new* buzz
let qrCodeMadeFor = "";
let lockedOutTeamIds = [];   // teams that can't buzz at all on this question (Golden Boost)
let lastWrongTeamId = null;  // the last team to get it wrong — waits until another team tries
let isBuzzWindowOver = false; // the 30 seconds to buzz ran out — nobody can buzz on this question
let answerTimer = null;      // { teamId, deadline, intervalId } while a team is answering
let connectAttempts = 0;     // retries if the server is slow to answer at first

/* ---------- Used by other files ---------- */

// The team that buzzed in first, or null when the buzzers are open
function getBuzzedTeamId() {
  return buzzerState && buzzerState.locked && buzzerState.winner ? buzzerState.winner.id : null;
}

// The host's "Unlock buzzers" (button or U key): the team that buzzed got
// it wrong, so they sit out until another team has a go
function unlockAfterWrongAnswer() {
  const teamId = getBuzzedTeamId();
  if (teamId) lastWrongTeamId = teamId;
  unlockBuzzers();
}

// Unlocks for every team except the locked-out ones and the last team
// to get it wrong. Phones can only buzz while a question card is open.
async function unlockBuzzers() {
  stopAnswerTimer();
  if (!isBuzzerConnected) return;
  const blocked = lastWrongTeamId ? [...lockedOutTeamIds, lastWrongTeamId] : lockedOutTeamIds;
  try {
    const body = JSON.stringify({
      blocked,
      open: isQuestionScreenOpen && !isBuzzWindowOver, // question-screen.js
      timeUp: isQuestionScreenOpen && isBuzzWindowOver, // phones show "Time's up"
    });
    handleBuzzerState(await buzzerRequest("/api/unlock", { method: "POST", body }));
  } catch (error) {
    // The next check will show the server as offline
  }
}

// Puts the open question and its answer on the host's phone (/host).
// details = { round, category, value, question, answer, image, golden } or null.
function sendQuestionToHostScreen(details) {
  if (!isBuzzerConnected) return;
  buzzerRequest("/api/question", { method: "POST", body: JSON.stringify(details) }).catch(() => {});
}

// A new question (or back to the board): everyone can buzz again,
// except any teams listed (on the Golden Boost, only one team plays)
function resetBuzzersForQuestion(teamIdsToLockOut = []) {
  lockedOutTeamIds = [...teamIdsToLockOut];
  lastWrongTeamId = null;
  isBuzzWindowOver = false;
  unlockBuzzers();
}

// The 30 seconds to buzz ran out (question-screen.js): close the buzzers
// for the rest of this question
function closeBuzzersTimeUp() {
  isBuzzWindowOver = true;
  unlockBuzzers();
}

/* ---------- 15 seconds to answer ---------- */

function startAnswerTimer(teamId) {
  stopAnswerTimer();
  answerTimer = { teamId, deadline: Date.now() + ANSWER_TIME_MS, intervalId: setInterval(tickAnswerTimer, 100) };
  tickAnswerTimer();
}

function stopAnswerTimer() {
  if (answerTimer) clearInterval(answerTimer.intervalId);
  answerTimer = null;
  buzzAlertTimer.hidden = true;
}

function tickAnswerTimer() {
  const timeLeft = answerTimer.deadline - Date.now();
  if (timeLeft <= 0) {
    handleAnswerTimeUp(answerTimer.teamId);
    return;
  }
  buzzAlertTimer.hidden = false;
  const seconds = Math.ceil(timeLeft / 1000);
  buzzAlertTimer.textContent = seconds;

  // Tick for each of the last 5 seconds (sound-effects.js)
  if (seconds <= 5 && seconds !== answerTimer.lastTickSecond) {
    answerTimer.lastTickSecond = seconds;
    playCountdownTick(true);
  }
  buzzAlertTimer.classList.toggle("is-urgent", timeLeft <= ANSWER_TIME_URGENT_MS);
}

function handleAnswerTimeUp(teamId) {
  stopAnswerTimer();
  playTimesUpSound();      // music.js
  markTeamWrong(teamId);   // scoreboard.js
  lastWrongTeamId = teamId;
  unlockBuzzers();
}

/* ---------- Talking to the server ---------- */

// Every request to the server: adds this game's room code, and the host key
// that proves it's the host. Used by final-wager.js and host-control.js too.
async function buzzerRequest(path, options = {}) {
  const url = new URL(path, location.origin);
  url.searchParams.set("room", buzzerRoom.room);
  const timeout = window.AbortSignal && AbortSignal.timeout ? AbortSignal.timeout(8000) : undefined; // never wait forever
  const response = await fetch(url, {
    cache: "no-store",
    signal: timeout,
    ...options,
    headers: { "X-Host-Key": buzzerRoom.hostKey, ...(options.headers || {}) },
  });
  if (!response.ok) {
    const error = new Error(`Server answered ${response.status}`);
    error.status = response.status;
    throw error;
  }
  return response.json();
}

// Gets this game's room: the one remembered in this browser if the server
// still has it, otherwise a brand-new one (with a new code)
async function openRoom() {
  let saved = {};
  try { saved = JSON.parse(localStorage.getItem(ROOM_STORAGE_KEY)) || {}; } catch (error) { /* none saved */ }
  const response = await fetch("/api/rooms", {
    method: "POST",
    cache: "no-store",
    body: JSON.stringify({ room: saved.room, hostKey: saved.hostKey }),
  });
  if (!response.ok) throw new Error(`Server answered ${response.status}`);
  const room = await response.json();
  try { localStorage.setItem(ROOM_STORAGE_KEY, JSON.stringify(room)); } catch (error) { /* fine */ }
  return room;
}

// The full link, with the code already in it (for the QR code and "Copy link")
function getJoinUrl() {
  return `${location.origin}/?room=${buzzerRoom.room}`;
}

function getHostScreenUrl() {
  return `${location.origin}/host?room=${buzzerRoom.room}`;
}

async function connectToBuzzerServer() {
  if (!location.protocol.startsWith("http")) return; // opened as a file: no server

  try {
    buzzerRoom = await openRoom();
    buzzerState = await buzzerRequest("/api/state");
  } catch (error) {
    // The server may still be waking up (a free Render server sleeps when
    // nobody's used it for a while): keep trying for a couple of minutes.
    if (connectAttempts < 60) {
      connectAttempts += 1;
      setTimeout(connectToBuzzerServer, 2000);
    }
    return;
  }

  isBuzzerConnected = true;
  lastSeenBuzzId = buzzerState.buzzId;
  buzzerButton.hidden = false;
  homeBuzzerJoin.hidden = false;
  document.getElementById("home-player-link").hidden = false;

  sendTeamsToBuzzer();
  sendThemeToBuzzer();
  onTeamsChanged(sendTeamsToBuzzer); // teams.js — keep the phones' team list up to date
  renderBuzzerUi(false);
  unlockBuzzers(); // clears any old buzz; stays closed until a question opens
  sendQuestionToHostScreen(null);
  showHostScreenInfo();
  pollBuzzerServer();
}

// The server restarted and forgot this room: get a new one. The phones
// need the new link (shown in the Buzzers panel).
async function reopenRoom() {
  try {
    buzzerRoom = await openRoom();
    qrCodeMadeFor = "";
    sendTeamsToBuzzer();
    sendThemeToBuzzer();
    unlockBuzzers();
    showHostScreenInfo();
  } catch (error) {
    // Still offline; the next check tries again
  }
}

// Asks again only after the last answer arrives, so requests never pile up
async function pollBuzzerServer() {
  await checkForBuzz();
  setTimeout(pollBuzzerServer, BUZZER_POLL_MS);
}

async function checkForBuzz() {
  try {
    handleBuzzerState(await buzzerRequest("/api/state"));
    buzzerButton.classList.remove("is-offline");
  } catch (error) {
    buzzerButton.classList.add("is-offline");
    buzzerButtonText.textContent = "Buzzers offline";
    if (error.status === 404) await reopenRoom();
  }
}

function handleBuzzerState(state) {
  const isNewBuzz = state.locked && state.winner && state.buzzId !== lastSeenBuzzId;
  lastSeenBuzzId = state.buzzId;
  buzzerState = state;

  if (isNewBuzz) playBuzzSound(); // music.js

  // The clock only runs while a question is up and its answer isn't shown yet
  const buzzedTeamId = getBuzzedTeamId();
  if (!buzzedTeamId) {
    stopAnswerTimer();
  } else if (isNewBuzz && isQuestionAwaitingAnswer()) { // question-screen.js
    startAnswerTimer(buzzedTeamId);
  }

  renderBuzzerUi(isNewBuzz);
  handleBuzzersChanged(); // question-screen.js — pauses/resumes the question text
  handleFinalWagerServerState(state.finalWager); // final-wager.js — which teams have wagered
  if (typeof handleHostControl === "function") handleHostControl(state); // host-control.js — the host's phone controls
}

function sendTeamsToBuzzer() {
  if (!isBuzzerConnected) return;
  const teamList = getTeams().map(({ id, name, color }) => ({ id, name, color }));
  buzzerRequest("/api/teams", { method: "POST", body: JSON.stringify(teamList) }).catch(() => {});
}

// The theme color, so the players' and host's phones match the game (theme-picker.js)
function sendThemeToBuzzer() {
  if (!isBuzzerConnected) return;
  buzzerRequest("/api/theme", { method: "POST", body: JSON.stringify(gameTheme || {}) }).catch(() => {});
}

/* ---------- On screen ---------- */

function renderBuzzerUi(isNewBuzz) {
  const winner = getBuzzedTeamId() ? buzzerState.winner : null;
  const playerCount = buzzerState.players || 0;
  const playerText = `${playerCount} phone${playerCount === 1 ? "" : "s"} connected`;

  // Header button
  buzzerButton.classList.toggle("is-locked", Boolean(winner));
  buzzerButtonText.textContent = winner ? `${winner.name} buzzed` : `Code ${buzzerRoom.room} · ${playerCount}`;

  // "TEAM X BUZZED IN!" banner (the class makes room for it at the top of the screen)
  buzzAlert.hidden = !winner;
  document.body.classList.toggle("has-buzz-alert", Boolean(winner));
  if (winner) {
    buzzAlertTeam.textContent = winner.name;
    buzzAlert.style.setProperty("--team-color", winner.color);
    if (isNewBuzz) {
      buzzAlert.classList.remove("is-new");
      void buzzAlert.offsetWidth; // restart the pop-in animation
      buzzAlert.classList.add("is-new");
    }
  }
  highlightBuzzedTeam(getBuzzedTeamId()); // scoreboard.js — marks them on the ✓/✗ row

  // How to join, Jackbox-style: go to the site, type the code
  homeBuzzerUrl.textContent = location.host;
  homeBuzzerCode.textContent = buzzerRoom.room;
  buzzerJoinUrl.textContent = location.host;
  buzzerRoomCode.textContent = buzzerRoom.room;
  buzzerPlayerCount.textContent = playerText;
  if (!joinPanel.hidden) makeJoinQrCode(); // the code changes if the server had to make a new room
}

// QR code for the join link (needs the qrcodejs library, which loads from the internet)
function makeJoinQrCode() {
  const joinUrl = getJoinUrl();
  if (window.QRCode && qrCodeMadeFor !== joinUrl) {
    buzzerQrElement.innerHTML = "";
    new QRCode(buzzerQrElement, { text: joinUrl, width: 200, height: 200, colorDark: "#420b13", colorLight: "#ffffff" });
    qrCodeMadeFor = joinUrl;
  }
  buzzerQrElement.hidden = !qrCodeMadeFor;
}

// "Copy link", to paste into a group chat
async function copyJoinLink() {
  try {
    await navigator.clipboard.writeText(getJoinUrl());
    buzzerCopyButton.textContent = "Copied ✓";
  } catch (error) {
    buzzerCopyButton.textContent = "Couldn't copy";
  }
  setTimeout(() => { buzzerCopyButton.textContent = "Copy link"; }, 2000);
}

// The host screen's address and code, shown in the join panel
function showHostScreenInfo() {
  hostScreenUrl.textContent = getHostScreenUrl();
  hostScreenCode.textContent = buzzerRoom.hostCode;
  hostScreenInfo.hidden = false;
}

/* ---------- Join panel (QR code + link) ---------- */

function openJoinPanel() {
  makeJoinQrCode();
  joinPanel.hidden = false;
  joinPanelClose.focus({ preventScroll: true });
}

function closeJoinPanel() {
  joinPanel.hidden = true;
}

/* ---------- Buttons & keyboard ---------- */

buzzerButton.addEventListener("click", openJoinPanel);
homeBuzzerJoin.addEventListener("click", openJoinPanel);
joinPanelClose.addEventListener("click", closeJoinPanel);
joinPanel.addEventListener("click", (event) => { if (event.target === joinPanel) closeJoinPanel(); });
buzzAlertUnlock.addEventListener("click", unlockAfterWrongAnswer);
joinPanelUnlock.addEventListener("click", unlockAfterWrongAnswer);
buzzerCopyButton.addEventListener("click", copyJoinLink);

// Listens before the question card does ("true" = capture), so Esc on the
// join panel only closes the panel, not the question behind it
document.addEventListener("keydown", (event) => {
  if (!isBuzzerConnected) return;
  const isTyping = event.target.matches("input, textarea");

  if (event.key === "Escape" && !joinPanel.hidden) {
    event.stopImmediatePropagation();
    closeJoinPanel();
  }
  if ((event.key === "u" || event.key === "U") && !isTyping) unlockAfterWrongAnswer();
}, true);

connectToBuzzerServer();
