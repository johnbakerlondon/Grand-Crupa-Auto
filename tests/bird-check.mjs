// Headless regression suite for the pigeon flocks.
//
// Lifts the real flight functions out of the game file and drives them with
// plain objects - no WebGL. Run with:  node tests/bird-check.mjs

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const html = fs.readFileSync(path.join(here, '..', 'Grand-Crupa-Auto-optimized-3.html'), 'utf8');

function braceMatch(src, from) {
  let depth = 0;
  for (let i = src.indexOf('{', from); i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') {
      depth--;
      if (depth === 0) return i;
    }
  }
  throw new Error('unbalanced block');
}

function extractFn(src, name) {
  const start = src.indexOf('function ' + name + '(');
  if (start < 0) throw new Error('missing function ' + name);
  return src.slice(start, braceMatch(src, start) + 1);
}

const api = new Function(
  extractFn(html, '_gcaBirdStep') + '\n' + extractFn(html, '_gcaBirdHome') + `
  return { step: _gcaBirdStep, home: _gcaBirdHome };`,
)();

function makeBird(over = {}) {
  return {
    x: 0, y: 9, z: 0, vx: 0, vy: 0, vz: 0,
    ang: 0, r: 20, h: 12, cruise: 9, spd: 0.18,
    ph: 0, yaw: 0, pitch: 0, roll: 0, flap: 0,
    ...over,
  };
}

function makeFlock(over = {}) {
  return { cx: 0, cz: 0, cy: 13, ang: 0, b: [], ...over };
}

function run(flock, bird, steps, dt = 1 / 60, gy = 0, list = null) {
  let t = 0;
  for (let i = 0; i < steps; i++) {
    t += dt;
    api.step(flock, bird, dt, t, gy, list);
  }
  return t;
}

let passed = 0, failed = 0;
const failures = [];

function check(name, fn) {
  try {
    fn();
    passed++;
  } catch (err) {
    failed++;
    failures.push(name + ' :: ' + err.message);
  }
}

function assert(cond, msg) { if (!cond) throw new Error(msg || 'assertion failed'); }

/* ---------------- flight ---------------- */

