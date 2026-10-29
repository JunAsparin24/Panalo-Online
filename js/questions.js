/* =========================================================
   questions.js — Where the game's questions come from.

   There are no questions written in here any more: the host
   types them in on the SET UP GAME screen (game-setup.js),
   and they're saved in this browser (localStorage), so they're
   still there next time the game opens.

   This file keeps what the host typed (gameSetup) and turns it
   into the two lists the rest of the game reads:
     gameData             — the board: round1, round2
     finalWagerQuestions  — Final Wager categories

   Board values are fixed (see ROUND_VALUES): Round 1 is $100–$500
   and Round 2 is $200–$1,000, five categories of five questions.
   ========================================================= */

const FINAL_WAGER_SECONDS = 60; // time to write the Final Wager answer

const SETUP_STORAGE_KEY = "panalo-game-setup";

// One list of row values per round. The board is 5 × 5 in each round.
const ROUND_VALUES = [
  [100, 200, 300, 400, 500],
  [200, 400, 600, 800, 1000],
];
const BOARD_CATEGORY_COUNT = 5;

// Filled in by applyGameSetup() — the rest of the game reads these
const gameData = {};
const finalWagerQuestions = [];

// Exactly what the host typed (blank boxes included)
let gameSetup = loadGameSetup();
applyGameSetup();

/* ---------- Empty setups ---------- */

function createEmptyBoardRound(roundIndex) {
  return Array.from({ length: BOARD_CATEGORY_COUNT }, () => ({
    name: "",
    // image: a picture as a "data:" text (see game-setup.js), or "" for none
    questions: ROUND_VALUES[roundIndex].map(() => ({ question: "", answer: "", image: "" })),
  }));
}

function createEmptyFinalWagerCategory() {
  return { name: "", questions: [{ question: "", answer: "" }] };
}

function createEmptySetup() {
  return {
    rounds: ROUND_VALUES.map((_, roundIndex) => createEmptyBoardRound(roundIndex)),
    finalWager: [createEmptyFinalWagerCategory()],
  };
}

/* ---------- Saving & loading ---------- */

function loadGameSetup() {
  try {
    const saved = localStorage.getItem(SETUP_STORAGE_KEY);
    if (saved) return normalizeGameSetup(JSON.parse(saved));
  } catch (error) {
    // Nothing saved yet, or it couldn't be read: start empty
  }
  return createEmptySetup();
}

// Saves the host's setup and rebuilds the game's question lists.
// Returns false if it couldn't be saved (storage full, private window…);
// the game still works with it until the page is closed.
function saveGameSetup() {
  applyGameSetup();
  try {
    localStorage.setItem(SETUP_STORAGE_KEY, JSON.stringify(gameSetup));
    return true;
  } catch (error) {
    return false;
  }
}

// Makes any saved or loaded setup the right shape (missing parts become blank),
// so a file from an older version, or a hand-edited one, can't break the game
function normalizeGameSetup(raw) {
  const text = (value) => (typeof value === "string" ? value : value == null ? "" : String(value));
  const list = (value) => (Array.isArray(value) ? value : []);
  const empty = createEmptySetup();
  const source = raw && typeof raw === "object" ? raw : {};

  const rounds = empty.rounds.map((emptyRound, roundIndex) => {
    const savedRound = list(list(source.rounds)[roundIndex]);
    return emptyRound.map((emptyCategory, categoryIndex) => {
      const savedCategory = savedRound[categoryIndex] || {};
      return {
        name: text(savedCategory.name),
        questions: emptyCategory.questions.map((_, questionIndex) => {
          const savedQuestion = list(savedCategory.questions)[questionIndex] || {};
          return {
            question: text(savedQuestion.question),
            answer: text(savedQuestion.answer),
            image: text(savedQuestion.image),
          };
        }),
      };
    });
  });

  const finalWager = list(source.finalWager).map((category) => ({
    name: text(category && category.name),
    questions: list(category && category.questions).map((item) => ({
      question: text(item && item.question),
      answer: text(item && item.answer),
    })),
  }));

  return { rounds, finalWager };
}

/* ---------- Turning the setup into game data ---------- */

function applyGameSetup() {
  // The board: every box is kept (a blank one still shows up as a tile)
  Object.keys(gameData).forEach((key) => delete gameData[key]);
  gameSetup.rounds.forEach((round, roundIndex) => {
    gameData[`round${roundIndex + 1}`] = {
      categories: round.map((category, categoryIndex) => ({
        name: category.name.trim() || `Category ${categoryIndex + 1}`,
        questions: category.questions.map((item, questionIndex) => ({
          value: ROUND_VALUES[roundIndex][questionIndex],
          question: item.question.trim(),
          answer: item.answer.trim(),
          image: item.image || null, // shown on the question card (question-screen.js)
          special: false,
        })),
      })),
    };
  });

  // Final Wager: only questions that have been written, only categories that have one
  const wagerCategories = gameSetup.finalWager
    .map((category, index) => ({
      name: category.name.trim() || `Category ${index + 1}`,
      questions: category.questions
        .filter((item) => item.question.trim())
        .map((item) => ({ question: item.question.trim(), answer: item.answer.trim() })),
    }))
    .filter((category) => category.questions.length > 0);
  finalWagerQuestions.splice(0, finalWagerQuestions.length, ...wagerCategories);
}

/* ---------- What's still missing ---------- */

// How many board boxes (category names, questions, answers) are still blank,
// in one round (0 = Round 1) or, without a roundIndex, the whole board
function countEmptyBoardBoxes(roundIndex = null) {
  const rounds = roundIndex === null ? gameSetup.rounds : [gameSetup.rounds[roundIndex]];
  let empty = 0;
  rounds.forEach((round) => round.forEach((category) => {
    if (!category.name.trim()) empty += 1;
    category.questions.forEach((item) => {
      if (!item.question.trim() && !item.image) empty += 1; // a picture can be the whole question
      if (!item.answer.trim()) empty += 1;
    });
  }));
  return empty;
}
