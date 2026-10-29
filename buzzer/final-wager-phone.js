/* =========================================================
   final-wager-phone.js — Final Wager on the players' phones.

   Once the host picks the category, each team types how much
   it wants to wager (up to the points it has) and locks it in.
   It can change it until the host shows the question. Nobody
   else sees the amount — the laptop only shows "locked in"
   until the host reveals it.

   buzzer.js calls renderFinalWagerPhone() on every check-in.
   ========================================================= */

const fwScreen = document.getElementById("fw-screen");
const fwCategory = document.getElementById("fw-phone-category");
const fwForm = document.getElementById("fw-form");
const fwLimit = document.getElementById("fw-limit");
const fwAmount = document.getElementById("fw-amount");
const fwSubmit = document.getElementById("fw-submit");
const fwStatus = document.getElementById("fw-phone-status");

let fwMyWager = null;      // what this phone locked in (only this phone knows)
let fwCategoryShown = null; // a new category = a new wager

// finalWager: the server's Final Wager state, or null when it isn't on
function renderFinalWagerPhone(finalWager) {
  fwScreen.hidden = !finalWager;
  if (!finalWager) return;

  if (finalWager.category !== fwCategoryShown) {
    fwCategoryShown = finalWager.category;
    fwMyWager = null;
    fwAmount.value = "";
  }

  const max = Math.max(0, Number((finalWager.maxes || {})[myTeamId]) || 0);
  const isLockedIn = (finalWager.lockedTeamIds || []).includes(myTeamId);
  const canWager = finalWager.phase === "wager";

  fwCategory.textContent = `Category: ${finalWager.category}`;
  fwForm.hidden = !canWager;
  fwAmount.max = String(max);
  fwLimit.textContent = max > 0
    ? `You can wager from 0 up to ${max.toLocaleString("en-US")}`
    : "You have no points, so your wager is 0";
  fwSubmit.textContent = isLockedIn ? "Change wager" : "Lock in wager";

  if (canWager) {
    fwStatus.textContent = isLockedIn && fwMyWager !== null
      ? `✓ Locked in: ${fwMyWager.toLocaleString("en-US")}. You can change it until the question shows.`
      : isLockedIn ? "✓ Your team's wager is locked in." : "Talk it over, then lock in your wager.";
  } else {
    fwStatus.textContent = (fwMyWager !== null ? `Your wager: ${fwMyWager.toLocaleString("en-US")}. ` : "") +
      (finalWager.phase === "question" ? "Write your answer on your whiteboard!" : "Wait for the host to reveal the wagers.");
  }
  fwStatus.classList.toggle("is-locked", isLockedIn);
}

fwForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const max = Number(fwAmount.max) || 0;
  const amount = Math.max(0, Math.min(max, Math.round(Number(fwAmount.value) || 0)));
  fwAmount.value = String(amount);
  fwAmount.blur();

  try {
    const response = await fetch(apiUrl("/api/fw/wager"), { // buzzer.js
      method: "POST",
      body: JSON.stringify({ teamId: myTeamId, amount }),
    });
    const result = await response.json();
    if (result.accepted) fwMyWager = result.amount;
    if (result.finalWager) latestState.finalWager = result.finalWager; // buzzer.js
  } catch (error) {
    connectionBanner.hidden = false; // buzzer.js
  }
  render(); // buzzer.js
});
