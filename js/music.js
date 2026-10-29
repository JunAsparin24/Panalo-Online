/* =========================================================
   music.js — Background music and sound effects.

   The background music is one MP3 (MUSIC_FILE below) that loops
   on every screen. To use a different song, put the file in
   assets/audio/ and change MUSIC_FILE.

   The sound effects have no audio files: they're played live by
   the browser's built-in synthesizer (the Web Audio API).

   Sound effects here:
     playGoldenBoostSting() — chimes + horns when the Golden Boost is found
     playBuzzSound()        — "ding-ding!" when a team buzzes in
     playTimesUpSound()     — "bwaa-bwaa" when a team runs out of time
   Every other sound effect is in sound-effects.js.

   Browsers only allow sound after the player clicks something,
   so the menu music starts on the first click anywhere.
   The ♪ button in the corner mutes ALL sound (music + effects).

   Easy things to tweak:
     MUSIC_VOLUME        — normal loudness (0 to 1)
     MUSIC_DUCKED_VOLUME — loudness while a question is open
     SOUND_EFFECT_VOLUME — loudness of the round fanfare
   ========================================================= */

const MUSIC_FILE = "assets/audio/game-show-theme.mp3";

const MUSIC_VOLUME = 0.35;
const MUSIC_DUCKED_VOLUME = 0.02; // barely audible — set to 0 for full silence
const SOUND_EFFECT_VOLUME = 0.5;
const SOUND_PREFERENCE_KEY = "trivia-night-music"; // remembers mute between visits

/* ---------- Player state ---------- */

let audioContext = null;
let masterGain = null;     // the synthesizer's own volume (not used by the MP3)
let instrumentBus = null;  // default output for synthesizer instruments
let effectsBus = null;     // sound effects plug in here (not affected by ducking)
let noiseBuffer = null;

const musicElement = new Audio(MUSIC_FILE);
musicElement.loop = true;
musicElement.preload = "auto";
musicElement.volume = 0;

let currentSongName = "menu"; // kept for main.js — every screen plays the same MP3
let isMusicPlaying = false;
let musicFadeTimer = null;
let musicPauseTimer = null;
let duckRestoreTimer = null;
let isMusicDucked = false;
let isMusicOn = loadSoundPreference();

/* =========================================================
   PUBLIC FUNCTIONS (used by main.js and question-screen.js)
   ========================================================= */

// Starts the background music (main.js passes "menu" or "game"; both
// play the same song, so moving between screens doesn't restart it)
function playSong(songName) {
  currentSongName = songName;
  if (!isMusicOn) return;
  if (setUpAudio()) audioContext.resume(); // for the sound effects

  clearTimeout(musicPauseTimer);
  if (!isMusicPlaying) {
    isMusicPlaying = true;
    musicElement.play().catch(() => {
      isMusicPlaying = false; // blocked until the player clicks something
    });
  }
  fadeMusicTo(currentTargetVolume(), 0.8);
}

function stopMusic() {
  if (!isMusicPlaying) return;
  isMusicPlaying = false;
  fadeMusicTo(0, 0.3);
  clearTimeout(musicPauseTimer);
  musicPauseTimer = setTimeout(() => musicElement.pause(), 350);
}

// Called by the ♪ button
function toggleMusic() {
  // Sound is "on" but hasn't been able to start yet → start it
  if (isMusicOn && !isMusicPlaying) {
    playSong(currentSongName);
    return;
  }

  isMusicOn = !isMusicOn;
  saveSoundPreference(isMusicOn);

  if (isMusicOn) {
    playSong(currentSongName);
  } else {
    stopMusic();
  }

  updateMusicButton();
}

// Fades the music almost to silence while a question is on screen
function setMusicDucked(shouldDuck) {
  isMusicDucked = shouldDuck;
  if (isMusicPlaying) {
    fadeMusicTo(currentTargetVolume(), shouldDuck ? 0.5 : 0.8);
  }
}

