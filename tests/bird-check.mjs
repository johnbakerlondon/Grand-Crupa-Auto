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
  'var _gcaBirdsS=null;\n' +
  ['_gcaBirdStep', '_gcaBirdHome', '_gcaScatter', '_gcaBirdGround',
   '_gcaBirdShouldLand', '_gcaBirdLand', '_gcaBirdTakeoff', '_gcaBirdSpookRadius']
    .map(n => extractFn(html, n)).join('\n') + `
  return {
    step: _gcaBirdStep,
    home: _gcaBirdHome,
    scatter: _gcaScatter,
    ground: _gcaBirdGround,
    shouldLand: _gcaBirdShouldLand,
    land: _gcaBirdLand,
    takeoff: _gcaBirdTakeoff,
    spookRadius: _gcaBirdSpookRadius,
    setState: function (s) { _gcaBirdsS = s },
  };`,
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

/* ---------------- panic and scattering ---------------- */

function world(birds) {
  const b = birds.map(o => makeBird(o));
  api.setState({ flocks: [{ cx: 0, cz: 0, cy: 13, ang: 0, b }] });
  return b;
}

check('a bang panics every bird within earshot', () => {
  const b = world([{ x: 5, y: 10, z: 0 }, { x: 20, y: 10, z: 0 }, { x: 0, y: 10, z: 30 }]);
  const n = api.scatter(0, 0, 60);
  assert(n === 3, 'panicked ' + n + ' birds');
  assert(b.every(x => x.panic > 0), 'a bird stayed calm');
});
check('birds out of earshot ignore the bang', () => {
  const b = world([{ x: 5, y: 10, z: 0 }, { x: 400, y: 10, z: 0 }]);
  const n = api.scatter(0, 0, 60);
  assert(n === 1, 'panicked ' + n + ' birds');
  assert(!b[1].panic && b[1].vx === 0 && b[1].vy === 0 && b[1].vz === 0, 'a distant bird reacted');
});
check('the bang throws birds upward and away', () => {
  const b = world([{ x: 6, y: 10, z: 0 }]);
  api.scatter(0, 0, 60);
  assert(b[0].vy > 4, 'no upward kick: vy=' + b[0].vy);
  assert(b[0].vx > 2, 'not pushed outward: vx=' + b[0].vx);
});
check('birds nearer the bang panic harder', () => {
  const b = world([{ x: 3, y: 10, z: 0 }, { x: 55, y: 10, z: 0 }]);
  api.scatter(0, 0, 60);
  assert(b[0].panic > b[1].panic, 'near ' + b[0].panic.toFixed(2) + ' vs far ' + b[1].panic.toFixed(2));
  assert(b[0].vy > b[1].vy, 'near bird not thrown harder');
});
check('scared birds climb above their cruising height', () => {
  const b = world([{ x: 4, y: 10, z: 0, h: 10, r: 6 }]);
  const f = { cx: 0, cz: 0 };
  api.scatter(0, 0, 60);
  let peak = b[0].y;
  let t = 0;
  for (let i = 0; i < 90; i++) { t += 1 / 60; api.step(f, b[0], 1 / 60, t, 0, null); peak = Math.max(peak, b[0].y); }
  assert(peak > 16, 'only reached ' + peak.toFixed(1) + ' m');
});
check('they settle back down once the panic passes', () => {
  const b = world([{ x: 4, y: 10, z: 0, h: 10, r: 6 }]);
  const f = { cx: 0, cz: 0 };
  api.scatter(0, 0, 60);
  let t = 0;
  for (let i = 0; i < 240; i++) { t += 1 / 60; api.step(f, b[0], 1 / 60, t, 0, null); }
  assert(b[0].panic <= 0, 'still panicking');
  for (let i = 0; i < 600; i++) { t += 1 / 60; api.step(f, b[0], 1 / 60, t, 0, null); }
  assert(b[0].y < 16, 'never came back down: ' + b[0].y.toFixed(1) + ' m');
});
check('panic is bounded and decays', () => {
  const b = world([{ x: 1, y: 10, z: 0 }]);
  api.scatter(0, 0, 60);
  const first = b[0].panic;
  api.scatter(0, 0, 60);
  assert(b[0].panic <= Math.max(first, 2.2) + 1e-9, 'panic stacked without limit: ' + b[0].panic);
  const f = { cx: 0, cz: 0 };
  let t = 0;
  for (let i = 0; i < 300; i++) { t += 1 / 60; api.step(f, b[0], 1 / 60, t, 0, null); }
  assert(b[0].panic < 0, 'panic never ran out (' + b[0].panic.toFixed(2) + ')');
});
check('frightened birds beat their wings faster', () => {
  const calm = world([{ x: 4, y: 10, z: 0 }]);
  const f = { cx: 0, cz: 0 };
  let t = 0, calmPeak = 0;
  for (let i = 0; i < 60; i++) { t += 1 / 60; api.step(f, calm[0], 1 / 60, t, 0, null); calmPeak = Math.max(calmPeak, Math.abs(calm[0].flap)); }
  const scared = world([{ x: 4, y: 10, z: 0 }]);
  api.scatter(0, 0, 60);
  let scaredPeak = 0;
  t = 0;
  for (let i = 0; i < 60; i++) { t += 1 / 60; api.step(f, scared[0], 1 / 60, t, 0, null); scaredPeak = Math.max(scaredPeak, Math.abs(scared[0].flap)); }
  assert(scaredPeak > calmPeak, 'flap ' + scaredPeak.toFixed(2) + ' vs ' + calmPeak.toFixed(2));
});