check('a bird settles onto its circling radius', () => {
  const f = makeFlock();
  const b = makeBird();
  run(f, b, 900);
  const d = Math.hypot(b.x - f.cx, b.z - f.cz);
  assert(Math.abs(d - b.r) < 3, 'radius is ' + d.toFixed(1) + ', wanted ' + b.r);
});
check('birds orbit rather than hovering', () => {
  const f = makeFlock();
  const b = makeBird();
  run(f, b, 600);
  const a0 = Math.atan2(b.z - f.cz, b.x - f.cx);
  const x0 = b.x, z0 = b.z;
  run(f, b, 240);
  const a1 = Math.atan2(b.z - f.cz, b.x - f.cx);
  assert(Math.hypot(b.x - x0, b.z - z0) > 2, 'bird did not move');
  assert(Math.abs(a1 - a0) > 0.05, 'bird did not sweep around the flock centre');
});
check('a bird dropped to the ground is lifted off the floor', () => {
  const f = makeFlock();
  const b = makeBird({ y: -40, h: 12 });
  run(f, b, 1, 1 / 60, 0);          // one step: the clamp alone must catch it
  assert(b.y >= 5, 'bird stayed at ' + b.y.toFixed(1));
  run(f, b, 600, 1 / 60, 0);        // and it keeps climbing back to altitude
  assert(b.y > 6, 'bird settled at ' + b.y.toFixed(1));
});
check('birds respect the floor above high ground', () => {
  const f = makeFlock();
  const b = makeBird({ y: 0, h: 12, cruise: 9 });
  run(f, b, 600, 1 / 60, 100);
  assert(b.y >= 105, 'flew into the hillside at ' + b.y.toFixed(1));
});
check('speed stays under the cap', () => {
  const f = makeFlock();
  const b = makeBird({ cruise: 9 });
  let peak = 0;
  let t = 0;
  for (let i = 0; i < 900; i++) {
    t += 1 / 60;
    api.step(f, b, 1 / 60, t, 0, null);
    peak = Math.max(peak, Math.hypot(b.vx, b.vy, b.vz));
  }
  assert(peak <= 9 * 1.7 + 1e-6, 'peak speed ' + peak.toFixed(2));
  assert(peak > 5, 'birds never got going (' + peak.toFixed(2) + ')');
});
check('separation pushes stacked birds apart', () => {
  const f = makeFlock();
  const a = makeBird({ x: 0, y: 10, z: 0 });
  const b = makeBird({ x: 0.05, y: 10, z: 0 });
  const list = [a, b];
  let t = 0;
  for (let i = 0; i < 120; i++) { t += 1 / 60; api.step(f, a, 1 / 60, t, 0, list); api.step(f, b, 1 / 60, t, 0, list); }
  assert(Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z) > 1.1, 'still overlapping');
});
check('banking is limited', () => {
  const f = makeFlock();
  const b = makeBird({ spd: 2.5 });
  let worst = 0;
  let t = 0;
  for (let i = 0; i < 900; i++) { t += 1 / 60; api.step(f, b, 1 / 60, t, 0, null); worst = Math.max(worst, Math.abs(b.roll)); }
  assert(worst <= 0.85 + 1e-9, 'roll reached ' + worst.toFixed(2));
});
check('pitch is limited', () => {
  const f = makeFlock();
  const b = makeBird({ y: -30, h: 40 });
  let worst = 0;
  let t = 0;
  for (let i = 0; i < 600; i++) { t += 1 / 60; api.step(f, b, 1 / 60, t, 0, null); worst = Math.max(worst, Math.abs(b.pitch)); }
  assert(worst <= 0.7 + 1e-9, 'pitch reached ' + worst.toFixed(2));
});
check('wings beat through a full stroke', () => {
  const f = makeFlock();
  const b = makeBird();
  let lo = 9, hi = -9;
  let t = 0;
  for (let i = 0; i < 300; i++) { t += 1 / 60; api.step(f, b, 1 / 60, t, 0, null); lo = Math.min(lo, b.flap); hi = Math.max(hi, b.flap); }
  assert(lo < -0.2 && hi > 0.2, 'flap range ' + lo.toFixed(2) + ' to ' + hi.toFixed(2));
});
check('a bird turns to face where it is going', () => {
  const f = makeFlock();
  const b = makeBird();
  run(f, b, 700);
  let diff = Math.atan2(b.vx, b.vz) - b.yaw;
  diff = Math.atan2(Math.sin(diff), Math.cos(diff));
  assert(Math.abs(diff) < 0.5, 'facing is ' + diff.toFixed(2) + ' rad off travel');
});

/* ---------------- flock relocation ---------------- */

check('a flock left behind moves to the player', () => {
  const f = makeFlock({ cx: 0, cz: 0 });
  f.b = [makeBird({ x: 20, z: 0 }), makeBird({ x: 0, z: 20 })];
  const moved = api.home(f, 1000, 1000, 260);
  assert(moved === true, 'flock did not relocate');
  const d = Math.hypot(f.cx - 1000, f.cz - 1000);
  assert(d >= 55 && d <= 105, 'relocated ' + d.toFixed(1) + ' m away');
  assert(f.b.every(b => b.vx === 0 && b.vy === 0 && b.vz === 0), 'velocities survived');
  assert(f.b.every(b => Math.hypot(b.x - f.cx, b.z - f.cz) < 45), 'birds left behind');
});
check('a flock stays put while the player is close', () => {
  const f = makeFlock({ cx: 0, cz: 0 });
  f.b = [makeBird()];
  const moved = api.home(f, 120, 60, 260);
  assert(moved === false, 'flock jumped while the player was nearby');
  assert(f.cx === 0 && f.cz === 0);
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failures.length) {
  console.log('\nfailures:');
  for (const f of failures) console.log('  - ' + f);
  process.exit(1);
}
