// Headless regression suite for the wet-weather impact effects.
//
// The rain module only moves streaks; this one puts the reaction in:
// expanding ripple rings where drops land, splash motes lifted onto car roofs,
// and a little spray coming off the roof of any car near you.
//
// The module is self-contained, so this suite lifts the whole thing out of the
// game file and runs it against stubs for the renderer. Run with:
//   node tests/wet-check.mjs

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const html = fs.readFileSync(path.join(here, '..', 'Grand-Crupa-Auto-optimized-3.html'), 'utf8');

/* ---------------- extraction ---------------- */

const START = '(function (fx, scene, world, veh) {';
const END = '})(fs, On, ae, re);';
const from = html.indexOf(START);
const to = html.indexOf(END, from);
if (from < 0 || to < 0) throw new Error('wet-weather module not found');
const moduleSource = html.slice(from, to + END.length)
  // the game passes its own instances in; here they are the stubs
  .replace(END, "})(fx, scene, world, veh);");

// the cell size the ripples wrap in, straight out of the source
const cell = Number((/var RIP = \d+, SPR = \d+, CELL = (\d+);/.exec(moduleSource) || [])[1]);
if (!cell) throw new Error('ripple cell size not found');

/* ---------------- stubs ---------------- */

class Vec {
  constructor(x = 0, y = 0, z = 0) { this.x = x; this.y = y; this.z = z; }
  set(x, y, z) { this.x = x; this.y = y; this.z = z; return this; }
  normalize() { return this; }
}

class Mat4 {
  constructor() { this.p = new Vec(); this.s = new Vec(1, 1, 1); }
  // copy the values: the game reuses one scratch vector for every instance
  compose(p, q, s) { this.p = { x: p.x, y: p.y, z: p.z }; this.s = { x: s.x, y: s.y, z: s.z }; this.q = q; }
}

class Quat {
  constructor() { this.n = null; }
  setFromUnitVectors(a, b) { this.n = b; return this; }
}

class Geo {
  constructor() { this.attributes = {}; }
  rotateX() { return this; }
  setAttribute(k, v) { this.attributes[k] = v; }
}

class Mat {
  constructor(opts = {}) {
    Object.assign(this, opts);
    this.color = { clone: () => ({ value: null, setScalar(v) { this.value = v; } }) };
    this.opacity = opts.opacity ?? 1;
  }
}

class Instances {
  constructor(geo, mat, count) {
    this.geometry = geo;
    this.material = mat;
    this.count = count;
    this.instanceMatrix = { array: new Float32Array(count * 16), needsUpdate: false };
    this.matrices = [];
    this.colors = [];
    this.visible = false;
  }
  setMatrixAt(i, m) { this.matrices[i] = { p: { x: m.p.x, y: m.p.y, z: m.p.z }, s: { x: m.s.x, y: m.s.y, z: m.s.z } }; }
  setColorAt(i, c) {
    if (!this.instanceColor) this.instanceColor = { needsUpdate: false };
    this.colors[i] = c.value;
  }
}

class Points {
  constructor(geo, mat) { this.geometry = geo; this.material = mat; this.visible = false; }
}

function makeScope({ ground, cars, fx }) {
  const scene = { added: [], add(o) { this.added.push(o); } };
  const world = { groundHeight: ground };
  const veh = { list: cars };
  const gl = {
    xe: Geo, de: Mat, ce: Geo, he: class { constructor(a, n) { this.array = a; this.itemSize = n; } },
    vn: Instances, gr: Points, zs: Mat, Zt: Mat4, We: Quat, P: Vec, Ui: 2,
    Wn: () => ({}),
  };
  const names = ['xe', 'de', 'ce', 'he', 'vn', 'gr', 'zs', 'Zt', 'We', 'P', 'Ui', 'Wn'];
  const params = names.map((n) => n === 'Ui' ? gl.Ui : n === 'Wn' ? gl.Wn : gl[n]);
  const window = {};
  // eslint-disable-next-line no-new-func
  const run = new Function(...names, 'window', 'fx', 'scene', 'world', 'veh', moduleSource);
  run(...params, window, fx, scene, world, veh);
  return { window, scene };
}

function makeFx(over = {}) {
  return Object.assign({
    intensity: 0,
    time: 0,
    update() { this.baseCalls = (this.baseCalls || 0) + 1; },
    splashPos: new Float32Array(270),
    splashGeo: { attributes: { position: { needsUpdate: false } } },
  }, over);
}

