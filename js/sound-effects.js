/* =========================================================
   sound-effects.js — Every sound effect in the game.

   Like the music, these are played live by the synthesizer in
   music.js (no audio files). The ♪ button mutes them too.

   SEGMENT STINGS (each one sounds different):
     playRoundSting(round)  — Round 1: bright horns. Round 2: a
                              bigger fanfare, higher up
     playFinalWagerSting()  — drum roll, then a dark, dramatic chord
     playBoardClearedSound()— chimes and applause (Round Complete)
     playVictoryFanfare()   — "da-da-da-DAAA!" and applause (Game Over)

   ON THE BOARD:
     playTileSelectSound()  — a tile is picked
     playQuestionOpenSound()— the question card sweeps in
     playAnswerRevealSound()— SHOW ANSWER
     playCorrectSound() / playWrongSound() — ✓ / ✗
     playCountdownTick(urgent) — the last seconds of a timer

   FINAL WAGER:
     playCategoryChosenSound(), playWagerLockedSound(),
     playFinalQuestionSting(), playRevealPopSound()

   (playGoldenBoostSting, playBuzzSound and playTimesUpSound live in
   music.js.)
   ========================================================= */

/* ---------- Helpers ---------- */

// Gets the synthesizer ready. Returns the time to start at, or null
// when sound is off. dipSeconds: quiet the music for this long.
function startEffect(dipSeconds = 0) {
  if (!isMusicOn || !setUpAudio()) return null;
  audioContext.resume();

  if (dipSeconds > 0) {
    clearTimeout(duckRestoreTimer);
    fadeMusicTo(0.015, 0.15);
    duckRestoreTimer = setTimeout(() => fadeMusicTo(currentTargetVolume(), 0.8), dipSeconds * 1000);
  }
  return audioContext.currentTime + 0.03;
}

// A single note on the effects channel (see playNote in music.js)
function effectNote(options) {
  playNote({ wave: "triangle", release: 0.15, ...options, output: effectsBus });
}

// A note that slides in pitch — used for "pops" and swoops
function slideNote({ from, to, time, duration, wave = "sine", volume = 0.3 }) {
  const oscillator = audioContext.createOscillator();
  const envelope = audioContext.createGain();
  oscillator.type = wave;
  oscillator.frequency.setValueAtTime(from, time);
  oscillator.frequency.exponentialRampToValueAtTime(to, time + duration);
  envelope.gain.setValueAtTime(0.0001, time);
  envelope.gain.exponentialRampToValueAtTime(volume, time + 0.01);
  envelope.gain.exponentialRampToValueAtTime(0.0001, time + duration);
  oscillator.connect(envelope);
  envelope.connect(effectsBus);
  oscillator.start(time);
  oscillator.stop(time + duration + 0.05);
}

// Lots of tiny bursts of noise = a crowd clapping
function playApplause(time, duration, loudness = 1) {
  const claps = Math.round(duration * 45);
  for (let i = 0; i < claps; i++) {
    const at = time + Math.random() * duration;
    // Louder in the middle, fading out at the end
    const fade = 1 - Math.max(0, (at - time) / duration - 0.55) / 0.45;
    playNoise({
      time: at,
      volume: (0.04 + Math.random() * 0.1) * fade * loudness,
      decay: 0.02 + Math.random() * 0.04,
      filterType: "bandpass",
      filterFrequency: 1200 + Math.random() * 2600,
      output: effectsBus,
    });
  }
}

/* =========================================================
   SEGMENT STINGS
   ========================================================= */

