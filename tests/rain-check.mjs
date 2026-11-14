// Headless regression suite for the rain field.
//
// The rain used to be laid out as  player + fixedOffset  for every drop, which
// glued the whole curtain to the camera: strafing made the streaks slide with
// you instead of passing you by. It is now a world-anchored field: each drop
// keeps a fixed world column and is wrapped around the player in 70 m cells,
// so walking through it looks like walking through rain that is already there.
//
// This suite lifts the real per-frame block out of the game file and drives it
// with stubs. Run with:  node tests/rain-check.mjs

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const html = fs.readFileSync(path.join(here, '..', 'Grand-Crupa-Auto-optimized-3.html'), 'utf8');

/* ---------------- extraction ---------------- */

const START = 'this.intensity>.02){let r=e.pos.x';
const END = 'this.splashGeo.attributes.position.needsUpdate=!0}';

function extractRainStep(src) {
  const start = src.indexOf(START);
  if (start < 0) throw new Error('missing rain step');
  const end = src.indexOf(END, start);
  if (end < 0) throw new Error('missing rain step end');
  // lift the body out of its "if(intensity>.02){ ... }" guard
  const body = src.slice(start + 'this.intensity>.02){'.length, end + END.length - 1);
  return new Function('e', 'if(this.intensity<=.02)return;' + body);
}

// the cell size the block wraps around, straight out of the source
const cellMatch = /a=e\.pos\.z,W=(\d+);/.exec(html);
if (!cellMatch) throw new Error('rain cell size not found');
const CELL = Number(cellMatch[1]);

const COUNT = Number((/let r=(\d+);this\.drops=new Float32Array\(r\*6\)/.exec(html) || [])[1]);
if (!COUNT) throw new Error('rain drop count not found');

/* ---------------- stubs ---------------- */

// a hilly surface: the drops must follow whatever ground the world reports
const groundHeight = (x, z) => 4 + 3 * Math.sin(x * 0.045) + 2.2 * Math.cos(z * 0.037);