/* ---------------- landing and pecking ---------------- */

const GY = 0.15;

function grounded(over = {}) {
  const f = { cx: 0, cz: 0, cy: 13, ang: 0, ground: true, landT: 0, lx: 0, lz: 0 };
  const b = makeBird({ g: 1, gx: 0, gz: 0, shuf: 0, panic: 0, h: 12, y: 6, ...over });
  f.b = [b];
  return { f, b };
}

check('a bird on the ground settles just clear of it', () => {
  const { f, b } = grounded();
  for (let i = 0; i < 120; i++) api.ground(f, b, 1 / 60, i / 60, GY);
  assert(Math.abs(b.y - (GY + 0.14)) < 0.02, 'height is ' + b.y.toFixed(3));
});
check('a grounded bird never sinks into the pavement', () => {
  const { f, b } = grounded({ y: -5 });
  api.ground(f, b, 1 / 60, 0, GY);
  assert(b.y >= GY + 0.14, 'sank to ' + b.y.toFixed(2));
});
check('wings are folded away on the ground', () => {
  const { f, b } = grounded();
  api.ground(f, b, 1 / 60, 0, GY);
  assert(b.flap > 1.1, 'wings still splayed: ' + b.flap.toFixed(2));
});
check('a grounded bird pecks', () => {
  const { f, b } = grounded();
  let lo = 9, hi = -9;
  for (let i = 0; i < 240; i++) {
    api.ground(f, b, 1 / 60, i / 60, GY);
    lo = Math.min(lo, b.pitch); hi = Math.max(hi, b.pitch);
  }
  assert(lo < 0 && hi > 0.15, 'head barely moves: ' + lo.toFixed(2) + ' to ' + hi.toFixed(2));
});
check('a grounded bird shuffles toward its spot', () => {
  const { f, b } = grounded({ x: 3, z: 0, gx: 0, gz: 0, shuf: 0 });
  const d0 = Math.hypot(b.x - b.gx, b.z - b.gz);
  for (let i = 0; i < 180; i++) api.ground(f, b, 1 / 60, i / 60, GY);
  const d1 = Math.hypot(b.x - b.gx, b.z - b.gz);
  assert(d1 < d0, 'did not shuffle in: ' + d0.toFixed(2) + ' -> ' + d1.toFixed(2));
});
check('settled birds stay put once landed', () => {
  const { f, b } = grounded();
  for (let i = 0; i < 120; i++) api.ground(f, b, 1 / 60, i / 60, GY);
  assert(b.g === 1, 'left the ground');
  assert(Math.hypot(b.x, b.z) < 0.4, 'wandered off: ' + Math.hypot(b.x, b.z).toFixed(2));
});