// Round 1: a bright horn run-up and one big chord.
// Round 2 (and later): higher, with an extra "ta-DAA!" hit.
function playRoundSting(round = 2) {
  const start = startEffect(2.4);
  if (start === null) return;

  const shift = (round - 1) * 2; // Round 2 is a step higher
  const run = 0.09;
  const runNotes = round > 1 ? [67, 71, 74, 79] : [67, 72, 76];
  const hit = start + 0.35 + run * runNotes.length;

  playWhoosh(start, 0.45, effectsBus);
  runNotes.forEach((note, index) => {
    playBrass({ notes: [note + shift], time: start + 0.35 + index * run, duration: run * 0.9, volume: 0.35, output: effectsBus });
  });

  if (round > 1) {
    // "ta-" … "DAA!"
    playBrass({ notes: [60, 64, 67, 72].map((n) => n + shift), time: hit, duration: 0.14, volume: 0.5, output: effectsBus });
    playKick(hit, effectsBus);
    const big = hit + 0.22;
    playBrass({ notes: [60, 64, 67, 72, 76, 79].map((n) => n + shift), time: big, duration: 1.4, volume: 0.6, output: effectsBus });
    playKick(big, effectsBus);
    playKick(big + 0.14, effectsBus);
    playCrash(big, 0.35, effectsBus);
  } else {
    playBrass({ notes: [60, 64, 67, 72, 76], time: hit, duration: 1.3, volume: 0.55, output: effectsBus });
    playKick(hit, effectsBus);
    playKick(hit + 0.14, effectsBus);
    playCrash(hit, 0.3, effectsBus);
  }
}

// FINAL WAGER: a snare drum roll that builds, then a dark minor chord
function playFinalWagerSting() {
  const start = startEffect(3.6);
  if (start === null) return;

  const rollLength = 1.3;
  const hits = 26;
  for (let i = 0; i < hits; i++) {
    const progress = i / hits;
    playNoise({
      time: start + progress * rollLength,
      volume: 0.05 + progress * 0.3,
      decay: 0.06,
      filterType: "highpass",
      filterFrequency: 1500,
      output: effectsBus,
    });
  }

  const hit = start + rollLength + 0.05;
  playBrass({ notes: [48, 55, 60, 63, 67], time: hit, duration: 1.8, volume: 0.65, output: effectsBus }); // C minor
  effectNote({ note: 36, time: hit, duration: 1.4, wave: "sine", volume: 0.45, release: 0.6 });
  playKick(hit, effectsBus);
  playKick(hit + 0.5, effectsBus);
  playCrash(hit, 0.4, effectsBus);
}

// Round Complete: sparkly chimes and a round of applause
function playBoardClearedSound() {
  const start = startEffect(3);
  if (start === null) return;

  [72, 76, 79, 84, 88, 91, 96].forEach((note, index) => {
    effectNote({ note, time: start + index * 0.07, duration: 0.05, wave: "sine", volume: 0.3, release: 0.7 });
  });
  playCrash(start + 0.5, 0.2, effectsBus);
  playApplause(start + 0.3, 2.4, 0.9);
}

// Game Over: "da-da-da-DAAA!", drums, and a big round of applause
function playVictoryFanfare() {
  const start = startEffect(4.5);
  if (start === null) return;

  const beat = 0.13;
  [67, 67, 67].forEach((note, index) => {
    playBrass({ notes: [note, note + 5], time: start + index * beat, duration: beat * 0.7, volume: 0.45, output: effectsBus });
  });
  const hit = start + beat * 3 + 0.05;
  playBrass({ notes: [60, 64, 67, 72, 76, 79], time: hit, duration: 1.8, volume: 0.65, output: effectsBus });
  playKick(hit, effectsBus);
  playKick(hit + 0.2, effectsBus);
  playCrash(hit, 0.4, effectsBus);
  [84, 88, 91, 96].forEach((note, index) => {
    effectNote({ note, time: hit + 0.3 + index * 0.1, duration: 0.05, wave: "sine", volume: 0.2, release: 0.6 });
  });
  playApplause(hit + 0.2, 3.5, 1.2);
}

/* =========================================================
   ON THE BOARD
   ========================================================= */

// A tile is picked: a quick "bloop-bleep"
function playTileSelectSound() {
  const start = startEffect();
  if (start === null) return;
  effectNote({ note: 76, time: start, duration: 0.05, wave: "sine", volume: 0.35 });
  effectNote({ note: 83, time: start + 0.07, duration: 0.08, wave: "sine", volume: 0.35, release: 0.2 });
}

