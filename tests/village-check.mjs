// Headless regression suite for the hilltop village.
//
// The module raises a hill west of the city, lays mud lanes and a climb up from
// town, and stands a village of individually shaped houses on the plateau.
// This suite runs the real module against stubs for the renderer and checks the
// land itself: the hill joins the city ground without a seam, the plateau is
// flat enough to build on, the walk up is not too steep, and the houses and
// lanes sit where they are supposed to.
//
// Run with:
//   node tests/village-check.mjs

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const html = fs.readFileSync(path.join(here, '..', 'Grand-Crupa-Auto-optimized-3.html'), 'utf8');

/* ---------------- extraction ---------------- */

const MARK = '/* ---- hilltop village';
const markAt = html.indexOf(MARK);
if (markAt < 0) throw new Error('village module not found');
const START = '(function (scene, world) {';
const END = '})(On, ae);';
const from = html.indexOf(START, markAt);
const to = html.indexOf(END, from);
if (from < 0 || to < 0) throw new Error('village module bounds not found');
const moduleSource = html.slice(from, to + END.length).replace(END, '})(scene, world);');

/* ---------------- stubs ---------------- */

// A stand-in for anything out of THREE: callable, constructible, and willing to
// hand back another one of itself for any property. The module only builds
// meshes with it, so nothing here needs to compute.
const magics = new Map();
function magic(name) {
  if (magics.has(name)) return magics.get(name);
  const fn = function () { return magic(name + '()'); };
  const proxy = new Proxy(fn, {
    get(t, k) {
      if (k === Symbol.toPrimitive) return () => 0;
      if (k === 'then' || k === Symbol.iterator) return undefined;
      if (k === 'length') return 1;
      if (!(k in t)) t[k] = magic(name + '.' + String(k));
      return t[k];
    },
    set(t, k, v) { t[k] = v; return true; },
    apply() { return magic(name + '()'); },
    construct() { return magic('new ' + name); },
  });
  magics.set(name, proxy);
  return proxy;
}

function makeCtx() {
  const noop = () => {};
  const state = { canvas: { id: 'none' }, fillStyle: '', strokeStyle: '', lineWidth: 1 };
  state.getTransform = () => ({ a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 });
  state.setTransform = noop;
  return new Proxy(state, {
    get(t, k) {
      if (k in t) return t[k];
      if (k === Symbol.toPrimitive) return () => 0;
      t[k] = noop;
      return noop;
    },
    set(t, k, v) { t[k] = v; return true; },
  });
}

function makeDocument() {
  return {
    createElement() {
      return { width: 0, height: 0, style: {}, getContext: () => makeCtx() };
    },
    // no radar in here: the dial is exercised in the browser
    getElementById: () => null,
  };
}

const CITY_GROUND = 10.2;
const world = {
  groundHeight: () => CITY_GROUND,
  bounds: 358,
  boundsMaxX: 1000,
  scene: null,
  poles: { list: [] },
  colliders: [],
  plantTrees() { this.treeSpots = (this.treeSpots || 0) + 1; },
};
const scene = { children: [], add(o) { this.children.push(o); } };
const window = { __GCA_T: magic('THREE') };

const run = new Function('scene', 'world', 'window', 'document', 'performance', moduleSource);
run(scene, world, window, makeDocument(), { now: () => 0 });

const V = window.__gcaVillage;
if (!V) throw new Error('module did not install __gcaVillage');

const { X0, X1, Z0, Z1 } = V.patch;
const SX = V.centre.x, SZ = V.centre.z, RX = V.radius;
const RZ = V.radiusZ;
const FLAT = V.flat, RISE = V.rise;
const h = V.height;
const inside = (x, z) => x >= X0 && x <= X1 && z >= Z0 && z <= Z1;

/* ---------------- checks ---------------- */

let passed = 0, failed = 0;
const ok = (name, cond, detail = '') => {
  if (cond) passed++;
  else { failed++; console.log('  FAIL  ' + name + (detail ? '  [' + detail + ']' : '')); }
};

console.log('hilltop village: patch ' + [X0, X1, Z0, Z1].join(','));

// --- the world reads the hill, and only over the patch
ok('the world ground height is the village height', world.groundHeight === V.ground,
  'still the original function');
ok('the walkable area was widened', world.bounds >= 880, 'bounds ' + world.bounds);

let outsideWrong = 0;
for (let i = 0; i < 400; i++) {
  const x = X0 - 5 - (i % 20) * 7, z = Z0 - 3 - Math.floor(i / 20) * 11;
  if (Math.abs(V.ground(x, z) - CITY_GROUND) > 1e-9) outsideWrong++;
}
ok('the city keeps its own ground', outsideWrong === 0, outsideWrong + ' points lifted');