function makeCar(kind, x, z, yaw, height, w = 2.1, l = 5.2) {
  const mesh = {
    isMesh: true,
    geometry: { boundingBox: { min: { x: -1, y: 0, z: -1 }, max: { x: 1, y: height, z: 1 } } },
    matrixWorld: { elements: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1] },
  };
  return {
    kind, x, z, yaw, gy: 10, wreck: false, exploded: false,
    def: { L: l, W: w },
    group: { traverse(fn) { fn(mesh); } },
  };
}

/* ---------------- checks ---------------- */

let passed = 0, failed = 0;
const ok = (name, cond, detail = '') => {
  if (cond) passed++;
  else { failed++; console.log('  FAIL  ' + name + (detail ? '  [' + detail + ']' : '')); }
};

// flat-ish ground with a gentle hill so the tilt maths has something to chew on
const ground = (x, z) => 5 + Math.sin(x * 0.05) * 1.5 + Math.cos(z * 0.04);

console.log('wet effects: ' + cell + ' m ripple cell');

// --- dry weather does nothing
{
  const fx = makeFx({ intensity: 0 });
  const { window } = makeScope({ ground, cars: [], fx });
  const w = window.__gcaWetFx;
  ok('module installs its handle', !!(w && w.ripples && w.spray));
  fx.update(0.016, { pos: { x: 0, y: 5, z: 0 } });
  ok('still runs the rain update underneath', (fx.baseCalls || 0) === 1);
  ok('no ripples when it is dry', w.ripples.visible === false);
  ok('no spray when it is dry', w.spray.visible === false);
  ok('no ripple opacity when dry', w.ripples.material.opacity === 0);
}

// --- the wet case
const cars = [makeCar('van', 4, 0, 0, 2.0), makeCar('sports', 30, 30, 0, 1.4, 1.9, 4.4)];
const fx = makeFx({ intensity: 1, time: 3 });
const { window } = makeScope({ ground, cars, fx });
const wet = window.__gcaWetFx;
const player = { pos: { x: 0, y: ground(0, 0), z: 0 } };
fx.time = 3;
fx.update(0.016, player);

ok('ripples come on with the rain', wet.ripples.visible === true);
ok('spray comes on with the rain', wet.spray.visible === true);
ok('ripple count is what the module says', wet.ripples.count === 260);
ok('ripples get a per-instance fade', !!wet.ripples.instanceColor);

// --- ripples sit on the ground and grow as they age
let offGround = 0, flat = 0;
const scales = [];
for (let i = 0; i < wet.ripples.count; i++) {
  const m = wet.ripples.matrices[i];
  const want = ground(m.p.x, m.p.z) + 0.035;
  if (Math.abs(m.p.y - want) > 1e-6) offGround++;
  if (Math.abs(m.s.y - 1) > 1e-9) flat++;
  scales.push(m.s.x);
}
ok('every ripple lies on the ground', offGround === 0, offGround + ' off the surface');
ok('ripples are flat discs, not tall boxes', flat === 0);
ok('ripples vary in size', Math.max(...scales) - Math.min(...scales) > 0.3);
ok('ripples stay a sensible size', Math.max(...scales) <= 1.0, 'max ' + Math.max(...scales).toFixed(2));

// --- the fade really fades
const colors = wet.ripples.colors;
ok('ripple fade covers the full range', Math.max(...colors) > 0.4 && Math.min(...colors) < 0.02,
  'max ' + Math.max(...colors).toFixed(2) + ' min ' + Math.min(...colors).toFixed(2));

// --- ripples are anchored to the map, not to the player
const cols = wet.ripples.matrices.map((m) => [m.p.x, m.p.z]);
player.pos.x = 2; player.pos.z = 1;   // a couple of steps, nowhere near a cell edge
fx.update(0.016, player);
let dragged = 0;
for (let i = 0; i < wet.ripples.count; i++) {
  const m = wet.ripples.matrices[i];
  const dx = m.p.x - cols[i][0], dz = m.p.z - cols[i][1];
  if (Math.abs(dx) > 1e-6 || Math.abs(dz) > 1e-6) dragged++;
}
ok('walking does not drag the ripples along', dragged === 0, dragged + ' moved');