function currentTargetVolume() {
  return isMusicDucked ? MUSIC_DUCKED_VOLUME : MUSIC_VOLUME;
}

// Smoothly changes the music's volume over a number of seconds
function fadeMusicTo(volume, seconds) {
  clearInterval(musicFadeTimer);
  const startVolume = musicElement.volume;
  const startTime = performance.now();
  const durationMs = Math.max(seconds * 1000, 1);

  musicFadeTimer = setInterval(() => {
    const progress = Math.min((performance.now() - startTime) / durationMs, 1);
    musicElement.volume = startVolume + (volume - startVolume) * progress;
    if (progress === 1) clearInterval(musicFadeTimer);
  }, 30);
}

// GOLDEN BOOST sound: a whoosh, a fast glittering run of chimes up the
// scale, then a big bright horn chord with a cymbal crash.
function playGoldenBoostSting() {
  if (!isMusicOn || !setUpAudio()) return;
  audioContext.resume();

  const start = audioContext.currentTime + 0.05;
  const chimeGap = 0.055;
  const chimeNotes = [72, 76, 79, 84, 88, 91, 96, 100]; // C major, climbing
  const hit = start + 0.3 + chimeNotes.length * chimeGap;

  // Dip the music so the effect stands out; it comes back afterwards
  clearTimeout(duckRestoreTimer);
  fadeMusicTo(0.01, 0.15);
  duckRestoreTimer = setTimeout(() => fadeMusicTo(currentTargetVolume(), 0.8), 3000);

  playWhoosh(start, 0.35, effectsBus);

  chimeNotes.forEach((note, index) => {
    playNote({ note, time: start + 0.3 + index * chimeGap, duration: 0.05, wave: "sine", volume: 0.35, release: 0.5, output: effectsBus });
  });

  playBrass({ notes: [67, 72, 76, 79, 84], time: hit, duration: 1.6, volume: 0.6, output: effectsBus });
  playKick(hit, effectsBus);
  playCrash(hit, 0.35, effectsBus);

  // A few high sparkles ringing out over the chord
  [96, 100, 103, 108].forEach((note, index) => {
    playNote({ note, time: hit + 0.15 + index * 0.12, duration: 0.04, wave: "sine", volume: 0.18, release: 0.6, output: effectsBus });
  });
}

// BUZZ: a bright two-note "ding-ding!" when a team buzzes in
function playBuzzSound() {
  if (!isMusicOn || !setUpAudio()) return;
  audioContext.resume();

  const start = audioContext.currentTime + 0.02;
  playNote({ note: 88, time: start, duration: 0.08, wave: "triangle", volume: 0.5, release: 0.25, output: effectsBus });
  playNote({ note: 93, time: start + 0.12, duration: 0.12, wave: "triangle", volume: 0.5, release: 0.4, output: effectsBus });
}

// TIME'S UP: a low falling "bwaa-bwaa" when a team runs out of time
function playTimesUpSound() {
  if (!isMusicOn || !setUpAudio()) return;
  audioContext.resume();

  const start = audioContext.currentTime + 0.02;
  playNote({ note: 55, time: start, duration: 0.22, wave: "sawtooth", volume: 0.35, filterFrequency: 1200, release: 0.1, output: effectsBus });
  playNote({ note: 50, time: start + 0.3, duration: 0.45, wave: "sawtooth", volume: 0.35, filterFrequency: 900, release: 0.3, output: effectsBus });
}

/* ---------- Menu music starts on the first click anywhere ---------- */

function handleFirstInteraction(event) {
  // START GAME and the ♪ button handle sound themselves
  if (event.target.closest("#start-button, #music-button")) return;

  document.removeEventListener("pointerdown", handleFirstInteraction);
  document.removeEventListener("keydown", handleFirstInteraction);
  if (!isMusicPlaying) {
    playSong(currentSongName);
  }
}

document.addEventListener("pointerdown", handleFirstInteraction);
document.addEventListener("keydown", handleFirstInteraction);

/* ---------- ♪ button (bottom-right corner) ---------- */