// --- the summit
const peak = h(SX, SZ);
ok('the summit is ' + RISE + ' m up', Math.abs(peak - (CITY_GROUND + RISE)) < 1e-6, 'peak ' + peak.toFixed(2));

// --- the seam with the city: nothing anywhere near the patch border is lifted
let seamMax = 0;
for (let x = X0; x <= X1; x += 4) {
  seamMax = Math.max(seamMax, Math.abs(h(x, Z0) - CITY_GROUND), Math.abs(h(x, Z1) - CITY_GROUND));
}
for (let z = Z0; z <= Z1; z += 4) {
  seamMax = Math.max(seamMax, Math.abs(h(X0, z) - CITY_GROUND), Math.abs(h(X1, z) - CITY_GROUND));
}
ok('the hill melts into the city ground at its edges', seamMax < 1e-6, 'worst seam ' + seamMax.toFixed(4));

// --- the shoulder: past the hill footprint there is no rise at all
ok('the plain is untouched beyond the hill',
  Math.abs(h(SX + RX + 6, SZ) - CITY_GROUND) < 1e-6,
  h(SX + RX + 6, SZ).toFixed(3));

// --- the plateau is flat enough to build a village on
let flatMin = Infinity, flatMax = -Infinity;
for (let a = 0; a < 64; a++) {
  for (const f of [0, 0.25, 0.5, 0.75]) {
    const ang = (a / 64) * Math.PI * 2;
    const rr = RX * FLAT * f;
    const y = h(SX + Math.cos(ang) * rr, SZ + Math.sin(ang) * rr * (RZ / RX));
    flatMin = Math.min(flatMin, y); flatMax = Math.max(flatMax, y);
  }
}
ok('the plateau is flat', flatMax - flatMin < 0.05,
  'spread ' + (flatMax - flatMin).toFixed(3) + ' m');

// --- no cliff anywhere: the worst slope on a 2 m grid
let worst = 0, worstAt = null;
for (let x = X0; x <= X1; x += 2) {
  for (let z = Z0; z <= Z1; z += 2) {
    const gx = Math.abs(h(x + 2, z) - h(x, z)) / 2;
    const gz = Math.abs(h(x, z + 2) - h(x, z)) / 2;
    const g = Math.max(gx, gz);
    if (g > worst) { worst = g; worstAt = [x, z]; }
  }
}
ok('the walk up is a slope, not a cliff', worst < 0.9,
  'steepest ' + worst.toFixed(2) + ' m/m at ' + (worstAt ? worstAt.join(',') : '?'));

// --- the lanes
const roads = V.roads;
ok('there is a high street, two side lanes and a way up',
  roads.high.length > 3 && roads.north.length > 3 && roads.south.length > 3 && roads.ramp.length > 3);

function inPatch(road) { return road.every(([x, z]) => inside(x, z)); }
ok('the high street stays on the hill', inPatch(roads.high));
ok('the north lane stays on the hill', inPatch(roads.north));
ok('the south lane stays on the hill', inPatch(roads.south));
// the climb has to meet the city street at the foot of the hill, just outside
// the patch, so cars can drive up without a gap
ok('the climb meets the city at the foot of the hill',
  roads.ramp[0][0] > X1 && roads.ramp[0][0] - X1 < 12, 'starts at x ' + roads.ramp[0][0]);
ok('the climb is on the hill after that', inside(roads.ramp[1][0], roads.ramp[1][1]));

// The village stretch of every lane is on the plateau, and has to be level: the
// lanes may run on down the shoulder past the last houses, but not through the
// village itself.
const onPlateau = (x, z) => Math.hypot((x - SX) / RX, (z - SZ) / RZ) <= FLAT;
function laneProfile(road) {
  const ys = [];
  let total = 0, flat = 0;
  for (let i = 0; i < road.length - 1; i++) {
    for (let t = 0; t <= 1; t += 0.05) {
      const x = road[i][0] + (road[i + 1][0] - road[i][0]) * t;
      const z = road[i][1] + (road[i + 1][1] - road[i][1]) * t;
      total++;
      if (!onPlateau(x, z)) continue;
      flat++;
      ys.push(h(x, z));
    }
  }
  return {
    share: flat / total,
    drop: ys.length ? Math.max(...ys) - Math.min(...ys) : Infinity,
  };
}
for (const [name, road] of [['high street', roads.high], ['north lane', roads.north], ['south lane', roads.south]]) {
  const p = laneProfile(road);
  ok('the ' + name + ' runs across the plateau', p.share > 0.6, (p.share * 100).toFixed(0) + '% on the flat');
  ok('the ' + name + ' runs level through the village', p.drop < 0.5, 'drop ' + p.drop.toFixed(2) + ' m');
}