// far enough to cross a cell: only whole-cell jumps
player.pos.x = 40;
fx.update(0.016, player);
let badJump = 0, jumped = 0;
for (let i = 0; i < wet.ripples.count; i++) {
  const m = wet.ripples.matrices[i];
  const dx = Math.abs(m.p.x - cols[i][0]);
  if (dx < 1e-6) continue;
  jumped++;
  const k = dx / cell;
  if (Math.abs(k - Math.round(k)) > 1e-6) badJump++;
}
ok('crossing a cell only shifts ripples a whole cell', badJump === 0, badJump + ' bad');
ok('some ripples wrap at the cell edge', jumped > 0 && jumped < wet.ripples.count, jumped + ' wrapped');

// --- roofs: measured per kind, and cached
const van = cars[0], sports = cars[1];
ok('van roof comes off the model', Math.abs(wet.roofOf(van) - 2.0) < 0.01, String(wet.roofOf(van)));
ok('sports car roof is lower than the van', wet.roofOf(sports) < wet.roofOf(van));
van.__probe = true;
ok('roof heights are cached per kind', wet.roofOf(van) === wet.roofOf(makeCar('van', 0, 0, 0, 9)));

// --- footprints respect the car's yaw
const turned = makeCar('van', 0, 0, Math.PI / 2, 2.0);
cars.push(turned);
fx.update(0.016, { pos: { x: 20, y: 5, z: 20 } });   // refresh the nearby list
ok('a point beside a turned car is off the roof', wet.findCar(0, 2.0) === turned || wet.findCar(0, 2.0) === null);
ok('a point on the turned car is a hit', wet.findCar(1.2, 0) === turned, String(wet.findCar(1.2, 0) && wet.findCar(1.2, 0).kind));
cars.pop();
fx.update(0.016, player);   // the car list changed, so refresh the spray

// --- spray sits above the roofs of nearby cars
const sp = wet.spray.geometry.attributes.position.array;
let onRoof = 0, floating = 0;
for (let i = 0; i < 96; i++) {
  const x = sp[i * 3], y = sp[i * 3 + 1], z = sp[i * 3 + 2];
  if (y < -100) continue;
  // which car is this mote over?
  let base = null;
  for (const c of cars) {
    if (Math.hypot(x - c.x, z - c.z) < 1.6) base = c.gy + wet.roofOf(c);
  }
  if (base !== null && y >= base && y <= base + 0.5) onRoof++;
  else floating++;
}
ok('spray rises just off a roof', onRoof > 0 && floating === 0, onRoof + ' good / ' + floating + ' floating');

// --- with no cars around there is no roof spray
{
  const lone = makeFx({ intensity: 1, time: 3 });
  const scope = makeScope({ ground, cars: [], fx: lone });
  lone.update(0.016, { pos: { x: 0, y: 5, z: 0 } });
  const arr = scope.window.__gcaWetFx.spray.geometry.attributes.position.array;
  let shown = 0;
  for (let i = 0; i < 96; i++) if (arr[i * 3 + 1] > -100) shown++;
  ok('no cars means no roof spray', shown === 0, shown + ' motes');
}

// --- splash motes that land on a roof get lifted onto it
{
  const f2 = makeFx({ intensity: 1, time: 3 });
  // a splash standing on the van's footprint, and one out in the open
  f2.splashPos[0] = 4; f2.splashPos[1] = ground(4, 0) + 0.06; f2.splashPos[2] = 0;
  f2.splashPos[3] = -30; f2.splashPos[4] = ground(-30, -30) + 0.06; f2.splashPos[5] = -30;
  makeScope({ ground, cars, fx: f2 });
  f2.update(0.016, { pos: { x: 0, y: 5, z: 0 } });
  const lift = f2.splashPos[1] - (ground(4, 0) + 0.06);
  ok('a splash over a car lands on its roof', Math.abs(lift - 2.0) < 0.01, 'lifted ' + lift.toFixed(2));
  ok('a splash on open ground stays put', Math.abs(f2.splashPos[4] - (ground(-30, -30) + 0.06)) < 1e-6);
}

// --- the rain stopping clears everything away
fx.intensity = 0;
fx.update(0.016, player);
ok('ripples go away when the rain stops', wet.ripples.visible === false);
ok('spray goes away when the rain stops', wet.spray.visible === false);
ok('spray fades out with the rain', wet.spray.material.opacity === 0);

console.log('\n' + passed + ' passed, ' + failed + ' failed');
process.exit(failed ? 1 : 0);
