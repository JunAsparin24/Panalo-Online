/* =========================================================
   game-setup.js — The SET UP GAME screen, where the host
   types in all the categories and questions.

   Four tabs:
     ROUND 1 / ROUND 2  five categories × five questions + answers
     FINAL WAGER        any number of categories, each with one or
                        more questions (one is picked at random)
     THEME              the color wheel: the color of the whole game
                        and the phones (theme-picker.js)

   Everything saves by itself as you type (questions.js keeps it
   in this browser). SAVE TO FILE / LOAD FILE move a whole game
   to another computer or browser, or keep a few games ready.

   Opened from the home screen ("Set up game"), and also when
   Start Game is pressed while the board still has empty boxes.
   ========================================================= */

const gameSetupElement = document.getElementById("game-setup");
const gameSetupTabs = [...document.querySelectorAll(".game-setup__tab")];
const gameSetupNotice = document.getElementById("game-setup-notice");
const gameSetupHint = document.getElementById("game-setup-hint");
const gameSetupBody = document.getElementById("game-setup-body");
const gameSetupStatus = document.getElementById("game-setup-status");
const gameSetupClearButton = document.getElementById("game-setup-clear");
const gameSetupFileInput = document.getElementById("game-setup-file");

const setupPictureInput = document.getElementById("game-setup-picture-file");

const SETUP_CONFIRM_MS = 3000; // how long a "Sure?" button waits for the second click
const SETUP_PICTURE_MAX_SIZE = 800; // pictures are shrunk to this many pixels on their longest side

let gameSetupTab = "round1"; // "round1", "round2", "finalWager" or "theme"
let gameSetupStatusTimer = null;
let setupPictureTarget = null; // the question whose "Add picture" button was clicked

const SETUP_HINTS = {
  round1: "Five categories, five questions each. Type each category's name at the top of its column. Any question can have a picture: click Add picture, drag one in, or paste one.",
  round2: "Same as Round 1 (pictures too), but every question is worth double.",
  theme: "Pick a color for the whole game. Everything changes as you pick, so you can see how it looks.",
  finalWager: "One category is picked at random during the game, then one of its questions at random. Give each category at least one question.",
};

/* =========================================================
   OPENING & CLOSING
   ========================================================= */

// notice (optional): a message shown at the top, e.g. why it opened
function openGameSetup(notice = "") {
  gameSetupNotice.textContent = notice;
  gameSetupNotice.hidden = !notice;

  // Start on the first round that still has empty boxes
  if (notice) gameSetupTab = countEmptyBoardBoxes(0) > 0 || countEmptyBoardBoxes(1) === 0 ? "round1" : "round2";

  renderGameSetup();
  gameSetupElement.hidden = false;
  void gameSetupElement.offsetHeight; // lay out the closed state first so it fades in
  gameSetupElement.classList.add("is-open");
  appElement.inert = true; // question-screen.js
  focusFirstEmptySetupBox();
}

function closeGameSetup() {
  gameSetupElement.classList.remove("is-open");
  gameSetupElement.hidden = true;
  appElement.inert = false;
  resetConfirmButton(gameSetupClearButton);
  fillHomeStats(); // main.js
}

function focusFirstEmptySetupBox() {
  const boxes = [...gameSetupBody.querySelectorAll("input, textarea")];
  const target = boxes.find((box) => !box.value.trim()) || boxes[0];
  if (target) target.focus({ preventScroll: false });
}

/* =========================================================
   DRAWING
   ========================================================= */