check('a calm flock near the player lands', () => {
  const f = { cx: 20, cz: 0, ground: false, landT: 0, b: [] };
  assert(api.shouldLand(f, 1 / 60, 20, 0, false) === true);
});
check('a panicked flock stays airborne', () => {
  const f = { cx: 20, cz: 0, ground: false, landT: 0, b: [] };
  assert(api.shouldLand(f, 1 / 60, 20, 0, true) === false);
});
check('a flock far from the player does not bother landing', () => {
  const f = { cx: 400, cz: 0, ground: false, landT: 0, b: [] };
  assert(api.shouldLand(f, 1 / 60, 0, 0, false) === false);
});
check('landing waits for its timer', () => {
  const f = { cx: 20, cz: 0, ground: false, landT: 5, b: [] };
  assert(api.shouldLand(f, 1 / 60, 20, 0, false) === false, 'landed early');
});
check('a flock already down does not land again', () => {
  const f = { cx: 20, cz: 0, ground: true, landT: 0, b: [] };
  assert(api.shouldLand(f, 1 / 60, 20, 0, false) === false);
});
check('landing gives every bird its own spot near the player', () => {
  const f = { cx: 20, cz: 0, ground: false, landT: 0, b: [makeBird(), makeBird(), makeBird()] };
  api.land(f, 100, 100);
  assert(f.ground === true);
  const d = Math.hypot(f.lx - 100, f.lz - 100);
  assert(d > 8 && d < 17, 'landing spot ' + d.toFixed(1) + ' m from the player');
  assert(f.b.every(b => b.g === 0 && b.gx !== undefined), 'birds not assigned a spot');
  const spots = f.b.map(b => [b.gx.toFixed(2), b.gz.toFixed(2)].join());
  assert(new Set(spots).size === 3, 'birds share the same spot');
});
check('a landing bird comes down and settles', () => {
  const f = { cx: 0, cz: 0, ground: true, lx: 0, lz: 0, b: [] };
  const b = makeBird({ g: 0, gx: 0, gz: 0, x: 0.2, z: 0.2, y: 6, h: 12, cruise: 9 });
  let t = 0, settled = false;
  for (let i = 0; i < 900 && !settled; i++) { t += 1 / 60; api.step(f, b, 1 / 60, t, GY, null); settled = b.g === 1; }
  assert(settled, 'never landed (y=' + b.y.toFixed(1) + ')');
  assert(b.y < GY + 0.3, 'settled at ' + b.y.toFixed(2));
});
check('taking off lifts the whole flock', () => {
  const f = { cx: 0, cz: 0, ground: true, landT: 0, b: [makeBird({ g: 1, gx: 0, gz: 0 }), makeBird({ g: 1, gx: 1, gz: 0 })] };
  api.takeoff(f);
  assert(f.ground === false, 'flock still marked as landed');
  assert(f.landT > 0, 'no delay before landing again');
  assert(f.b.every(b => b.g === 0 && b.vy > 4 && b.panic > 0), 'a bird stayed on the ground');
});
check('a scare lifts a settled bird mid-step', () => {
  const f = { cx: 0, cz: 0, ground: true, lx: 0, lz: 0, b: [] };
  const b = makeBird({ g: 1, gx: 0, gz: 0, panic: 1, y: GY + 0.14 });
  api.step(f, b, 1 / 60, 0, GY, null);
  assert(b.g === 0, 'bird stayed grounded through a scare');
  assert(b.vy > 0, 'no upward kick');
});

/* ---------------- how close is too close ---------------- */

check('standing still does not spook birds until you are on top of them', () => {
  assert(api.spookRadius(0, false) === 6);
});
check('walking gives the flock more room', () => {
  assert(api.spookRadius(2.5, false) === 8, 'radius ' + api.spookRadius(2.5, false));
});
check('sprinting scares them from further away', () => {
  assert(api.spookRadius(0, true) === 11);
  assert(api.spookRadius(7, true) === 11);
});
check('a fast player scares birds even without the sprint flag', () => {
  assert(api.spookRadius(6, false) === 11, 'radius ' + api.spookRadius(6, false));
});
check('the scare radius never shrinks as you speed up', () => {
  let last = 0;
  for (let v = 0; v <= 10; v += 0.25) {
    const r = api.spookRadius(v, false);
    assert(r >= last, 'radius dropped at ' + v.toFixed(2) + ' m/s');
    last = r;
  }
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failures.length) {
  console.log('\nfailures:');
  for (const f of failures) console.log('  - ' + f);
  process.exit(1);
}
