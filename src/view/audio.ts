// Sound effects, made in code with the Web Audio API: no files to load, one small kit of noise bursts, tones and
// filters tuned per sound, the way the figures are one kit of shapes. Every sound varies a little each time it
// plays (pitch and level), so clicking the same button doesn't repeat itself exactly.
//
// Browsers only allow sound after the player has clicked something, so the audio graph is made on the first sound,
// which always comes from a click. Muting is remembered in the browser when it allows.

const MUTE_KEY = 'gtjs.muted';

let ctx: AudioContext | null = null;
let out: GainNode | null = null;
let noise: AudioBuffer | null = null;
let muted = false;
try { muted = localStorage.getItem(MUTE_KEY) === '1'; } catch { /* starts unmuted */ }

function audio(): { ctx: AudioContext; out: GainNode } | null {
  if (muted) return null;
  if (!ctx) {
    try { ctx = new AudioContext(); } catch { return null; }
    out = ctx.createGain();
    out.gain.value = 0.5;
    out.connect(ctx.destination);
    // a second of white noise, shared by every hiss, knock and crunch
    noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const d = noise.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  if (ctx.state === 'suspended') void ctx.resume();
  return { ctx, out: out! };
}

export function isMuted(): boolean { return muted; }

export function setMuted(m: boolean) {
  muted = m;
  try { localStorage.setItem(MUTE_KEY, m ? '1' : '0'); } catch { /* not remembered */ }
  if (m && ctx) void ctx.suspend();
}

// a little variety: a factor near 1
const vary = (k = 0.06) => 1 + (Math.random() * 2 - 1) * k;

/** A tone that falls (or rises) from f0 to f1 and dies away. */
function tone(at: number, f0: number, f1: number, dur: number, level: number, type: OscillatorType = 'sine') {
  const a = audio();
  if (!a) return;
  const t = a.ctx.currentTime + at, o = a.ctx.createOscillator(), g = a.ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(f0, t);
  o.frequency.exponentialRampToValueAtTime(f1, t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(level, t + 0.005);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(a.out);
  o.start(t);
  o.stop(t + dur + 0.02);
}

/** A burst of noise through a filter whose centre slides from f0 to f1. */
function hiss(at: number, dur: number, level: number, type: BiquadFilterType, f0: number, f1 = f0, q = 1) {
  const a = audio();
  if (!a || !noise) return;
  const t = a.ctx.currentTime + at, src = a.ctx.createBufferSource(), flt = a.ctx.createBiquadFilter(), g = a.ctx.createGain();
  src.buffer = noise;
  flt.type = type;
  flt.Q.value = q;
  flt.frequency.setValueAtTime(f0, t);
  flt.frequency.exponentialRampToValueAtTime(f1, t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(level, t + 0.004);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(flt).connect(g).connect(a.out);
  src.start(t, Math.random() * 0.5);
  src.stop(t + dur + 0.02);
}

/* ---------- what you gather ---------- */

// one strike on each kind of thing; `at` delays it (a shift-click strikes a few times)
const STRIKE: Record<string, (at: number) => void> = {
  // stone: a dull knock, a thump under a short gritty click
  stone: (at) => { const k = vary(); tone(at, 150 * k, 70 * k, 0.09, 0.5); hiss(at, 0.06, 0.35, 'bandpass', 900 * k, 600 * k, 1.5); },
  // coal: a crumbly crunch, a few small cracks
  coal: (at) => { for (let i = 0; i < 4; i++) hiss(at + i * 0.018 * vary(0.4), 0.03, 0.3, 'bandpass', 2200 * vary(0.3), 1200, 1.2); tone(at, 110, 60, 0.06, 0.25); },
  // planks: a hollow wooden knock
  wood: (at) => { const k = vary(); tone(at, 320 * k, 180 * k, 0.12, 0.45, 'triangle'); hiss(at, 0.04, 0.25, 'bandpass', 1300 * k, 900 * k, 3); },
  // clay: a soft, wet squelch
  clay: (at) => { const k = vary(); hiss(at, 0.14, 0.35, 'lowpass', 1400 * k, 250, 4); tone(at, 170 * k, 110 * k, 0.12, 0.2); },
  // sand: a dry scoop, a short shh
  sand: (at) => { const k = vary(); hiss(at, 0.16, 0.25, 'highpass', 2500 * k, 4500 * k, 0.7); },
  // sticky resin: a drip, a little rising bloop
  resin: (at) => { const k = vary(); tone(at, 280 * k, 760 * k, 0.09, 0.3); hiss(at, 0.03, 0.1, 'lowpass', 900, 900, 1); },
};
// ore: the pick rings on the metal in the rock, each metal at its own pitch
function oreStrike(at: number, pitch: number) {
  const k = pitch * vary(0.03);
  tone(at, 130 * k, 70 * k, 0.07, 0.35); hiss(at, 0.03, 0.3, 'bandpass', 1500 * k, 1500 * k, 2);
  tone(at, 1900 * k, 1880 * k, 0.22, 0.12, 'triangle'); tone(at, 2830 * k, 2800 * k, 0.16, 0.06);
}
const ORE_PITCH: Record<string, number> = { iron_ore: 1, copper_ore: 0.82, tin_ore: 1.2, bauxite_ore: 0.9 };
const KIND: Record<string, string> = { cobblestone: 'stone', coal: 'coal', wood_planks: 'wood', clay: 'clay', sand: 'sand', sticky_resin: 'resin' };

/** Gathering by hand: the sound of picking that thing up (a few strikes for a shift-click of ten). */
export function gatherSound(item: string, many = false) {
  for (let i = 0; i < (many ? 3 : 1); i++) {
    const at = i * 0.07, pitch = ORE_PITCH[item];
    if (pitch) oreStrike(at, pitch);
    else (STRIKE[KIND[item]] ?? STRIKE.stone)(at);
  }
}

/* ---------- the interface ---------- */

/** A panel opening (the workbench, the quest book): a soft paper swish and two notes going up. */
export function openSound() {
  hiss(0, 0.12, 0.12, 'bandpass', 1200, 3200, 0.8);
  tone(0.01, 520, 540, 0.09, 0.14, 'triangle');
  tone(0.07, 780, 800, 0.12, 0.12, 'triangle');
}

/** A panel closing: the swish going the other way, two notes going down. */
export function closeSound() {
  hiss(0, 0.1, 0.1, 'bandpass', 3000, 1100, 0.8);
  tone(0.01, 700, 690, 0.08, 0.12, 'triangle');
  tone(0.06, 470, 460, 0.11, 0.11, 'triangle');
}
