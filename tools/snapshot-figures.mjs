// Render every machine figure into a floor sprite with headless Chrome.
//
//   npm run sprites            (all figures)
//   npm run sprites -- steam_macerator
//
// For each public/figures/<name>.html it writes public/sprites/<name>.png (transparent, default view, closed) and
// <name>.json with the figure's tile corners (as fractions of the sprite's width), which the floor uses to place it.
// The floor turns in quarter turns, so each figure is also rendered from the other three sides: <name>@1, @2 and @3,
// the camera a quarter turn further round each time (VIEW_YAW).
// Set CHROME to the browser's path if it isn't found.
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const ROOT = resolve(import.meta.dirname, '..');
const FIGS = join(ROOT, 'public', 'figures');
const OUT = join(ROOT, 'public', 'sprites');
const SIZE = [640, 480];
// multi-tile machines get a bigger frame, so each tile keeps about as many pixels as a one-tile machine's
const SIZES = { ebf: [1600, 1200], coke_oven: [1600, 1200] };
const STATE = 'input=3&output=8'; // a machine that has been used: ore in the hopper, a pile in the tray
const VIEW_YAW = [45, 135, 225, 315]; // core.js's yaw for the floor's views 0..3 (45 is the figures' default)

const chrome = process.env.CHROME ?? [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser',
].find(existsSync);
if (!chrome) throw new Error('Chrome not found: set CHROME to its path');

function runChrome(args) {
  const profile = mkdtempSync(join(tmpdir(), 'gtjs-chrome-'));
  try {
    const r = spawnSync(chrome, ['--headless=new', '--hide-scrollbars', `--user-data-dir=${profile}`, '--virtual-time-budget=2500', ...args],
      { encoding: 'utf8', timeout: 60000, maxBuffer: 64 << 20 });
    if (r.error) throw r.error;
    return r.stdout;
  } finally {
    rmSync(profile, { recursive: true, force: true });
  }
}

const only = process.argv.slice(2);
const names = readdirSync(FIGS).filter((f) => f.endsWith('.html')).map((f) => f.slice(0, -5)).filter((n) => !only.length || only.includes(n));
mkdirSync(OUT, { recursive: true });

for (const name of names) for (const [view, yaw] of VIEW_YAW.entries()) {
  const url = `${pathToFileURL(join(FIGS, `${name}.html`)).href}?sprite=1&${STATE}&yaw=${yaw}`;
  const file = view ? `${name}@${view}` : name;
  const png = join(OUT, `${file}.png`);
  const size = (SIZES[name] ?? SIZE).join(',');
  runChrome(['--force-device-scale-factor=1', `--window-size=${size}`, '--default-background-color=00000000', `--screenshot=${png}`, url]);
  const dom = runChrome([`--window-size=${size}`, '--dump-dom', url]);
  const errors = dom.match(/data-errors="([^"]*)"/);
  if (errors) throw new Error(`${file}: ${errors[1]}`);
  const meta = dom.match(/data-sprite="([^"]*)"/);
  if (!meta) throw new Error(`${file}: the figure did not report its tile (call gtBridge.sprite)`);
  writeFileSync(join(OUT, `${file}.json`), meta[1].replaceAll('&quot;', '"') + '\n');
  console.log(`wrote sprites/${file}.png and .json`);
}