const musicButton = document.getElementById("music-button");

function updateMusicButton() {
  musicButton.classList.toggle("is-off", !isMusicOn);
  musicButton.setAttribute("aria-pressed", String(isMusicOn));
  musicButton.setAttribute("aria-label", isMusicOn ? "Sound on — click to mute" : "Sound off — click to turn on");
  musicButton.title = isMusicOn ? "Mute sound" : "Turn sound on";
}

musicButton.addEventListener("click", toggleMusic);
updateMusicButton();

/* ---------- Remembering the mute setting ---------- */

function loadSoundPreference() {
  try {
    return localStorage.getItem(SOUND_PREFERENCE_KEY) !== "off";
  } catch (error) {
    return true; // storage unavailable (e.g. private mode) — default to on
  }
}

function saveSoundPreference(isOn) {
  try {
    localStorage.setItem(SOUND_PREFERENCE_KEY, isOn ? "on" : "off");
  } catch (error) {
    // Not important if this fails
  }
}

/* =========================================================
   The synthesizer — you shouldn't need to edit below here
   ========================================================= */

// Creates the audio system the first time it's needed.
// Returns false if the browser doesn't support Web Audio.
function setUpAudio() {
  if (audioContext) return true;

  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) return false;

  audioContext = new AudioContextClass();

  // Music: instruments → compressor → master volume → speakers
  instrumentBus = audioContext.createDynamicsCompressor();
  masterGain = audioContext.createGain();
  masterGain.gain.value = 0;
  instrumentBus.connect(masterGain);
  masterGain.connect(audioContext.destination);

  // Sound effects: their own path, so ducking the music doesn't affect them
  // effects → compressor → effects volume → speakers
  const effectsVolume = audioContext.createGain();
  effectsVolume.gain.value = SOUND_EFFECT_VOLUME;
  effectsBus = audioContext.createDynamicsCompressor();
  effectsBus.connect(effectsVolume);
  effectsVolume.connect(audioContext.destination);

  // One second of white noise, reused for drums and the whoosh
  noiseBuffer = audioContext.createBuffer(1, audioContext.sampleRate, audioContext.sampleRate);
  const samples = noiseBuffer.getChannelData(0);
  for (let i = 0; i < samples.length; i++) {
    samples[i] = Math.random() * 2 - 1;
  }

  return true;
}

/* ---------- Instruments ---------- */

function midiToFrequency(note) {
  return 440 * Math.pow(2, (note - 69) / 12);
}

// A single pitched note: oscillator → optional low-pass filter → volume envelope
function playNote({ note, time, duration, wave, volume, filterFrequency, release = 0.05, output = instrumentBus }) {
  const oscillator = audioContext.createOscillator();
  const envelope = audioContext.createGain();

  oscillator.type = wave;
  oscillator.frequency.value = midiToFrequency(note);

  let lastNode = oscillator;
  if (filterFrequency) {
    const filter = audioContext.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = filterFrequency;
    oscillator.connect(filter);
    lastNode = filter;
  }

  // Quick fade in, hold, then fade out (avoids clicks)
  envelope.gain.setValueAtTime(0, time);
  envelope.gain.linearRampToValueAtTime(volume, time + 0.01);
  envelope.gain.setValueAtTime(volume, time + duration);
  envelope.gain.exponentialRampToValueAtTime(0.0001, time + duration + release);

  lastNode.connect(envelope);
  envelope.connect(output);

  oscillator.start(time);
  oscillator.stop(time + duration + release + 0.05);
}