function renderGameSetup() {
  gameSetupTabs.forEach((tab) => {
    const isCurrent = tab.dataset.tab === gameSetupTab;
    tab.classList.toggle("is-current", isCurrent);
    tab.setAttribute("aria-selected", String(isCurrent));
  });
  gameSetupHint.textContent = SETUP_HINTS[gameSetupTab];

  // The THEME tab has its own panel (theme-picker.js) instead of boxes
  const isTheme = gameSetupTab === "theme";
  gameSetupBody.hidden = isTheme;
  document.getElementById("game-setup-theme").hidden = !isTheme;

  gameSetupBody.innerHTML = "";
  gameSetupBody.scrollTop = 0;
  if (gameSetupTab === "round1") gameSetupBody.appendChild(buildBoardEditor(0));
  if (gameSetupTab === "round2") gameSetupBody.appendChild(buildBoardEditor(1));
  if (gameSetupTab === "finalWager") gameSetupBody.appendChild(buildFinalWagerEditor());

  updateGameSetupTabCounts();
}

// The little count on each tab: how much is filled in
function updateGameSetupTabCounts() {
  gameSetupTabs.forEach((tab) => {
    const count = tab.querySelector(".game-setup__tab-count");
    const { tab: name } = tab.dataset;
    let text = "";
    let isDone = false;

    if (name === "round1" || name === "round2") {
      const empty = countEmptyBoardBoxes(name === "round1" ? 0 : 1);
      isDone = empty === 0;
      text = isDone ? "✓ Ready" : `${empty} empty`;
    } else if (name === "finalWager") {
      const total = finalWagerQuestions.reduce((sum, category) => sum + category.questions.length, 0);
      isDone = total > 0;
      text = isDone ? `${total} question${total === 1 ? "" : "s"}` : "Skipped";
    } else {
      // THEME: a dot in the picked color (theme-picker.js)
      count.textContent = "";
      const swatch = document.createElement("span");
      swatch.className = "game-setup__tab-swatch";
      swatch.style.background = themeColorCss(gameTheme); // theme.js
      count.append(swatch, gameTheme ? "Custom" : "Red");
      return;
    }

    count.textContent = text;
    count.classList.toggle("is-done", isDone);
  });
}

/* ---------- Round 1 / Round 2 ---------- */

function buildBoardEditor(roundIndex) {
  const grid = document.createElement("div");
  grid.className = "setup-board";

  gameSetup.rounds[roundIndex].forEach((category, categoryIndex) => {
    const column = document.createElement("div");
    column.className = "setup-board__column";

    column.appendChild(createSetupBox({
      className: "setup-category-name",
      value: category.name,
      placeholder: `Category ${categoryIndex + 1}`,
      label: `Round ${roundIndex + 1}, category ${categoryIndex + 1} name`,
      maxLength: 40,
      onInput: (value) => { category.name = value; },
    }));

    category.questions.forEach((item, questionIndex) => {
      const value = formatMoney(ROUND_VALUES[roundIndex][questionIndex]); // board.js
      const card = document.createElement("div");
      card.className = "setup-card";

      const valueLabel = document.createElement("span");
      valueLabel.className = "setup-card__value";
      valueLabel.textContent = value;

      const where = `Category ${categoryIndex + 1} for ${value}`;
      card.append(
        valueLabel,
        createSetupBox({
          multiline: true,
          value: item.question,
          placeholder: item.image ? "Question (optional with a picture)" : "Question",
          label: `${where}: question`,
          onInput: (text) => { item.question = text; },
        }),
        createPictureControl(item, where),
        createSetupBox({
          className: "setup-answer",
          value: item.answer,
          placeholder: "Answer",
          label: `${where}: answer`,
          onInput: (text) => { item.answer = text; },
        }),
      );
      allowPictureDrop(card, item);
      column.appendChild(card);
    });

    grid.appendChild(column);
  });

  return grid;
}

/* ---------- Pictures (board questions) ----------
   A picture can be added three ways: the "Add picture" button,
   dragging a picture file onto the question's box, or copying a
   picture and pasting it (Ctrl+V) into the question's box.
   Pictures are shrunk (SETUP_PICTURE_MAX_SIZE) before they're
   saved, so plenty of them fit in the browser's storage. */