// The question card sweeps in
function playQuestionOpenSound() {
  const start = startEffect();
  if (start === null) return;
  playWhoosh(start, 0.3, effectsBus);
  effectNote({ note: 60, time: start + 0.28, duration: 0.1, wave: "triangle", volume: 0.25, release: 0.3 });
}

// SHOW ANSWER: a sparkly run up to a bell
function playAnswerRevealSound() {
  const start = startEffect();
  if (start === null) return;
  [72, 76, 79, 84].forEach((note, index) => {
    effectNote({ note, time: start + index * 0.05, duration: 0.05, volume: 0.28 });
  });
  effectNote({ note: 91, time: start + 0.22, duration: 0.05, wave: "sine", volume: 0.25, release: 0.9 });
}

// ✓ — a happy "ding-ding-DING!"
function playCorrectSound() {
  const start = startEffect();
  if (start === null) return;
  [79, 84, 88].forEach((note, index) => {
    effectNote({ note, time: start + index * 0.08, duration: 0.07, volume: 0.4, release: index === 2 ? 0.6 : 0.15 });
  });
  effectNote({ note: 96, time: start + 0.28, duration: 0.04, wave: "sine", volume: 0.15, release: 0.5 });
}

// ✗ — a short, low "eh-eh"
function playWrongSound() {
  const start = startEffect();
  if (start === null) return;
  [0, 0.17].forEach((offset) => {
    effectNote({ note: 43, time: start + offset, duration: 0.12, wave: "square", volume: 0.25, filterFrequency: 1400, release: 0.05 });
  });
}

// The last seconds of a timer: a woodblock "tock" (higher when urgent)
function playCountdownTick(urgent = false) {
  const start = startEffect();
  if (start === null) return;
  effectNote({ note: urgent ? 88 : 81, time: start, duration: 0.02, wave: "sine", volume: urgent ? 0.4 : 0.18, release: 0.06 });
  playNoise({ time: start, volume: urgent ? 0.12 : 0.05, decay: 0.02, filterType: "highpass", filterFrequency: 3000, output: effectsBus });
}

/* =========================================================
   FINAL WAGER
   ========================================================= */

// Final Wager category picked: a drum hit and a horn stab
function playCategoryChosenSound() {
  const start = startEffect(1.5);
  if (start === null) return;
  playKick(start, effectsBus);
  playBrass({ notes: [60, 67, 72], time: start, duration: 0.35, volume: 0.5, output: effectsBus });
  playCrash(start, 0.18, effectsBus);
}

// A team locked in its wager: a soft "tk-tunk"
function playWagerLockedSound() {
  const start = startEffect();
  if (start === null) return;
  playNoise({ time: start, volume: 0.15, decay: 0.03, filterType: "highpass", filterFrequency: 2500, output: effectsBus });
  effectNote({ note: 69, time: start + 0.03, duration: 0.04, wave: "sine", volume: 0.3 });
  effectNote({ note: 76, time: start + 0.1, duration: 0.06, wave: "sine", volume: 0.3, release: 0.25 });
}

// Final Wager question appears: a whoosh into a low, tense chord
function playFinalQuestionSting() {
  const start = startEffect(2);
  if (start === null) return;
  playWhoosh(start, 0.35, effectsBus);
  const hit = start + 0.35;
  effectNote({ note: 36, time: hit, duration: 0.8, wave: "sine", volume: 0.45, release: 0.5 });
  playBrass({ notes: [55, 62, 67], time: hit, duration: 0.7, volume: 0.45, output: effectsBus });
  playKick(hit, effectsBus);
}

// A wager (or an amount) is revealed: a quick "pop" and a chime
function playRevealPopSound() {
  const start = startEffect();
  if (start === null) return;
  slideNote({ from: 350, to: 1100, time: start, duration: 0.12, volume: 0.35 });
  effectNote({ note: 88, time: start + 0.1, duration: 0.05, wave: "sine", volume: 0.3, release: 0.5 });
}