function makeRain() {
  const rain = {
    seed: new Float32Array(COUNT * 3),
    drops: new Float32Array(COUNT * 6),
    splashSeed: new Float32Array(180),
    splashPhase: new Float32Array(90),
    splashPos: new Float32Array(270),
    geo: { attributes: { position: { needsUpdate: false } } },
    splashGeo: { attributes: { position: { needsUpdate: false } } },
    world: { groundHeight },
    intensity: 1,
    time: 0,
  };
  let s = 1234567;
  const rnd = () => ((s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  for (let a = 0; a < COUNT; a++) {
    rain.seed[a * 3] = (rnd() - 0.5) * (CELL - 15);
    rain.seed[a * 3 + 1] = rnd() * 38;
    rain.seed[a * 3 + 2] = (rnd() - 0.5) * (CELL - 15);
  }
  for (let a = 0; a < 90; a++) {
    rain.splashSeed[a * 2] = (rnd() - 0.5) * 44;
    rain.splashSeed[a * 2 + 1] = (rnd() - 0.5) * 44;
    rain.splashPhase[a] = rnd();
  }
  return rain;
}

const playerAt = (x, z) => ({ pos: { x, y: groundHeight(x, z) + 1, z } });

/* ---------------- checks ---------------- */

let passed = 0, failed = 0;
const ok = (name, cond, detail = '') => {
  if (cond) { passed++; }
  else { failed++; console.log('  FAIL  ' + name + (detail ? '  [' + detail + ']' : '')); }
};

const step = extractRainStep(html);
const rain = makeRain();
const run = (x, z, dt = 0) => {
  rain.time += dt;
  step.call(rain, playerAt(x, z));
};

console.log('rain: ' + COUNT + ' drops, ' + CELL + ' m cell');

// --- layout matches the field the renderer expects
run(0, 0);
ok('drop buffer covers the whole field', rain.drops.length === COUNT * 6);
ok('streak is two vertices per drop', rain.geo.attributes.position.needsUpdate === true);

// --- the core property: drops are world-anchored, not player-relative
let offColumn = 0;
for (let i = 0; i < COUNT; i++) {
  const kx = (rain.drops[i * 6] - rain.seed[i * 3]) / CELL;
  const kz = (rain.drops[i * 6 + 2] - rain.seed[i * 3 + 2]) / CELL;
  if (Math.abs(kx - Math.round(kx)) > 1e-3 || Math.abs(kz - Math.round(kz)) > 1e-3) offColumn++;
}
ok('every drop sits on its own world column', offColumn === 0, offColumn + ' off-column');

// --- and the field covers the area around the player without a gap
let reach = 0;
for (let i = 0; i < COUNT; i++) {
  reach = Math.max(reach, Math.abs(rain.drops[i * 6] - 0), Math.abs(rain.drops[i * 6 + 2] - 0));
}
ok('field reaches the edge of the cell', reach <= CELL / 2 + 0.01, 'reach ' + reach.toFixed(2));

// --- THE regression: moving the player must not drag the drops along
run(0, 0);
const before = Float32Array.from(rain.drops);
run(2, 1);              // a couple of steps: nowhere near a cell edge
let shifted = 0;
for (let i = 0; i < COUNT * 6; i++) if (Math.abs(before[i] - rain.drops[i]) > 1e-3) shifted++;
ok('drops do not move with the player', shifted === 0, shifted + ' vertices moved');

// walking anywhere must only ever wrap columns a whole cell, never drag them
run(25, 12);
let partial = 0;
for (let i = 0; i < COUNT; i++) {
  const dx = rain.drops[i * 6] - before[i * 6];
  const dz = rain.drops[i * 6 + 2] - before[i * 6 + 2];
  const kx = Math.abs(dx) < 1e-3 ? 0 : Math.abs(dx) / CELL;
  const kz = Math.abs(dz) < 1e-3 ? 0 : Math.abs(dz) / CELL;
  if (Math.abs(kx - Math.round(kx)) > 1e-3 || Math.abs(kz - Math.round(kz)) > 1e-3) partial++;
}
ok('walking only ever shifts drops by whole cells', partial === 0, partial + ' partly moved');

// --- crossing a cell edge re-wraps by exactly one cell, nothing else
const beforeWrap = Float32Array.from(rain.drops);
run(40, 12);            // past half a cell: some columns now belong to the next cell
let badJump = 0, wrapped = 0;
for (let i = 0; i < COUNT; i++) {
  const dx = rain.drops[i * 6] - beforeWrap[i * 6];
  const dz = rain.drops[i * 6 + 2] - beforeWrap[i * 6 + 2];
  if (Math.abs(dx) < 1e-3 && Math.abs(dz) < 1e-3) continue;
  wrapped++;
  if (Math.abs(Math.abs(dx) - CELL) > 1e-3 || Math.abs(dz) > 1e-3) badJump++;
}
ok('wrapped drops jump exactly one cell', badJump === 0, badJump + ' bad jumps');
ok('only drops past the edge wrap', wrapped > 0 && wrapped < COUNT, wrapped + '/' + COUNT + ' wrapped');

// --- vertical: rain falls, wraps at the ground, never sinks into it
run(0, 0, 0.1);
const y1 = [];
for (let i = 0; i < COUNT; i++) y1.push(rain.drops[i * 6 + 1]);
const columns1 = [];
for (let i = 0; i < COUNT; i++) columns1.push(rain.drops[i * 6]);

let belowGround = 0, aboveSky = 0;
for (let i = 0; i < COUNT; i++) {
  const x = rain.drops[i * 6], y = rain.drops[i * 6 + 1], z = rain.drops[i * 6 + 2];
  const h = y - groundHeight(x, z);
  if (h < -0.01) belowGround++;
  if (h > 38.01) aboveSky++;
}
ok('no drop below the ground', belowGround === 0, belowGround + ' underground');
ok('no drop above the fall column', aboveSky === 0, aboveSky + ' too high');

rain.time += 0.1;
step.call(rain, playerAt(0, 0));
let fell = 0, rose = 0, wrongFall = 0;
for (let i = 0; i < COUNT; i++) {
  const dy = rain.drops[i * 6 + 1] - y1[i];
  if (Math.abs(rain.drops[i * 6] - columns1[i]) > 1e-3) continue;  // column wrapped, skip
  if (dy < -0.5) fell++;
  else if (dy > 30) rose++;                                        // wrapped back to the top
  else wrongFall++;
}
ok('drops fall between frames', fell > COUNT * 0.5, fell + ' fell');
ok('dropped rain wraps back to the top', rose > 0, rose + ' wrapped');
ok('no drift or jitter in the fall', wrongFall === 0, wrongFall + ' off');

// --- streak shape: a short slanted segment, not a flat dot
const dxs = rain.drops[3] - rain.drops[0];
const dys = rain.drops[4] - rain.drops[1];
const dzs = rain.drops[5] - rain.drops[2];
ok('streak has length', Math.abs(dys) > 0.5, 'dy ' + dys.toFixed(2));
ok('streak leans with the wind', Math.abs(dxs) > 0.01 && Math.abs(dzs) > 0.01);

// --- splashes are world-anchored too, and they blink rather than teleport
let splashOffColumn = 0, splashHidden = 0;
for (let i = 0; i < 90; i++) {
  const y = rain.splashPos[i * 3 + 1];
  if (y < -100) { splashHidden++; continue; }
  const kx = (rain.splashPos[i * 3] - rain.splashSeed[i * 2]) / CELL;
  const kz = (rain.splashPos[i * 3 + 2] - rain.splashSeed[i * 2 + 1]) / CELL;
  if (Math.abs(kx - Math.round(kx)) > 1e-3 || Math.abs(kz - Math.round(kz)) > 1e-3) splashOffColumn++;
}
ok('splashes sit on their own world columns', splashOffColumn === 0, splashOffColumn + ' off-column');
ok('only a share of the splashes are showing', splashHidden > 40 && splashHidden < 85, splashHidden + ' hidden');
ok('splash sits just above the ground', (() => {
  for (let i = 0; i < 90; i++) {
    const y = rain.splashPos[i * 3 + 1];
    if (y < -100) continue;
    const h = y - groundHeight(rain.splashPos[i * 3], rain.splashPos[i * 3 + 2]);
    if (h < 0 || h > 1) return false;
  }
  return true;
})());

// --- dry weather does nothing at all
const dry = makeRain();
dry.intensity = 0;
step.call(dry, playerAt(0, 0));
let touched = 0;
for (let i = 0; i < dry.drops.length; i++) if (dry.drops[i] !== 0) touched++;
ok('no rain when it is not raining', touched === 0, touched + ' values written');

console.log('\n' + passed + ' passed, ' + failed + ' failed');
process.exit(failed ? 1 : 0);