// "Add picture" button, or the picture with a × to remove it
function createPictureControl(item, where) {
  const control = document.createElement("div");
  control.className = "setup-picture";

  if (!item.image) {
    const addButton = document.createElement("button");
    addButton.type = "button";
    addButton.className = "setup-picture__add";
    addButton.textContent = "🖼️ Add picture";
    addButton.title = "Or drag a picture here, or paste one (Ctrl+V)";
    addButton.addEventListener("click", () => {
      setupPictureTarget = item;
      setupPictureInput.click();
    });
    control.appendChild(addButton);
    return control;
  }

  const picture = document.createElement("img");
  picture.className = "setup-picture__thumb";
  picture.src = item.image;
  picture.alt = `Picture for ${where}`;

  const removeButton = document.createElement("button");
  removeButton.type = "button";
  removeButton.className = "setup-remove setup-remove--small setup-picture__remove";
  removeButton.textContent = "×";
  removeButton.title = "Remove picture";
  removeButton.setAttribute("aria-label", `Remove the picture for ${where}`);
  removeButton.addEventListener("click", () => {
    item.image = "";
    handleSetupChanged();
    rerenderGameSetup();
  });

  control.append(picture, removeButton);
  return control;
}

// Dropping or pasting a picture onto a question's box adds it to that question
function allowPictureDrop(card, item) {
  const hasFiles = (event) => [...event.dataTransfer.types].includes("Files");
  card.addEventListener("dragover", (event) => {
    if (!hasFiles(event)) return;
    event.preventDefault();
    card.classList.add("is-drop-target");
  });
  card.addEventListener("dragleave", (event) => {
    if (!card.contains(event.relatedTarget)) card.classList.remove("is-drop-target");
  });
  card.addEventListener("drop", (event) => {
    if (!hasFiles(event)) return;
    event.preventDefault();
    card.classList.remove("is-drop-target");
    addPictureToQuestion(item, event.dataTransfer.files[0]);
  });
  card.addEventListener("paste", (event) => {
    const file = [...event.clipboardData.files].find((pasted) => pasted.type.startsWith("image/"));
    if (!file) return; // plain text pastes as normal
    event.preventDefault();
    addPictureToQuestion(item, file);
  });
}

async function addPictureToQuestion(item, file) {
  if (!file) return;
  if (!file.type.startsWith("image/")) {
    showSetupStatus("That file isn't a picture");
    return;
  }
  try {
    item.image = await shrinkPicture(file);
  } catch (error) {
    showSetupStatus("That picture couldn't be opened");
    return;
  }
  handleSetupChanged();
  rerenderGameSetup();
}

// Picture file → a small "data:" picture that can be saved as text
async function shrinkPicture(file) {
  const fileUrl = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = fileUrl;
    await image.decode();

    // Some SVG files have no size of their own
    const width = image.naturalWidth || SETUP_PICTURE_MAX_SIZE;
    const height = image.naturalHeight || SETUP_PICTURE_MAX_SIZE;
    const scale = Math.min(1, SETUP_PICTURE_MAX_SIZE / Math.max(width, height));

    const canvas = document.createElement("canvas");
    canvas.width = Math.round(width * scale);
    canvas.height = Math.round(height * scale);
    canvas.getContext("2d").drawImage(image, 0, 0, canvas.width, canvas.height);

    // WebP keeps see-through parts (logos, flags) and stays small
    const picture = canvas.toDataURL("image/webp", 0.82);
    return picture.startsWith("data:image/webp") ? picture : canvas.toDataURL("image/png");
  } finally {
    URL.revokeObjectURL(fileUrl);
  }
}

/* ---------- Final Wager ---------- */

