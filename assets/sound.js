// Pixel Pals sound: chiptune music, effects and tiny pal voices, all synthesized with Web Audio.
// No audio files. Browsers only allow sound after the visitor clicks or taps, so nothing plays
// until then. One toggle (in the nav) turns everything on or off and is remembered.
import { CONFIG } from './config.js';

const KEY = `${CONFIG.storageKey}.sound`;
let enabled = true;
try { enabled = localStorage.getItem(KEY) !== '0'; } catch { /* ignore */ }

let ctx = null;
let master, musicBus, sfxBus, noiseBuf;
let unlocked = false;
const listeners = new Set();

function setup() {
  if (ctx) return ctx;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;
  ctx = new AC();
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -18;
  comp.ratio.value = 4;
  master = ctx.createGain();
  master.gain.value = enabled ? 0.8 : 0;
  musicBus = ctx.createGain();
  musicBus.gain.value = 0.32;
  sfxBus = ctx.createGain();
  sfxBus.gain.value = 0.9;
  musicBus.connect(master);
  sfxBus.connect(master);
  master.connect(comp).connect(ctx.destination);
  // one second of white noise, reused for crunches, cracks, hats and rain
  noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
  const d = noiseBuf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  return ctx;
}

const ready = () => enabled && unlocked && ctx && ctx.state === 'running';
const now = () => ctx.currentTime;
const rnd = (a, b) => a + Math.random() * (b - a);

function unlock() {
  if (unlocked) return;
  if (!setup()) return;
  ctx.resume().then(() => {
    unlocked = true;
    if (enabled && wantedTheme) startMusic(wantedTheme);
  });
}
['pointerdown', 'keydown', 'touchstart'].forEach((ev) => addEventListener(ev, unlock, { capture: true, passive: true }));
document.addEventListener('visibilitychange', () => {
  if (!ctx || !unlocked) return;
  if (document.hidden) ctx.suspend(); else if (enabled) ctx.resume();
});

export const isOn = () => enabled;
export const onSoundChange = (fn) => (listeners.add(fn), () => listeners.delete(fn));
export function setSound(on) {
  enabled = on;
  try { localStorage.setItem(KEY, on ? '1' : '0'); } catch { /* ignore */ }
  unlock();
  if (ctx) {
    master.gain.cancelScheduledValues(now());
    master.gain.setTargetAtTime(on ? 0.8 : 0, now(), 0.05);
    if (on) { ctx.resume(); if (wantedTheme) startMusic(wantedTheme); } else stopMusic();
  }
  listeners.forEach((fn) => fn(on));
}

// ------------------------------------------------------------------ building blocks
function tone(freq, dur, { type = 'square', vol = 0.12, slide = 0, at = 0, attack = 0.005, release = 0.06, bus = sfxBus, vibrato = 0, filter = 0 } = {}) {
  if (!ready()) return;
  const t = now() + at;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq * slide), t + dur);
  if (vibrato) {
    const lfo = ctx.createOscillator();
    const lg = ctx.createGain();
    lfo.frequency.value = 7;
    lg.gain.value = freq * vibrato;
    lfo.connect(lg).connect(o.frequency);
    lfo.start(t);
    lfo.stop(t + dur + release);
  }
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(vol, t + attack);
  g.gain.setValueAtTime(vol, t + Math.max(attack, dur - 0.01));
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur + release);
  let node = o.connect(g);
  if (filter) {
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = filter;
    g.connect(f);
    node = f;
  }
  node.connect(bus);
  o.start(t);
  o.stop(t + dur + release + 0.02);
}