// the climb has to actually climb: from the city plain up to the village
const rampStart = h(roads.ramp[0][0], roads.ramp[0][1]);
const rampEnd = h(roads.ramp[roads.ramp.length - 1][0], roads.ramp[roads.ramp.length - 1][1]);
ok('the way up starts at city level', Math.abs(rampStart - CITY_GROUND) < 0.6,
  'start ' + rampStart.toFixed(2));
ok('the way up ends at the village', Math.abs(rampEnd - peak) < 1.0, 'end ' + rampEnd.toFixed(2));
let rampMin = Infinity, rampMax = -Infinity;
for (let i = 0; i < roads.ramp.length - 1; i++) {
  for (let t = 0; t <= 1; t += 0.1) {
    const x = roads.ramp[i][0] + (roads.ramp[i + 1][0] - roads.ramp[i][0]) * t;
    const z = roads.ramp[i][1] + (roads.ramp[i + 1][1] - roads.ramp[i][1]) * t;
    const y = h(x, z);
    rampMin = Math.min(rampMin, y); rampMax = Math.max(rampMax, y);
  }
}
ok('the climb never dips below town', rampMin >= CITY_GROUND - 0.05, 'low ' + rampMin.toFixed(2));
ok('the climb never overshoots the summit', rampMax <= peak + 0.05, 'high ' + rampMax.toFixed(2));

// --- the houses
const houses = V.houses;
ok('there is a street full of houses', houses.length >= 12, houses.length + ' houses');

let onFlat = 0, offHill = 0;
for (const hs of houses) {
  const corners = [[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([a, b]) => [
    hs.x + (a * hs.w) / 2, hs.z + (b * hs.d) / 2,
  ]);
  const drop = Math.max(...corners.map(([x, z]) => Math.abs(h(x, z) - hs.gy)));
  if (drop > 0.25) onFlat++;
  const d = Math.hypot((hs.x - SX) / RX, (hs.z - SZ) / RZ);
  if (d > FLAT * 1.05) offHill++;
}
ok('every house stands level on its footing', onFlat === 0, onFlat + ' on uneven ground');
ok('every house is on the plateau', offHill === 0, offHill + ' out on the slope');

// houses are individual: different sizes, and spaced apart
const sizes = new Set(houses.map((hs) => hs.w.toFixed(2) + 'x' + hs.d.toFixed(2)));
ok('the houses are not one repeated block', sizes.size >= houses.length / 2,
  sizes.size + ' distinct footprints of ' + houses.length);
let crowded = 0;
for (let i = 0; i < houses.length; i++) {
  for (let j = i + 1; j < houses.length; j++) {
    const a = houses[i], b = houses[j];
    if (Math.hypot(a.x - b.x, a.z - b.z) < 7) crowded++;
  }
}
ok('no two houses sit on top of each other', crowded === 0, crowded + ' overlaps');

// each house remembers the height it was placed at
let stale = 0;
for (const hs of houses) if (Math.abs(hs.gy - h(hs.x, hs.z)) > 1e-9) stale++;
ok('houses remember the ground under them', stale === 0, stale + ' stale');

// --- the buildings are solid
const boxes = world.colliders;
ok('every house has a collider on it', boxes.length >= houses.length,
  boxes.length + ' boxes for ' + houses.length + ' houses');
let uncovered = 0;
for (const hs of houses) {
  const c = Math.abs(Math.cos(hs.yaw)), sn = Math.abs(Math.sin(hs.yaw));
  const bx = (hs.w * c + hs.d * sn) / 2, bz = (hs.w * sn + hs.d * c) / 2;
  const hit = boxes.some((b) =>
    b.minX <= hs.x - bx + .01 && b.maxX >= hs.x + bx - .01 &&
    b.minZ <= hs.z - bz + .01 && b.maxZ >= hs.z + bz - .01);
  if (!hit) uncovered++;
}
ok('no house can be walked through', uncovered === 0, uncovered + ' open houses');
ok('the yards are fenced off too', boxes.length >= houses.length + 30,
  boxes.length + ' boxes');

// --- the village is cheap to draw
ok('the whole village is a handful of draw calls', V.drawCalls > 0 && V.drawCalls <= 30,
  V.drawCalls + ' draw calls');
ok('trees were planted on the flanks', (world.treeSpots || 0) >= 1);

console.log('\n' + passed + ' passed, ' + failed + ' failed');
process.exit(failed ? 1 : 0);