function buildFinalWagerEditor() {
  const list = document.createElement("div");
  list.className = "setup-list";

  gameSetup.finalWager.forEach((category, categoryIndex) => {
    const block = document.createElement("section");
    block.className = "setup-block";

    const head = document.createElement("div");
    head.className = "setup-block__head";
    head.append(
      createSetupBox({
        className: "setup-category-name",
        value: category.name,
        placeholder: `Category ${categoryIndex + 1}`,
        label: `Final Wager category ${categoryIndex + 1} name`,
        maxLength: 40,
        onInput: (value) => { category.name = value; },
      }),
      createRemoveButton("Remove category", () => {
        gameSetup.finalWager.splice(categoryIndex, 1);
      }, hasAnyText(category)),
    );
    block.appendChild(head);

    category.questions.forEach((item, questionIndex) => {
      const row = document.createElement("div");
      row.className = "setup-row";

      const number = document.createElement("span");
      number.className = "setup-row__number";
      number.textContent = questionIndex + 1;

      row.append(
        number,
        createSetupBox({
          multiline: true,
          value: item.question,
          placeholder: "Question",
          label: `Final Wager category ${categoryIndex + 1}, question ${questionIndex + 1}`,
          onInput: (text) => { item.question = text; },
        }),
        createSetupBox({
          className: "setup-answer",
          value: item.answer,
          placeholder: "Answer",
          label: `Final Wager category ${categoryIndex + 1}, answer ${questionIndex + 1}`,
          onInput: (text) => { item.answer = text; },
        }),
        createRemoveButton("×", () => { category.questions.splice(questionIndex, 1); }, false, "Remove this question"),
      );
      block.appendChild(row);
    });

    block.appendChild(createAddButton("+ Add question", () => {
      category.questions.push({ question: "", answer: "" });
    }));
    list.appendChild(block);
  });

  list.appendChild(createAddButton("+ Add category", () => {
    gameSetup.finalWager.push(createEmptyFinalWagerCategory());
  }, "setup-add--big"));
  return list;
}

/* ---------- Building blocks ---------- */

// A text box that saves as you type
function createSetupBox({ multiline = false, className = "", value, placeholder, label, maxLength, onInput }) {
  const box = document.createElement(multiline ? "textarea" : "input");
  box.className = `setup-box ${className}`.trim();
  if (multiline) box.rows = 2;
  else box.type = "text";
  if (maxLength) box.maxLength = maxLength;
  box.value = value;
  box.placeholder = placeholder;
  box.setAttribute("aria-label", label);
  box.addEventListener("input", () => {
    onInput(box.value);
    handleSetupChanged();
  });
  return box;
}

function createAddButton(text, onClick, extraClass = "") {
  const button = document.createElement("button");
  button.type = "button";
  button.className = `setup-add ${extraClass}`.trim();
  button.textContent = text;
  button.addEventListener("click", () => {
    onClick();
    handleSetupChanged();
    rerenderGameSetup();
  });
  return button;
}

// Redraws the tab after something was added or removed, staying at the same spot
function rerenderGameSetup() {
  const scroll = gameSetupBody.scrollTop;
  renderGameSetup();
  gameSetupBody.scrollTop = scroll;
}

// needsConfirm: something's typed in it, so ask "Sure?" first
function createRemoveButton(text, onRemove, needsConfirm, label = text) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = text === "×" ? "setup-remove setup-remove--small" : "setup-remove";
  button.textContent = text;
  button.title = label;
  button.setAttribute("aria-label", label);
  button.addEventListener("click", () => {
    if (needsConfirm && !askToConfirm(button, "Sure? Click again")) return;
    onRemove();
    handleSetupChanged();
    rerenderGameSetup();
  });
  return button;
}

// Two-click buttons: the first click changes the label and returns false;
// a second click within a few seconds returns true
function askToConfirm(button, confirmText) {
  if (button.classList.contains("is-confirming")) {
    resetConfirmButton(button);
    return true;
  }
  button.dataset.originalText = button.textContent;
  button.textContent = confirmText;
  button.classList.add("is-confirming");
  button.confirmTimer = setTimeout(() => resetConfirmButton(button), SETUP_CONFIRM_MS);
  return false;
}

function resetConfirmButton(button) {
  clearTimeout(button.confirmTimer);
  if (!button.classList.contains("is-confirming")) return;
  button.classList.remove("is-confirming");
  button.textContent = button.dataset.originalText;
}