// Synth "horns": two slightly out-of-tune sawtooth waves per note, with a
// filter that opens quickly at the start — that "blat" is what sounds brassy.
function playBrass({ notes, time, duration, volume, output = instrumentBus }) {
  const filter = audioContext.createBiquadFilter();
  const envelope = audioContext.createGain();
  const release = 0.12;

  filter.type = "lowpass";
  filter.Q.value = 1.5;
  filter.frequency.setValueAtTime(450, time);
  filter.frequency.linearRampToValueAtTime(3200, time + 0.06);
  filter.frequency.exponentialRampToValueAtTime(1500, time + Math.max(duration, 0.1));

  envelope.gain.setValueAtTime(0, time);
  envelope.gain.linearRampToValueAtTime(volume, time + 0.03);
  envelope.gain.setValueAtTime(volume * 0.85, time + duration);
  envelope.gain.exponentialRampToValueAtTime(0.0001, time + duration + release);

  filter.connect(envelope);
  envelope.connect(output);

  // Keep chords from getting louder than single notes
  const perOscillatorVolume = 1 / (notes.length * 2);

  notes.forEach((note) => {
    [-7, 7].forEach((detuneCents) => {
      const oscillator = audioContext.createOscillator();
      const oscillatorGain = audioContext.createGain();
      oscillator.type = "sawtooth";
      oscillator.frequency.value = midiToFrequency(note);
      oscillator.detune.value = detuneCents;
      oscillatorGain.gain.value = perOscillatorVolume;
      oscillator.connect(oscillatorGain);
      oscillatorGain.connect(filter);
      oscillator.start(time);
      oscillator.stop(time + duration + release + 0.05);
    });
  });
}

function playKick(time, output = instrumentBus) {
  const oscillator = audioContext.createOscillator();
  const envelope = audioContext.createGain();

  oscillator.frequency.setValueAtTime(150, time);
  oscillator.frequency.exponentialRampToValueAtTime(45, time + 0.12);
  envelope.gain.setValueAtTime(0.9, time);
  envelope.gain.exponentialRampToValueAtTime(0.0001, time + 0.3);

  oscillator.connect(envelope);
  envelope.connect(output);
  oscillator.start(time);
  oscillator.stop(time + 0.32);
}

function playSnare(time) {
  playNoise({ time, volume: 0.3, decay: 0.16, filterType: "highpass", filterFrequency: 1400 });
  playNote({ note: 54, time, duration: 0.02, wave: "triangle", volume: 0.18, release: 0.08 });
}

function playHiHat(time, volume) {
  playNoise({ time, volume, decay: 0.04, filterType: "highpass", filterFrequency: 7500 });
}

function playCrash(time, volume, output = instrumentBus) {
  playNoise({ time, volume, decay: 1.4, filterType: "highpass", filterFrequency: 5000, output });
}

// Rising "whoosh": noise through a filter that sweeps upward
function playWhoosh(time, duration, output = instrumentBus) {
  const source = audioContext.createBufferSource();
  const filter = audioContext.createBiquadFilter();
  const envelope = audioContext.createGain();

  source.buffer = noiseBuffer;
  filter.type = "bandpass";
  filter.Q.value = 2;
  filter.frequency.setValueAtTime(300, time);
  filter.frequency.exponentialRampToValueAtTime(5000, time + duration);
  envelope.gain.setValueAtTime(0.0001, time);
  envelope.gain.exponentialRampToValueAtTime(0.5, time + duration * 0.8);
  envelope.gain.exponentialRampToValueAtTime(0.0001, time + duration + 0.1);

  source.connect(filter);
  filter.connect(envelope);
  envelope.connect(output);
  source.start(time);
  source.stop(time + duration + 0.15);
}

function playNoise({ time, volume, decay, filterType, filterFrequency, output = instrumentBus }) {
  const source = audioContext.createBufferSource();
  const filter = audioContext.createBiquadFilter();
  const envelope = audioContext.createGain();

  source.buffer = noiseBuffer;
  source.loop = true; // the buffer is 1s; long sounds like the crash need more
  filter.type = filterType;
  filter.frequency.value = filterFrequency;
  envelope.gain.setValueAtTime(volume, time);
  envelope.gain.exponentialRampToValueAtTime(0.0001, time + decay);

  source.connect(filter);
  filter.connect(envelope);
  envelope.connect(output);
  source.start(time);
  source.stop(time + decay + 0.02);
}
