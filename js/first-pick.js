/* =========================================================
   first-pick.js — "Who goes first?" prize wheel.

   Opened with the "Who goes first?" button on the board (shown while
   nobody has the board, e.g. at the start of the game). The wheel has
   one slice per team, in their colour. The host presses SPIN: the
   wheel spins for several seconds, ticking as each slice passes the
   pointer, slows down, and stops on a random team, who gets the
   board (♛). LET'S PLAY closes it. SKIP closes it without picking,
   so the host can still hand out the board with the ♛ buttons.
   ========================================================= */

const firstPickElement = document.getElementById("first-pick");
const firstPickRound = document.getElementById("first-pick-round");
const firstPickWheelBox = document.getElementById("first-pick-teams");
const firstPickResult = document.getElementById("first-pick-result");
const firstPickSpinButton = document.getElementById("first-pick-spin");
const firstPickDoneButton = document.getElementById("first-pick-done");
const firstPickSkipButton = document.getElementById("first-pick-skip");

// The spin
const WHEEL_SPIN_MS = 8000;    // how long the wheel spins
const WHEEL_MIN_TURNS = 8;     // full turns before it stops (plus a random 0–3 more)
const WHEEL_RADIUS = 95;       // in the SVG's own units (it scales to fit)

let isFirstPickSpinning = false;
let firstPickRun = 0;     // bumps when the picker closes, so a spin in progress stops quietly
let wheelRotation = 0;    // degrees, clockwise; kept between spins
let wheelGroup = null;    // the part of the SVG that turns
let wheelTeams = [];      // the teams on the wheel, in slice order

/* ---------- Opening & closing ---------- */

function openFirstPicker() {
  if (getTeams().length < 2) return; // teams.js — nothing to pick between
  if (isQuestionScreenOpen) return;  // question-screen.js
  if (document.body.dataset.screen !== "game") return; // e.g. the host jumped somewhere else

  firstPickRound.textContent = gameState.currentRound;
  firstPickResult.textContent = "";
  firstPickSpinButton.hidden = false;
  firstPickSpinButton.textContent = "🎡 Spin the wheel";
  firstPickSpinButton.disabled = false;
  firstPickDoneButton.hidden = true;
  firstPickSkipButton.hidden = false;
  buildWheel();

  firstPickElement.hidden = false;
  void firstPickElement.offsetHeight; // lay out the closed state first so it fades in
  firstPickElement.classList.add("is-open");
  appElement.inert = true; // question-screen.js — the board can't be clicked behind it
  firstPickSpinButton.focus({ preventScroll: true });
}

function closeFirstPicker() {
  if (firstPickElement.hidden) return;
  firstPickRun += 1;
  isFirstPickSpinning = false;
  firstPickElement.classList.remove("is-open");
  firstPickElement.hidden = true;
  appElement.inert = false;
}

function isFirstPickerOpen() {
  return !firstPickElement.hidden;
}

/* ---------- Drawing the wheel ---------- */

const SVG_NS = "http://www.w3.org/2000/svg";

function svgElement(tag, attributes = {}) {
  const element = document.createElementNS(SVG_NS, tag);
  Object.entries(attributes).forEach(([name, value]) => element.setAttribute(name, value));
  return element;
}

// A point on the wheel's edge. Angles go clockwise from the top.
function wheelPoint(degrees, radius) {
  const radians = (degrees * Math.PI) / 180;
  return [radius * Math.sin(radians), -radius * Math.cos(radians)];
}

// Dark text on light slices, light text on dark ones
function textColorFor(hex) {
  const value = parseInt(String(hex).replace("#", ""), 16);
  const r = (value >> 16) & 255, g = (value >> 8) & 255, b = value & 255;
  return (0.299 * r + 0.587 * g + 0.114 * b) > 150 ? "#2a060b" : "#fff8ec";
}

function buildWheel() {
  wheelTeams = getTeams();
  const slice = 360 / wheelTeams.length;

  const svg = svgElement("svg", { viewBox: "-110 -118 220 228", class: "wheel", role: "img", "aria-label": "Prize wheel with every team" });
  wheelGroup = svgElement("g", { class: "wheel__spin" });

  wheelTeams.forEach((team, index) => {
    const start = index * slice;
    const end = start + slice;
    const [x1, y1] = wheelPoint(start, WHEEL_RADIUS);
    const [x2, y2] = wheelPoint(end, WHEEL_RADIUS);
    const largeArc = slice > 180 ? 1 : 0;
    wheelGroup.appendChild(svgElement("path", {
      d: `M0 0 L${x1} ${y1} A${WHEEL_RADIUS} ${WHEEL_RADIUS} 0 ${largeArc} 1 ${x2} ${y2} Z`,
      fill: team.color,
      class: "wheel__slice",
      "data-index": index,
    }));

    // The team's name, reading outward from the middle along the slice
    const middle = start + slice / 2;
    const name = team.name.length > 14 ? `${team.name.slice(0, 13)}…` : team.name;
    const label = svgElement("text", {
      x: 0,
      y: 0,
      // Names on the bottom half are flipped so they never read upside down
      transform: `rotate(${middle}) translate(0 ${-WHEEL_RADIUS * 0.58})${middle > 90 && middle < 270 ? " rotate(180)" : ""}`,
      class: "wheel__label",
      fill: textColorFor(team.color),
      "font-size": Math.max(8, Math.min(15, 130 / Math.max(name.length, 5), slice * 0.3)),
    });
    label.textContent = name;
    wheelGroup.appendChild(label);
  });

  // Gold rim with little studs, and the hub in the middle
  wheelGroup.appendChild(svgElement("circle", { r: WHEEL_RADIUS, class: "wheel__rim" }));
  for (let stud = 0; stud < 24; stud++) {
    const [x, y] = wheelPoint(stud * 15, WHEEL_RADIUS + 0.5);
    wheelGroup.appendChild(svgElement("circle", { cx: x, cy: y, r: 2.2, class: "wheel__stud" }));
  }
  svg.appendChild(wheelGroup);
  svg.appendChild(svgElement("circle", { r: 13, class: "wheel__hub" }));
  svg.appendChild(svgElement("circle", { r: 5, class: "wheel__hub-dot" }));

  // The pointer at the top (doesn't turn)
  svg.appendChild(svgElement("path", { d: "M-11 -116 L11 -116 L0 -88 Z", class: "wheel__pointer" }));

  firstPickWheelBox.innerHTML = "";
  firstPickWheelBox.appendChild(svg);
  setWheelRotation(wheelRotation);
}