function hasAnyText(value) {
  if (typeof value === "string") return value.trim() !== "";
  if (Array.isArray(value)) return value.some(hasAnyText);
  if (value && typeof value === "object") return Object.values(value).some(hasAnyText);
  return false;
}

/* =========================================================
   SAVING
   ========================================================= */

function handleSetupChanged() {
  const isSaved = saveGameSetup(); // questions.js
  updateGameSetupTabCounts();
  if (isSaved) {
    showSetupStatus("Saved ✓");
  } else {
    // Usually too many pictures for the browser's storage. The game still
    // works until the page is closed, and Save to file keeps everything.
    showSetupStatus("Not saved: storage is full. Remove some pictures, or use Save to file", true);
  }
}

function showSetupStatus(text, isProblem = false) {
  gameSetupStatus.textContent = text;
  gameSetupStatus.classList.toggle("is-problem", isProblem);
  gameSetupStatus.classList.add("is-visible");
  clearTimeout(gameSetupStatusTimer);
  gameSetupStatusTimer = setTimeout(() => gameSetupStatus.classList.remove("is-visible"), isProblem ? 6000 : 1800);
}

// Downloads the whole setup as a file
function saveSetupToFile() {
  const file = new Blob([JSON.stringify(gameSetup, null, 2)], { type: "application/json" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(file);
  link.download = "trivia-night-questions.json";
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(link.href), 1000);
  showSetupStatus("Saved to your Downloads");
}

async function loadSetupFromFile(file) {
  if (!file) return;
  try {
    gameSetup = normalizeGameSetup(JSON.parse(await file.text())); // questions.js
    saveGameSetup();
    renderGameSetup();
    showSetupStatus(`Loaded ${file.name}`);
  } catch (error) {
    showSetupStatus("That file couldn't be read");
  }
  gameSetupFileInput.value = ""; // so the same file can be loaded again
}

function clearWholeSetup() {
  if (!askToConfirm(gameSetupClearButton, "Really clear everything?")) return;
  gameSetup = createEmptySetup(); // questions.js
  saveGameSetup();
  renderGameSetup();
  showSetupStatus("Cleared");
}

// The ready-made game (example-game.js). Asks first if it would replace questions.
function loadExampleGame() {
  const button = document.getElementById("game-setup-example");
  if (hasAnyText(gameSetup) && !askToConfirm(button, "Replace your questions?")) return;
  gameSetup = normalizeGameSetup(createExampleSetup()); // questions.js
  const saved = saveGameSetup();
  gameSetupTab = "round1";
  renderGameSetup();
  if (saved) showSetupStatus("Example game loaded. Press Start Game, or change anything you like");
  else handleSetupChanged();
}

/* =========================================================
   BUTTONS & KEYBOARD
   ========================================================= */

document.getElementById("game-setup-open").addEventListener("click", () => openGameSetup());
document.getElementById("game-setup-done").addEventListener("click", closeGameSetup);
document.getElementById("game-setup-start").addEventListener("click", () => {
  closeGameSetup();
  handleStartGame(true); // main.js — start even if some boxes are empty
});
document.getElementById("game-setup-save").addEventListener("click", saveSetupToFile);
document.getElementById("game-setup-load").addEventListener("click", () => gameSetupFileInput.click());
gameSetupFileInput.addEventListener("change", () => loadSetupFromFile(gameSetupFileInput.files[0]));
gameSetupClearButton.addEventListener("click", clearWholeSetup);
document.getElementById("game-setup-example").addEventListener("click", loadExampleGame);
setupPictureInput.addEventListener("change", () => {
  if (setupPictureTarget) addPictureToQuestion(setupPictureTarget, setupPictureInput.files[0]);
  setupPictureTarget = null;
  setupPictureInput.value = ""; // so the same picture can be picked again
});

gameSetupTabs.forEach((tab) => {
  tab.addEventListener("click", () => {
    gameSetupTab = tab.dataset.tab;
    renderGameSetup();
  });
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && !gameSetupElement.hidden) closeGameSetup();
});
