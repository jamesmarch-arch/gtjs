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

// the first click or key anywhere starts the audio, so sounds that run on their own (the boilers) can play after it
const unlock = () => { audio(); removeEventListener('pointerdown', unlock); removeEventListener('keydown', unlock); };
addEventListener('pointerdown', unlock);
addEventListener('keydown', unlock);
// nothing plays from a hidden tab (the frame loop that sets the boilers' hiss stops there, mid-hiss)
document.addEventListener('visibilitychange', () => {
  if (!ctx) return;
  if (document.visibilityState === 'hidden') void ctx.suspend();
  else if (!muted) void ctx.resume();
});

export function isMuted(): boolean { return muted; }

export function setMuted(m: boolean) {
  muted = m;
  try { localStorage.setItem(MUTE_KEY, m ? '1' : '0'); } catch { /* not remembered */ }
  if (m && ctx) void ctx.suspend();
  else if (!m) audio();
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

/* ---------- the boilers ---------- */

// one hiss for every boiler on the floor, not one each (fifty boilers would be fifty loops): the game sets how loud
// and where from, every frame. Two layers from the same looping noise: the steady hiss of steam leaving a lit boiler,
// and the safety valve's sharper, chuffing roar when its steam net is full and it vents.
let hissing: { body: GainNode; vent: GainNode; pan: StereoPannerNode } | null = null;

function startHiss(a: { ctx: AudioContext; out: GainNode }) {
  const { ctx: c } = a, src = c.createBufferSource(), pan = c.createStereoPanner();
  src.buffer = noise;
  src.loop = true;
  pan.connect(a.out);
  // the steady hiss: high, soft, with a slow breathing wobble so it doesn't sound like a radio between stations
  const bp = c.createBiquadFilter(), body = c.createGain(), breath = c.createOscillator(), depth = c.createGain();
  bp.type = 'bandpass'; bp.frequency.value = 2800; bp.Q.value = 0.6;
  body.gain.value = 0;
  breath.frequency.value = 0.35; depth.gain.value = 500;
  breath.connect(depth).connect(bp.frequency);
  src.connect(bp).connect(body).connect(pan);
  // the safety valve: brighter and louder, chuffing about three times a second
  const hp = c.createBiquadFilter(), vent = c.createGain(), chuff = c.createGain(), lfo = c.createOscillator(), swing = c.createGain();
  hp.type = 'highpass'; hp.frequency.value = 1800;
  vent.gain.value = 0;
  chuff.gain.value = 0.65; lfo.frequency.value = 3.1; swing.gain.value = 0.35;
  lfo.connect(swing).connect(chuff.gain);
  src.connect(hp).connect(chuff).connect(vent).connect(pan);
  src.start(); breath.start(); lfo.start();
  return { body, vent, pan };
}

/** How the burning boilers should sound now: level 0..1 (0 = silent), pan -1 (left) .. 1 (right), venting or not. */
export function boilerHiss(level: number, pan: number, venting: boolean) {
  // only once the audio has started (a click) and while it's on; silence needs no loop at all
  if (!ctx || muted || (!hissing && level <= 0)) return;
  hissing ??= startHiss({ ctx, out: out! });
  const t = ctx.currentTime;
  hissing.body.gain.setTargetAtTime(0.32 * level, t, 0.4);
  hissing.vent.gain.setTargetAtTime(venting ? 0.4 * level : 0, t, 0.15);
  hissing.pan.pan.setTargetAtTime(Math.max(-1, Math.min(1, pan)), t, 0.25);
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

/** A craft from the terminal: a few quick knocks at the bench (more for a bigger job), then a bright two-note chime. */
export function craftSound(steps = 1) {
  const knocks = Math.min(4, Math.max(2, steps));
  for (let i = 0; i < knocks; i++) {
    const k = vary(), at = i * 0.06;
    tone(at, 210 * k, 120 * k, 0.07, 0.3);
    hiss(at, 0.05, 0.2, 'bandpass', 1100 * k, 800 * k, 1.8);
  }
  const at = knocks * 0.06 + 0.04;
  tone(at, 880, 890, 0.2, 0.11, 'triangle');
  tone(at + 0.08, 1320, 1330, 0.3, 0.09, 'triangle');
}
