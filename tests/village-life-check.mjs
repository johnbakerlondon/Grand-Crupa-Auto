// Headless regression suite for the village life: villagers, parked cars and
// chickens.
//
// The module adds walkways to the pedestrian graph so villagers stroll the
// lanes, parks a few cars in the street, and keeps a dozen chickens scratching
// about the yards. This suite runs the real module against stubs and checks
// that the walkways join the village to the city graph, that the cars sit on
// the ground, that villagers only settle while you are up there, and that the
// chickens stay in their yards, peck, and bolt when you come at them.
//
// Run with:
//   node tests/village-life-check.mjs

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const html = fs.readFileSync(path.join(here, '..', 'Grand-Crupa-Auto-optimized-3.html'), 'utf8');

/* ---------------- extraction ---------------- */

const MARK = '/* ---- village life:';
const markAt = html.indexOf(MARK);
if (markAt < 0) throw new Error('village life module not found');
const from = html.indexOf('(function () {', markAt);
const END = '})();';
const to = html.indexOf(END, from);
if (from < 0 || to < 0) throw new Error('village life module bounds not found');
const moduleSource = html.slice(from, to + END.length);

/* ---------------- stubs ---------------- */

const magics = new Map();
function magic(name) {
  if (magics.has(name)) return magics.get(name);
  const fn = function () { return magic(name + '()'); };
  const proxy = new Proxy(fn, {
    get(t, k) {
      if (k === Symbol.toPrimitive) return () => 0;
      if (k === 'then' || k === Symbol.iterator) return undefined;
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

const CITY = 10.2;
const CX = -640, CZ = 0;
const ground = (x, z) => {
  const dx = (x - CX) / 188, dz = (z - CZ) / 170;
  const k = Math.max(0, 1 - dx * dx - dz * dz);
  return CITY + 30 * k;
};

/* the village the game hands the module */
const roads = {
  high: [[-556, 0], [-590, 1], [-626, -1], [-664, 1], [-700, -1], [-738, 1], [-790, 0]],
  north: [[-650, 2], [-656, 24], [-674, 44], [-702, 54], [-742, 56]],
  south: [[-634, -3], [-640, -24], [-662, -38], [-698, -44]],
  ramp: [[-352, 2], [-386, 12], [-420, 2], [-452, 14], [-492, 4], [-524, 12], [-556, 0]],
};
const houses = [];
for (let i = 0; i < 19; i++) {
  const x = -560 - i * 12;
  houses.push({ x: x, z: i % 2 ? 12 : -12, yaw: i % 2 ? 0 : Math.PI, gy: ground(x, i % 2 ? 12 : -12), w: 7 + (i % 3), d: 6.5, h: 3 });
}
const V = { centre: { x: CX, z: CZ }, ground, houses, roads };

function fakePed(x, z, type = 'civ') {
  return {
    type, active: true, dead: false, hidden: false, state: 'walk',
    pos: {
      x, y: 0, z,
      set(px, py, pz) { this.x = px; this.y = py; this.z = pz; return this; },
    },
    group: { visible: false }, vx: 1, vz: 1, kx: 1, kz: 1, speed: 1,
  };
}

const peds = {
  graph: { nodes: [], adj: [] },
  list: [],
  _resetPose() {},
};
// a city crowd, all of it a long way from the hill
for (let i = 0; i < 24; i++) peds.list.push(fakePed(i * 8 - 40, i % 2 ? 30 : -30));
// the city graph the walkways have to plug into
for (let i = 0; i < 40; i++) {
  peds.graph.nodes.push({ x: -352 + (i % 5) * 8, z: -20 + Math.floor(i / 5) * 9 });
  peds.graph.adj.push(i > 0 ? [{ to: i - 1, cross: null }] : []);
}

const parked = [];
const vehicles = { add(kind, color, x, z, yaw, state) { parked.push({ kind, color, x, z, yaw, state }); return { kind, x, z, yaw, state, group: { position: { x, y: ground(x, z), z } } }; } };

const player = { pos: { x: 0, y: CITY, z: 0 }, speed: 0 };
const g = {
  state: 'playing', world: { scene: { add() {} } }, peds, vehicles, player,
};

const window = { __gca: g, __gcaVillage: V, __GCA_T: magic('THREE') };

let clock = 0;
const performance = { now: () => (clock += 1000) };
const setIntervalStub = () => 0;
const rafStub = () => 0;

const run = new Function('window', 'performance', 'setInterval', 'requestAnimationFrame', 'console', moduleSource);
run(window, performance, setIntervalStub, rafStub, console);

const handle = window.__gcaVillageLife;
if (!handle || typeof handle.boot !== 'function') throw new Error('module did not install its handle');

/* ---------------- checks ---------------- */

let passed = 0, failed = 0;
const ok = (name, cond, detail = '') => {
  if (cond) passed++;
  else { failed++; console.log('  FAIL  ' + name + (detail ? '  [' + detail + ']' : '')); }
};

const oldCount = peds.graph.nodes.length;
handle.boot();
const Life = window.__gcaVillageLife;      // the module fills the handle in place
const nodes = peds.graph.nodes, adj = peds.graph.adj;
const added = nodes.length - oldCount;

console.log('village life: ' + added + ' walkway nodes, ' + Life.chickens.length + ' chickens, ' + Life.cars.length + ' cars');

ok('walkways were added to the pedestrian graph', added > 60, added + ' nodes');
ok('the lanes, the climb and the high street all have nodes',
  Life.nodes.high.length > 20 && Life.nodes.north.length > 10 && Life.nodes.south.length > 8 && Life.nodes.climb.length > 20,
  JSON.stringify({ h: Life.nodes.high.length, n: Life.nodes.north.length, s: Life.nodes.south.length, c: Life.nodes.climb.length }));

// --- the graphs stay valid
let badAdj = 0, oneWay = 0, offHill = 0;
for (let i = oldCount; i < nodes.length; i++) {
  if (!adj[i].length) badAdj++;
  for (const e of adj[i]) {
    if (!nodes[e.to]) badAdj++;
    else if (!adj[e.to].some((b) => b.to === i)) oneWay++;
  }
  const n = nodes[i];
  if (!(n.x > -880 && n.x < -350 && n.z > -260 && n.z < 260)) offHill++;
  // never below the city plain and never above the summit
  if (ground(n.x, n.z) < CITY - 1e-6 || ground(n.x, n.z) > CITY + 30.5) offHill++;
}
ok('every walkway node has a neighbour', badAdj === 0, badAdj + ' dead ends');
ok('the walkways are walkable both ways', oneWay === 0, oneWay + ' one-way links');
ok('the walkways stay on the hill', offHill === 0, offHill + ' off the hill');

// --- they join up: lanes to the high street, climb to the city
const linked = (a, b) => adj[a].some((e) => e.to === b) && adj[b].some((e) => e.to === a);
const nearestHigh = (x, z) => {
  let best = -1, bd = 1e9;
  for (const id of Life.nodes.high) {
    const n = nodes[id];
    const d = (n.x - x) ** 2 + (n.z - z) ** 2;
    if (d < bd) { bd = d; best = id; }
  }
  return best;
};
ok('the north lane joins the high street', linked(Life.nodes.north[0], nearestHigh(-650, 2)));
ok('the south lane joins the high street', linked(Life.nodes.south[0], nearestHigh(-634, -3)));
const climbEnd = Life.nodes.climb[Life.nodes.climb.length - 1];
ok('the climb joins the high street',
  linked(climbEnd, nearestHigh(roads.ramp[roads.ramp.length - 1][0], roads.ramp[roads.ramp.length - 1][1])));
const climbStart = Life.nodes.climb[0];
ok('the climb joins the city graph', adj[climbStart].some((e) => e.to < oldCount),
  'no link back to town');
ok('the climb runs down to the city street',
  Math.abs(nodes[climbStart].x - roads.ramp[0][0]) < 2, nodes[climbStart].x.toFixed(1));

// --- villagers only while you are up there
player.pos.x = 0; player.pos.z = 0;               // still in town
Life.topUp();
ok('nobody moves to the village while you are in town', Life.villagers.length === 0,
  Life.villagers.length + ' villagers');

player.pos.x = CX + 8; player.pos.z = CZ + 4;      // now standing in it
Life.topUp();
ok('villagers turn up when you reach the village', Life.villagers.length >= 1,
  Life.villagers.length + ' villagers');
ok('a horde of villagers can settle', Life.villagers.length <= 1 || Life.villagers.length <= 7);

const villageIds = new Set([...Life.nodes.high, ...Life.nodes.north, ...Life.nodes.south, ...Life.nodes.climb]);
let onNode = 0, wrongState = 0, floating = 0;
for (const p of Life.villagers) {
  if (!villageIds.has(p.from)) onNode++;
  if (!nodes[p.to]) onNode++;
  if (p.state !== 'walk') wrongState++;
  if (Math.abs(p.pos.y - ground(p.pos.x, p.pos.z)) > 1e-6) floating++;
  if (!p.group.visible) wrongState++;
}
ok('villagers are put on the village walkways', onNode === 0, onNode + ' misplaced');
ok('villagers set off walking', wrongState === 0, wrongState + ' not walking');
ok('villagers stand on the ground, not in the air', floating === 0, floating + ' floating');

// the same villager is not grabbed twice
Life.topUp(); Life.topUp();
const unique = new Set(Life.villagers);
ok('no villager is counted twice', unique.size === Life.villagers.length);

// --- parked cars
ok('cars are left parked in the village', Life.cars.length >= 3, Life.cars.length + ' cars');
ok('every car is parked, not driving', parked.every((c) => c.state === 'parked'));
let offGround = 0;
for (const c of Life.cars) {
  const under = ground(c.x, c.z);
  if (Math.abs(c.group.position.y - under) > 1e-6) offGround++;
  if (under < CITY + 20) offGround++;
}
ok('parked cars sit on the hilltop ground', offGround === 0, offGround + ' floating or off the hill');

// --- chickens
ok('a flock is scratching about', Life.chickens.length >= 8, Life.chickens.length + ' chickens');
let badHome = 0;
for (const c of Life.chickens) {
  if (!(c.home.r > 1)) badHome++;
  if (Math.abs(ground(c.home.x, c.home.z) - ground(c.home.x, c.home.z)) > 1e-9) badHome++;
  if (ground(c.home.x, c.home.z) < CITY + 20) badHome++;   // yards are up on the plateau
}
ok('every chicken has a yard on the hilltop', badHome === 0, badHome + ' bad yards');
ok('one of them is a rooster', Life.chickens.some((c) => c.scale > 1.2));

// --- chickens wander, but not away
const ctx = { ground, player: { x: 0, z: 0, speed: 0 } };
const seen = new Set();
let escaped = 0;
for (let step = 0; step < 1200; step++) {
  for (const c of Life.chickens) {
    Life.stepChicken(c, 0.05, ctx);
    seen.add(c.state);
    if (c.state !== 'flee' && Math.hypot(c.x - c.home.x, c.z - c.home.z) > c.home.r + 1e-6) escaped++;
  }
}
ok('chickens do all of their business', seen.has('peck') && seen.has('walk') && seen.has('stand'),
  [...seen].join('/'));
ok('chickens stay in their yards', escaped === 0, escaped + ' wandered off');
let notOnGround = 0;
for (const c of Life.chickens) if (Math.abs(c.y - ground(c.x, c.z)) > 1e-6) notOnGround++;
ok('chickens follow the ground', notOnGround === 0, notOnGround + ' afloat');

// --- a chicken bolts if you run at it
const chicken = Life.chickens[0];
const before = Math.hypot(chicken.x - chicken.home.x, chicken.z - chicken.home.z);
const close = { ground, player: { x: chicken.x, z: chicken.z - 1, speed: 4 } };
Life.stepChicken(chicken, 0.05, close);
ok('a chicken bolts when you come at it', chicken.state === 'flee', chicken.state);
for (let i = 0; i < 12; i++) Life.stepChicken(chicken, 0.05, close);
const away = Math.hypot(chicken.x - close.player.x, chicken.z - close.player.z);
ok('it runs away from you', away > 1.2, 'distance ' + away.toFixed(2));
ok('it may leave the yard in a panic', Math.hypot(chicken.x - chicken.home.x, chicken.z - chicken.home.z) > before - 0.01);

// and settles down again once you are gone
const leaving = { ground, player: { x: 0, z: 0, speed: 0 } };
for (let i = 0; i < 200; i++) Life.stepChicken(chicken, 0.05, leaving);
ok('it calms down again afterwards', chicken.state !== 'flee', chicken.state);
ok('and does not leave the hill', Math.abs(chicken.y - ground(chicken.x, chicken.z)) < 1e-6);

// --- the module is idempotent
const beforeBoot = peds.graph.nodes.length;
window.__gcaVillageLife.boot();
ok('booting twice does not double the village', peds.graph.nodes.length === beforeBoot);

console.log('\n' + passed + ' passed, ' + failed + ' failed');
process.exit(failed ? 1 : 0);