function noise(dur, { vol = 0.15, at = 0, type = 'bandpass', freq = 2000, q = 1, sweep = 0, bus = sfxBus, attack = 0.002 } = {}) {
  if (!ready()) return;
  const t = now() + at;
  const s = ctx.createBufferSource();
  s.buffer = noiseBuf;
  const f = ctx.createBiquadFilter();
  f.type = type;
  f.frequency.setValueAtTime(freq, t);
  if (sweep) f.frequency.exponentialRampToValueAtTime(freq * sweep, t + dur);
  f.Q.value = q;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(vol, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  s.connect(f).connect(g).connect(bus);
  s.start(t, Math.random() * 0.5);
  s.stop(t + dur + 0.02);
}

const NOTE = { C: 0, 'C#': 1, D: 2, 'D#': 3, E: 4, F: 5, 'F#': 6, G: 7, 'G#': 8, A: 9, 'A#': 10, B: 11 };
const hz = (n) => {
  const m = /^([A-G]#?)(\d)$/.exec(n);
  return 440 * 2 ** ((NOTE[m[1]] + (Number(m[2]) + 1) * 12 - 69) / 12);
};

// ------------------------------------------------------------------ tiny voices
// A squeaky babble: a buzzy oscillator through two "vowel" filters, a few syllables long.
// Cats meow (pitch falls), dinos grumble low, blobs bubble (pitch rises). Mood shapes the melody.
const VOWELS = [[800, 1200], [400, 2000], [300, 2300], [450, 800], [350, 700], [600, 1700]];
const SPECIES_VOICE = [
  { base: 620, type: 'square', glide: 0.82 }, // cat
  { base: 260, type: 'sawtooth', glide: 0.95 }, // dino
  { base: 470, type: 'triangle', glide: 1.25 }, // blob
];

export function voice({ species = 2, mood = 0, syllables = 3, stage = 2, vol = 0.22, at = 0 } = {}) {
  if (!ready()) return;
  const v = SPECIES_VOICE[species] || SPECIES_VOICE[2];
  const youth = [1.35, 1.25, 1.08, 1][stage] || 1; // babies squeak higher
  let t = now() + at;
  for (let i = 0; i < syllables; i++) {
    const dur = mood === 2 ? rnd(0.13, 0.18) : rnd(0.07, 0.11);
    // happy: bouncy up-down, okay: flat, sad: drooping
    const contour = mood === 0 ? 1 + 0.18 * Math.sin(i * 2.1) + (i === syllables - 1 ? 0.15 : 0) : mood === 1 ? 1 : 1 - i * 0.07;
    const f0 = v.base * youth * contour * rnd(0.94, 1.08);
    const o = ctx.createOscillator();
    o.type = v.type;
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(f0 * (mood === 2 ? 0.8 : v.glide), t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    const [f1, f2] = VOWELS[Math.floor(Math.random() * VOWELS.length)];
    for (const [freq, gain] of [[f1, 1], [f2, 0.6]]) {
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = freq * (species === 1 ? 0.8 : 1.15);
      bp.Q.value = 5;
      const fg = ctx.createGain();
      fg.gain.value = gain * 2.2;
      o.connect(bp).connect(fg).connect(g);
    }
    g.connect(sfxBus);
    o.start(t);
    o.stop(t + dur + 0.02);
    t += dur + rnd(0.02, 0.05);
  }
}

// ------------------------------------------------------------------ effects
export const sfx = {
  click() { tone(880, 0.025, { vol: 0.06, slide: 1.4, release: 0.03 }); },
  hover() { tone(1320, 0.02, { vol: 0.03, type: 'triangle', release: 0.02 }); },
  squeak(species) { voice({ species, syllables: 1, vol: 0.12, stage: 1 }); },
  hop() {
    tone(260, 0.16, { type: 'square', vol: 0.07, slide: 2.6, filter: 2400 });
    tone(330, 0.1, { type: 'triangle', vol: 0.06, at: 0.55, slide: 0.6 });
  },
  tick() { tone(1800, 0.012, { vol: 0.04, type: 'square', release: 0.015 }); },
  ding(i = 0) { tone(hz(['C6', 'E6', 'G6', 'C7'][i % 4]), 0.08, { vol: 0.09, type: 'square', release: 0.25 }); },
  munch() {
    // crunch-crunch with a little chew blip
    for (let i = 0; i < 3; i++) noise(0.06, { at: i * 0.13, vol: 0.16, freq: rnd(1400, 2600), q: 2.5, sweep: 0.6 });
    tone(rnd(300, 360), 0.05, { at: 0.08, vol: 0.05, type: 'square', slide: 0.7 });
  },
  boing() { tone(180, 0.28, { type: 'sine', vol: 0.18, slide: 3.2, vibrato: 0.06 }); },
  bounce(i = 0) { tone(700 - i * 90, 0.04, { type: 'triangle', vol: 0.12, slide: 0.6 }); },
  lullaby() {
    ['E5', 'C5', 'D5', 'G4'].forEach((n, i) => tone(hz(n), 0.32, { type: 'sine', vol: 0.09, at: i * 0.38, attack: 0.04, release: 0.4 }));
  },
  snore() {
    noise(1.1, { vol: 0.07, type: 'lowpass', freq: 380, q: 6, sweep: 1.6, attack: 0.5 });
    tone(110, 0.9, { type: 'sine', vol: 0.03, at: 0.1, attack: 0.4, slide: 1.1 });
  },
  zzz() { [0, 0.2, 0.4].forEach((at, i) => tone(1200 + i * 300, 0.05, { at, vol: 0.03, type: 'sine', release: 0.12 })); },
  done() { tone(523, 0.07, { vol: 0.1 }); tone(784, 0.12, { vol: 0.1, at: 0.08, release: 0.15 }); },
  careDay() {
    ['C5', 'E5', 'G5', 'C6', 'E6'].forEach((n, i) => tone(hz(n), 0.09, { vol: 0.1, at: i * 0.075, release: 0.12 }));
    tone(hz('C6'), 0.35, { vol: 0.08, at: 0.4, type: 'triangle', vibrato: 0.02, release: 0.4 });
    sparkle(0.45);
  },
  evolve() {
    // rising sweep, a sparkle cloud and a little fanfare
    tone(200, 0.9, { type: 'sawtooth', vol: 0.05, slide: 8, filter: 3000 });
    noise(0.9, { vol: 0.05, freq: 1500, sweep: 6, q: 3 });
    sparkle(0.7, 10);
    ['G5', 'C6', 'E6', 'G6'].forEach((n, i) => tone(hz(n), i === 3 ? 0.45 : 0.1, { vol: 0.1, at: 1 + i * 0.11, release: 0.2, vibrato: i === 3 ? 0.02 : 0 }));
  },
  bonk() { tone(220, 0.06, { vol: 0.09, type: 'square', slide: 0.7 }); tone(165, 0.1, { vol: 0.08, at: 0.07, slide: 0.8 }); },
  shrug() { tone(300, 0.12, { type: 'triangle', vol: 0.1, slide: 1.3 }); tone(390, 0.16, { type: 'triangle', vol: 0.1, at: 0.15, slide: 0.75 }); },
  wiggle() { tone(rnd(500, 640), 0.03, { vol: 0.05, type: 'square', slide: 0.8 }); },
  crack() {
    noise(0.12, { vol: 0.3, freq: 3500, q: 0.8, sweep: 0.4 });
    noise(0.08, { at: 0.12, vol: 0.2, freq: 2500, q: 1.5 });
    for (let i = 0; i < 5; i++) tone(rnd(900, 1600), 0.025, { at: 0.18 + i * 0.05, vol: 0.06, type: 'triangle' });
  },
  tada() {
    ['C5', 'E5', 'G5'].forEach((n, i) => tone(hz(n), 0.08, { vol: 0.1, at: i * 0.08 }));
    ['C6', 'E5', 'G5'].forEach((n) => tone(hz(n), 0.5, { vol: 0.06, at: 0.26, type: 'triangle', vibrato: 0.015, release: 0.4 }));
    sparkle(0.3);
  },
  pet() { [0, 0.1].forEach((at, i) => tone(i ? 990 : 784, 0.06, { at, vol: 0.06, type: 'sine', release: 0.12 })); },
  whoosh() { noise(0.25, { vol: 0.08, freq: 600, sweep: 4, q: 1.2, attack: 0.08 }); },
  shutter() { noise(0.04, { vol: 0.2, freq: 4000, q: 0.7 }); noise(0.05, { at: 0.07, vol: 0.15, freq: 2500, q: 0.7 }); },
  plink() { tone(hz(['C5', 'D5', 'E5', 'G5', 'A5', 'C6'][Math.floor(Math.random() * 6)]), 0.05, { vol: 0.05, type: 'triangle', release: 0.15 }); },
  rainbow() { ['C5', 'D5', 'E5', 'G5', 'A5', 'C6', 'D6', 'E6'].forEach((n, i) => tone(hz(n), 0.1, { vol: 0.07, at: i * 0.06, type: 'triangle', release: 0.2 })); },
  glitch() { for (let i = 0; i < 6; i++) tone(rnd(200, 2000), 0.02, { at: i * 0.035, vol: 0.04, type: 'square' }); },
  newDay() { ['G4', 'C5', 'E5', 'G5'].forEach((n, i) => tone(hz(n), 0.14, { vol: 0.07, at: i * 0.1, type: 'triangle', release: 0.2 })); },
  sniffle() { noise(0.12, { vol: 0.05, freq: 3000, q: 4, sweep: 1.5 }); noise(0.12, { at: 0.2, vol: 0.05, freq: 3200, q: 4, sweep: 1.5 }); },
};

function sparkle(at = 0, n = 6) {
  for (let i = 0; i < n; i++) tone(rnd(1800, 3200), 0.03, { at: at + i * 0.05 + rnd(0, 0.03), vol: 0.035, type: 'sine', release: 0.1 });
}

/** Repeats an effect while something is pending (a transaction). Returns stop(). */
export function loop(fn, every) {
  fn();
  const id = setInterval(fn, every * 1000);
  return () => clearInterval(id);
}

/** Soft rain that keeps going until stop() is called. */
export function rain() {
  if (!ready()) return () => {};
  const s = ctx.createBufferSource();
  s.buffer = noiseBuf;
  s.loop = true;
  const f = ctx.createBiquadFilter();
  f.type = 'bandpass';
  f.frequency.value = 5000;
  f.Q.value = 0.6;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0, now());
  g.gain.linearRampToValueAtTime(0.05, now() + 0.8);
  s.connect(f).connect(g).connect(sfxBus);
  s.start();
  const drips = setInterval(() => tone(rnd(1400, 2600), 0.02, { vol: 0.03, type: 'sine', slide: 0.5 }), 260);
  return () => {
    clearInterval(drips);
    g.gain.setTargetAtTime(0, now(), 0.3);
    s.stop(now() + 1.5);
  };
}

// ------------------------------------------------------------------ music
// Original little chiptunes. Each string is one eighth note; "." rests; "-" holds.
const SONGS = {
  story: {
    bpm: 116, wave: 'square', lead: 0.05, swing: 0,
    melody: 'E5 . G5 . C6 . G5 . | A5 . G5 E5 D5 - . . | E5 . G5 . A5 . C6 . | D6 . C6 A5 G5 - . . | F5 . A5 . C6 . A5 . | G5 . E5 C5 D5 - . . | E5 G5 A5 G5 E5 D5 C5 D5 | C5 - - - . . . .',
    bass: 'C3 . G3 . C3 . G3 . | F3 . C4 . F3 . C4 . | C3 . G3 . C3 . G3 . | G2 . D3 . G2 . D3 . | F3 . C4 . F3 . C4 . | C3 . G3 . A2 . E3 . | F3 . G3 . F3 . G3 . | C3 . G3 . C3 . . .',
    drums: 'k . h . s . h h',
  },
  room: {
    bpm: 92, wave: 'triangle', lead: 0.08, swing: 0,
    melody: 'G5 . E5 . C5 . E5 . | F5 . D5 . B4 . D5 . | E5 . C5 . A4 . C5 . | D5 - - . G4 - - . | G5 . E5 . C6 . B5 . | A5 . F5 . D5 . F5 . | E5 . G5 . D5 . F5 . | C5 - - - . . . .',
    bass: 'C3 - - - G3 - - - | G2 - - - D3 - - - | A2 - - - E3 - - - | G2 - - - D3 - - - | C3 - - - G3 - - - | F2 - - - C3 - - - | G2 - - - G3 - - - | C3 - - - . . . .',
    drums: '. . t . . . t .',
  },
  rain: {
    bpm: 80, wave: 'triangle', lead: 0.07, swing: 0,
    melody: 'A4 . C5 . E5 . C5 . | D5 . F5 . A5 . F5 . | E5 . G#5 . B5 . G#5 . | A5 - - . E5 - - . | C5 . E5 . A5 . E5 . | F5 . A5 . D5 . F5 . | E5 . D5 . C5 . B4 . | A4 - - - . . . .',
    bass: 'A2 - - - E3 - - - | D3 - - - A2 - - - | E2 - - - B2 - - - | A2 - - - E3 - - - | A2 - - - E3 - - - | D3 - - - A2 - - - | E2 - - - E3 - - - | A2 - - - . . . .',
    drums: '. . . . . . . .',
  },
};
const parse = (s) => s.replace(/\|/g, ' ').trim().split(/\s+/);
for (const song of Object.values(SONGS)) { song.m = parse(song.melody); song.b = parse(song.bass); song.d = parse(song.drums); }

let wantedTheme = null;
let playing = null;
let step = 0;
let nextAt = 0;
let timer = null;
let songGain = null;

function noteLen(arr, i) {
  let n = 1;
  while (arr[(i + n) % arr.length] === '-' && n < 8) n++;
  return n;
}

function scheduleStep(song, i, t, out) {
  const e = 60 / song.bpm / 2; // eighth note
  const m = song.m[i % song.m.length];
  if (m !== '.' && m !== '-') {
    const len = noteLen(song.m, i % song.m.length) * e;
    voiceNote(hz(m), len * 0.9, t, song.wave, song.lead, out);
    // music-box echo for the slower songs
    if (song.bpm < 100) voiceNote(hz(m) * 2, len * 0.5, t + e * 0.75, 'sine', song.lead * 0.25, out);
  }
  const b = song.b[i % song.b.length];
  if (b !== '.' && b !== '-') voiceNote(hz(b), noteLen(song.b, i % song.b.length) * e * 0.9, t, 'triangle', 0.12, out);
  const d = song.d[i % song.d.length];
  if (d === 'k') drum(t, 'kick', out);
  else if (d === 's') drum(t, 'snare', out);
  else if (d === 'h') drum(t, 'hat', out);
  else if (d === 't') drum(t, 'tick', out);
}

function voiceNote(f, dur, t, type, vol, out) {
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(f, t);
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(vol, t + 0.01);
  g.gain.setTargetAtTime(vol * 0.6, t + 0.05, 0.1);
  g.gain.setTargetAtTime(0, t + dur, 0.05);
  o.connect(g).connect(out);
  o.start(t);
  o.stop(t + dur + 0.3);
}

function drum(t, kind, out) {
  if (kind === 'kick') {
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.frequency.setValueAtTime(150, t);
    o.frequency.exponentialRampToValueAtTime(45, t + 0.12);
    g.gain.setValueAtTime(0.25, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.15);
    o.connect(g).connect(out);
    o.start(t);
    o.stop(t + 0.2);
    return;
  }
  const s = ctx.createBufferSource();
  s.buffer = noiseBuf;
  const f = ctx.createBiquadFilter();
  f.type = kind === 'snare' ? 'bandpass' : 'highpass';
  f.frequency.value = kind === 'snare' ? 1800 : 7000;
  const g = ctx.createGain();
  const vol = { snare: 0.09, hat: 0.035, tick: 0.025 }[kind];
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + (kind === 'snare' ? 0.12 : 0.04));
  s.connect(f).connect(g).connect(out);
  s.start(t, Math.random() * 0.5);
  s.stop(t + 0.15);
}

function startMusic(name) {
  if (!ready()) return;
  if (playing === name && timer) return;
  const old = songGain;
  if (old) { old.gain.setTargetAtTime(0, now(), 0.25); setTimeout(() => old.disconnect(), 1500); }
  songGain = ctx.createGain();
  songGain.gain.setValueAtTime(0, now());
  songGain.gain.linearRampToValueAtTime(1, now() + 1.2);
  songGain.connect(musicBus);
  playing = name;
  step = 0;
  nextAt = now() + 0.1;
  clearInterval(timer);
  const out = songGain;
  timer = setInterval(() => {
    if (!ctx || ctx.state !== 'running') return;
    const song = SONGS[playing];
    const e = 60 / song.bpm / 2;
    while (nextAt < now() + 0.15) {
      scheduleStep(song, step, nextAt, out);
      step++;
      nextAt += e;
    }
  }, 30);
}

function stopMusic() {
  clearInterval(timer);
  timer = null;
  playing = null;
  if (songGain) { const g = songGain; g.gain.setTargetAtTime(0, now(), 0.2); setTimeout(() => g.disconnect(), 1200); songGain = null; }
}

/** Picks the background song: 'story' (website), 'room' (app) or 'rain' (a sad pal / the rainy chapter). */
export function music(name) {
  wantedTheme = name;
  if (ready()) startMusic(name);
}

/** Lower the music while something important plays (e.g. the evolution scene). */
export function duck(seconds = 2) {
  if (!ready()) return;
  musicBus.gain.cancelScheduledValues(now());
  musicBus.gain.setTargetAtTime(0.08, now(), 0.1);
  musicBus.gain.setTargetAtTime(0.32, now() + seconds, 0.4);
}

/** For debugging in the console: what the audio engine is doing right now. */
export const soundState = () => ({ enabled, unlocked, context: ctx?.state || 'not started', music: playing });
