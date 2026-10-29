/* =========================================================
   host-control.js — Lets the host's phone (/host) steer the game.

   From the "Game controls" section on the host screen, the host can:
     - jump to any round or Final Wager
     - choose the Final Wager category, and even the exact question
       (or go back to a random pick)

   The phone sends a command to the buzzer server; this file picks
   it up on the next check-in (buzzer-host.js) and runs it. It also
   tells the phone what's on screen right now.

   Only works when the game runs through the buzzer server.
   ========================================================= */

// The Final Wager pick chosen on the host's phone, or null for a random pick.
// { categoryIndex, questionIndex } — questionIndex null = any question in that category.
// final-wager.js reads this.
let hostFinalWagerPick = null;

let lastHostCommandSeq = null; // the last command already run
let isFetchingHostCommands = false;
let lastControlInfoKey = "";

/* ---------- Called by buzzer-host.js on every check-in ---------- */

function handleHostControl(state) {
  if (!isBuzzerConnected) return; // buzzer-host.js
  publishControlInfo();

  const seq = state.commandSeq || 0;
  if (lastHostCommandSeq === null) {
    lastHostCommandSeq = seq; // ignore anything sent before the game opened
    return;
  }
  if (seq > lastHostCommandSeq && !isFetchingHostCommands) fetchHostCommands();
}

async function fetchHostCommands() {
  isFetchingHostCommands = true;
  try {
    const { commands } = await buzzerRequest(`/api/commands?after=${lastHostCommandSeq}`); // buzzer-host.js
    for (const command of commands || []) {
      lastHostCommandSeq = Math.max(lastHostCommandSeq, command.id);
      await runHostCommand(command);
    }
  } catch (error) {
    // Try again on the next check-in
  }
  isFetchingHostCommands = false;
}

async function runHostCommand(command) {
  if (command.action === "goto") {
    if (command.target === "round") await jumpToRound(command.round);
    if (command.target === "finalWager") await jumpToFinalWager();
  } else if (command.action === "fwPick") {
    setHostFinalWagerPick(command.categoryIndex, command.questionIndex);
  } else if (command.action === "fwRandom") {
    hostFinalWagerPick = null;
  }
  publishControlInfo();
}

/* ---------- Jumping around ---------- */

// Closes anything that's open on top of the current screen
async function leaveCurrentScreen() {
  clearTimeout(roundEndTimer); // main.js
  closeFirstPicker();          // first-pick.js
  resetMenuButton();           // main.js
  if (isQuestionScreenOpen) await closeQuestionScreen(false); // question-screen.js — goes back on the board
  if (gameState.activeQuestion) cancelActiveQuestion();      // e.g. mid Golden Boost reveal
  document.getElementById("golden-boost").hidden = true;
  while (isTransitioning) await wait(50); // main.js — let any wipe finish first
}

async function jumpToRound(roundNumber) {
  if (!(roundNumber >= 1 && roundNumber <= getTotalRounds())) return; // game.js
  const isFromMenu = document.body.dataset.screen === "home";
  await leaveCurrentScreen();

  isTransitioning = true;
  playSong("game"); // music.js
  if (isFromMenu) resetScores(); // teams.js — a fresh game; otherwise scores carry over
  resetFinalWager(); // final-wager.js
  sendQuestionToHostScreen(null); // buzzer-host.js

  gameState.currentRound = roundNumber;
  gameState.activeQuestion = null;
  resetQuestionStates(); // game.js — a fresh board for that round
  await playRoundIntro(); // main.js — "ROUND 2" wipe, rules, then the board
  isTransitioning = false;
}

async function jumpToFinalWager() {
  if (!hasFinalWager()) return; // final-wager.js — no questions set up
  await leaveCurrentScreen();
  playSong("game");
  sendQuestionToHostScreen(null);
  await showFinalWagerScreen(); // main.js
}

/* ---------- Final Wager pick ---------- */

function setHostFinalWagerPick(categoryIndex, questionIndex) {
  const category = finalWagerQuestions[categoryIndex]; // questions.js
  if (!category) return;
  const hasQuestion = questionIndex !== null && questionIndex !== undefined && category.questions[questionIndex];
  hostFinalWagerPick = { categoryIndex, questionIndex: hasQuestion ? questionIndex : null };

  if (!finalWager) return; // used when Final Wager starts (final-wager.js)
  if (hasQuestion) finalWager.questionPicks[categoryIndex] = questionIndex;

  if (finalWager.step === "category" && !finalWager.isPicking) {
    pickRandomFinalWagerCategory(categoryIndex); // the spin lands on the host's choice
  } else if (finalWager.step === "wager") {
    chooseFinalWagerCategory(categoryIndex); // swap it (teams re-enter their wagers)
  }
  // Once the question is showing, it's too late to change
}

/* ---------- Telling the phone what's on screen ---------- */

function publishControlInfo() {
  const chosenIndex = finalWager && finalWager.categoryIndex !== null ? finalWager.categoryIndex : null;
  const info = {
    screen: document.body.dataset.screen,
    round: gameState.currentRound,
    totalRounds: getTotalRounds(),
    busy: isTransitioning,
    finalWager: {
      step: finalWager ? finalWager.step : null,
      picking: Boolean(finalWager && finalWager.isPicking),
      chosen: chosenIndex === null ? null : { categoryIndex: chosenIndex, questionIndex: finalWager.questionPicks[chosenIndex] },
      preset: hostFinalWagerPick,
      categories: finalWagerQuestions.map((category) => ({
        name: category.name,
        questions: category.questions.map(({ question, answer }) => ({ question, answer })),
      })),
    },
  };

  const key = JSON.stringify(info);
  if (key === lastControlInfoKey) return;
  lastControlInfoKey = key;
  buzzerRequest("/api/control", { method: "POST", body: key }).catch(() => { lastControlInfoKey = ""; }); // buzzer-host.js
}