function setWheelRotation(degrees) {
  wheelRotation = degrees;
  if (wheelGroup) wheelGroup.setAttribute("transform", `rotate(${degrees})`);
}

// Which slice is under the pointer at this rotation
function sliceAtPointer(degrees) {
  const slice = 360 / wheelTeams.length;
  const angleOnWheel = ((-degrees % 360) + 360) % 360;
  return Math.floor(angleOnWheel / slice) % wheelTeams.length;
}

/* ---------- Spinning ---------- */

// Fast at first, then a long, gentle slow-down
function easeOutQuart(t) {
  return 1 - Math.pow(1 - t, 4);
}

async function spinFirstPicker() {
  if (isFirstPickSpinning || wheelTeams.length < 2) return;

  const run = firstPickRun;
  isFirstPickSpinning = true;
  firstPickSpinButton.disabled = true;
  firstPickDoneButton.hidden = true;
  firstPickSkipButton.hidden = true;
  firstPickResult.textContent = "";
  firstPickWheelBox.querySelectorAll(".wheel__slice").forEach((path) => path.classList.remove("is-picked"));

  // Where it stops: somewhere inside the picked team's slice (not always dead centre)
  const pickedIndex = Math.floor(Math.random() * wheelTeams.length);
  const slice = 360 / wheelTeams.length;
  const target = (pickedIndex + 0.5 + (Math.random() - 0.5) * 0.7) * slice;
  const turns = WHEEL_MIN_TURNS + Math.floor(Math.random() * 4);
  const startRotation = wheelRotation;
  const currentAngle = ((startRotation % 360) + 360) % 360;
  const extra = ((360 - target - currentAngle) % 360 + 360) % 360;
  const endRotation = startRotation + turns * 360 + extra;

  if (prefersReducedMotion) { // main.js
    setWheelRotation(endRotation);
  } else {
    await new Promise((resolve) => {
      const startTime = performance.now();
      let lastSlice = sliceAtPointer(startRotation);
      const frame = (now) => {
        if (run !== firstPickRun) { resolve(); return; } // closed mid-spin
        const t = Math.min(1, (now - startTime) / WHEEL_SPIN_MS);
        setWheelRotation(startRotation + (endRotation - startRotation) * easeOutQuart(t));

        // Tick each time a new slice passes the pointer
        const current = sliceAtPointer(wheelRotation);
        if (current !== lastSlice) {
          lastSlice = current;
          playCountdownTick(false); // sound-effects.js
          firstPickWheelBox.classList.remove("is-ticking");
          void firstPickWheelBox.offsetWidth; // restart the pointer flick
          firstPickWheelBox.classList.add("is-ticking");
        }
        if (t < 1) requestAnimationFrame(frame);
        else resolve();
      };
      requestAnimationFrame(frame);
    });
    if (run !== firstPickRun) return;
  }

  // Landed
  const team = wheelTeams[sliceAtPointer(wheelRotation)];
  const pickedSlice = firstPickWheelBox.querySelector(`.wheel__slice[data-index="${sliceAtPointer(wheelRotation)}"]`);
  if (pickedSlice) pickedSlice.classList.add("is-picked");
  playCategoryChosenSound(); // sound-effects.js
  setBoardTeam(team.id);     // teams.js — they get the ♛
  firstPickResult.textContent = `${team.name} goes first!`;
  firstPickResult.style.setProperty("--team-color", team.color);

  isFirstPickSpinning = false;
  firstPickSpinButton.disabled = false;
  firstPickSpinButton.textContent = "🎡 Spin again";
  firstPickDoneButton.hidden = false;
  firstPickDoneButton.focus({ preventScroll: true });
}

/* ---------- Buttons & keyboard ---------- */

firstPickSpinButton.addEventListener("click", spinFirstPicker);
firstPickDoneButton.addEventListener("click", closeFirstPicker);
firstPickSkipButton.addEventListener("click", closeFirstPicker);
document.getElementById("first-pick-open").addEventListener("click", openFirstPicker);

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && isFirstPickerOpen() && !isFirstPickSpinning) closeFirstPicker();
});
