// Headless regression suite for the vehicle systems.
//
// Like the pedestrian suite, this lifts the real functions out of the game
// file and drives them with stubs. Run with:  node tests/vehicle-check.mjs
//
// Covers: tyre marks (when they appear, spacing, distance gating, cleanup),
// brake lights (lazy creation, state, sharing, placement) and crash damage
// (armour, wrecking, hooks).

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const html = fs.readFileSync(path.join(here, '..', 'Grand-Crupa-Auto-optimized-3.html'), 'utf8');

/* ---------------- extraction ---------------- */

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

function extractMethod(src, marker) {
  const start = src.indexOf(marker);
  if (start < 0) throw new Error('missing method ' + marker);
  return 'function ' + src.slice(start, braceMatch(src, start) + 1);
}

const fns = [
  extractFn(html, '_gcaSkid'),
  extractFn(html, '_gcaCarLights'),
  extractMethod(html, 'damage(t,e,n="crash"){'),
].join('\n');

/* ---------------- stubs ---------------- */

class Vec {
  constructor(x = 0, y = 0, z = 0) { this.x = x; this.y = y; this.z = z; }
  set(x, y, z) { this.x = x; this.y = y; this.z = z; return this; }
}

class Rot { constructor() { this.x = 0; this.y = 0; this.z = 0; } }

class StubMesh {
  constructor(geo, mat) { this.geometry = geo; this.material = mat; this.position = new Vec(); this.rotation = new Rot(); this.visible = true; }
}

class StubGeo { constructor(w, h) { this.w = w; this.h = h; } }
class StubMat { constructor(o = {}) { Object.assign(this, o); } }

const THREE = { Mesh: StubMesh, PlaneGeometry: StubGeo, MeshBasicMaterial: StubMat, AdditiveBlending: 2, DoubleSide: 2 };

const playerPos = { x: 0, z: 0 };
const fx = { smoked: 0, smoke() { this.smoked++; } };

const api = new Function(
  'window', 'ae', 'vi', 'R',
  'var _gcaSkidSys=null, _gcaBrakeMat=null, _gcaSkidTmp=0;\n' + fns + `
  return {
    _gcaSkid, _gcaCarLights, damage,
    setSkid: function (s) { _gcaSkidSys = s },
    getMat: function () { return _gcaBrakeMat },
  };`,
)(
  { __GCA_T: THREE },
  { groundHeight: () => 0.15 },
  fx,
  { pos: playerPos },
);

const V = api;

/* ---------------- fixtures ---------------- */

function makeVehicle(over = {}) {
  const group = { children: [], add(o) { this.children.push(o); return this; } };
  return {
    x: 0, z: 0, yaw: 0, speed: 0, latSlip: 0, hbrake: false, throttle: 0,
    health: 100, wreck: false, burnT: 0, steer: 0,
    def: { L: 4, W: 2, armor: 1 },
    group,
    ...over,
  };
}

function fakeSkids() {
  return {
    segs: [],
    seg(x1, z1, x2, z2, y, w) { this.segs.push({ x1, z1, x2, z2, y, w }); },
  };
}

function at(x, z) { playerPos.x = x; playerPos.z = z; }

let passed = 0, failed = 0;
const failures = [];

function check(name, fn) {
  try {
    at(0, 0);
    fn();
    passed++;
  } catch (err) {
    failed++;
    failures.push(name + ' :: ' + err.message);
  }
}

function assert(cond, msg) { if (!cond) throw new Error(msg || 'assertion failed'); }

/* ---------------- tyre marks ---------------- */

check('no marks when rolling slowly', () => {
  const s = fakeSkids(); V.setSkid(s);
  const v = makeVehicle({ speed: 2, hbrake: true });
  V._gcaSkid(v, 1 / 60);
  v.x += 1;
  V._gcaSkid(v, 1 / 60);
  assert(s.segs.length === 0, 'marked at walking pace');
});
check('handbraking at speed leaves paired marks', () => {
  const s = fakeSkids(); V.setSkid(s);
  const v = makeVehicle({ speed: 12, hbrake: true });
  V._gcaSkid(v, 1 / 60);
  v.x += 1;
  V._gcaSkid(v, 1 / 60);
  assert(s.segs.length === 2, 'expected two streaks, got ' + s.segs.length);
});
check('sliding marks the road without the handbrake', () => {
  const s = fakeSkids(); V.setSkid(s);
  const v = makeVehicle({ speed: 10, latSlip: 4 });
  V._gcaSkid(v, 1 / 60);
  v.x += 1;
  V._gcaSkid(v, 1 / 60);
  assert(s.segs.length === 2);
});
check('a drifting car does not double-mark when barely moving', () => {
  const s = fakeSkids(); V.setSkid(s);
  const v = makeVehicle({ speed: 10, latSlip: 4 });
  V._gcaSkid(v, 1 / 60);
  v.x += 1;
  V._gcaSkid(v, 1 / 60);
  const before = s.segs.length;
  v.x += 0.1;
  V._gcaSkid(v, 1 / 60);
  assert(s.segs.length === before, 'drew a segment under the spacing threshold');
});
check('marks sit on the ground and are the right width', () => {
  const s = fakeSkids(); V.setSkid(s);
  const v = makeVehicle({ speed: 12, hbrake: true, gy: 0 });
  V._gcaSkid(v, 1 / 60);
  v.x += 1;
  V._gcaSkid(v, 1 / 60);
  const seg = s.segs[0];
  assert(Math.abs(seg.y - 0.03) < 1e-9, 'wrong height: ' + seg.y);
  assert(Math.abs(seg.w - 0.26) < 1e-9, 'wrong width: ' + seg.w);
});
check('marks are left near the car, and behind it', () => {
  const s = fakeSkids(); V.setSkid(s);
  const v = makeVehicle({ speed: 12, hbrake: true, x: 50, z: 50 });
  V._gcaSkid(v, 1 / 60);
  v.x += 1;
  V._gcaSkid(v, 1 / 60);
  // yaw 0 means +z is forward, so the streaks must trail behind the centre line
  assert(s.segs.every(g => g.z1 < 49.5), 'marks are not behind the car');
  assert(s.segs.every(g => Math.abs(g.x1 - 50) < 1.5), 'marks are not near the car');
});
check('traffic just outside the 90 m gate leaves no marks', () => {
  const s = fakeSkids(); V.setSkid(s);
  const v = makeVehicle({ speed: 12, hbrake: true, x: 0, z: 120 });
  at(0, 0);
  V._gcaSkid(v, 1 / 60);
  v.x += 2;
  V._gcaSkid(v, 1 / 60);
  assert(s.segs.length === 0, 'marked 120 m away');
});
check('traffic just inside the gate does mark', () => {
  const s = fakeSkids(); V.setSkid(s);
  const v = makeVehicle({ speed: 12, hbrake: true, x: 0, z: 60 });
  at(0, 0);
  V._gcaSkid(v, 1 / 60);
  v.x += 2;
  V._gcaSkid(v, 1 / 60);
  assert(s.segs.length === 2, 'no marks 60 m away');
});
check('wrecked cars leave no marks', () => {
  const s = fakeSkids(); V.setSkid(s);
  const v = makeVehicle({ speed: 12, hbrake: true, wreck: true });
  V._gcaSkid(v, 1 / 60);
  v.x += 2;
  V._gcaSkid(v, 1 / 60);
  assert(s.segs.length === 0);
});
check('gripping again clears the trail anchor', () => {
  const s = fakeSkids(); V.setSkid(s);
  const v = makeVehicle({ speed: 12, hbrake: true });
  V._gcaSkid(v, 1 / 60);
  v.x += 1;
  V._gcaSkid(v, 1 / 60);
  assert(v._gcaSk, 'anchor missing while sliding');
  v.hbrake = false; v.latSlip = 0;
  V._gcaSkid(v, 1 / 60);
  assert(!v._gcaSk, 'anchor survived the end of the slide');
});
check('sliding throws smoke', () => {
  const s = fakeSkids(); V.setSkid(s);
  const before = fx.smoked;
  const v = makeVehicle({ speed: 12, hbrake: true });
  for (let i = 0; i < 120; i++) { v.x += 0.6; V._gcaSkid(v, 1 / 60); }
  assert(fx.smoked > before, 'no tyre smoke');
});

/* ---------------- brake lights ---------------- */

check('lights are built once and reused', () => {
  const v = makeVehicle();
  V._gcaCarLights(v, 1 / 60);
  V._gcaCarLights(v, 1 / 60);
  V._gcaCarLights(v, 1 / 60);
  assert(v.group.children.length === 1, 'built ' + v.group.children.length + ' meshes');
});
check('lights sit at the back of the car', () => {
  const v = makeVehicle({ def: { L: 4.4, W: 2, armor: 1 } });
  V._gcaCarLights(v, 1 / 60);
  const q = v._gcalt;
  assert(q.position.z < 0, 'light is not behind the car: ' + q.position.z);
  assert(q.position.y > 0.3 && q.position.y < 1.2, 'light at a strange height');
  assert(q.geometry.w > 1, 'light bar too narrow');
});
check('dark at a standstill', () => {
  const v = makeVehicle({ speed: 0 });
  V._gcaCarLights(v, 1 / 60);
  assert(v._gcalt.visible === false);
});
check('brake lights come on when braking', () => {
  const v = makeVehicle({ speed: 8, hbrake: true });
  V._gcaCarLights(v, 1 / 60);
  assert(v._gcalt.visible === true, 'no brake light while braking');
});
check('brake lights go out when the brake is released', () => {
  const v = makeVehicle({ speed: 8, hbrake: true });
  V._gcaCarLights(v, 1 / 60);
  v.hbrake = false;
  V._gcaCarLights(v, 1 / 60);
  assert(v._gcalt.visible === false);
});
check('reversing shows the lights too', () => {
  const v = makeVehicle({ speed: -2 });
  V._gcaCarLights(v, 1 / 60);
  assert(v._gcalt.visible === true);
});
check('wrecked cars get no lights', () => {
  const v = makeVehicle({ speed: 8, hbrake: true, wreck: true });
  V._gcaCarLights(v, 1 / 60);
  assert(!v._gcalt, 'wrecked car grew lights');
});
check('distant cars get no lights', () => {
  const v = makeVehicle({ speed: 8, hbrake: true, x: 400, z: 400 });
  V._gcaCarLights(v, 1 / 60);
  assert(!v._gcalt, 'lit a car 500 m away');
});
check('all cars share one light material', () => {
  const a = makeVehicle({ speed: 8, hbrake: true });
  const b = makeVehicle({ speed: 8, hbrake: true, x: 3 });
  V._gcaCarLights(a, 1 / 60);
  V._gcaCarLights(b, 1 / 60);
  assert(a._gcalt.material === b._gcalt.material, 'each car allocated its own material');
});

/* ---------------- damage ---------------- */

function hit(v, amount, source, ctx = {}) {
  return V.damage.call({ hooks: ctx }, v, amount, source);
}

check('damage takes health away', () => {
  const v = makeVehicle({ health: 100 });
  hit(v, 25, 'crash');
  assert(v.health === 75, 'health is ' + v.health);
});
check('armour reduces bullet damage', () => {
  const plain = makeVehicle({ health: 100 });
  const armoured = makeVehicle({ health: 100, def: { L: 4, W: 2, armor: 0.5 } });
  hit(plain, 20, 'bullet');
  hit(armoured, 20, 'bullet');
  assert(plain.health === 80 && armoured.health === 90, 'armour not applied: ' + armoured.health);
});
check('armour does not blunt collisions', () => {
  const v = makeVehicle({ health: 100, def: { L: 4, W: 2, armor: 0.5 } });
  hit(v, 20, 'crash');
  assert(v.health === 80, 'armour applied to a crash');
});
check('a wrecked car is flagged and stops', () => {
  const v = makeVehicle({ health: 30, throttle: 1, steer: 0.4 });
  hit(v, 40, 'crash');
  assert(v.health === 0 && v.wreck === true);
  assert(v.throttle === 0 && v.hbrake === true, 'wreck kept driving');
  assert(v.burnT === 0);
});
check('the wreck hook fires once, with the cause', () => {
  const seen = [];
  const v = makeVehicle({ health: 10 });
  hit(v, 50, 'bullet', { onWreck: (car, why) => seen.push(why) });
  hit(v, 50, 'bullet', { onWreck: (car, why) => seen.push(why) });
  assert(seen.length === 1 && seen[0] === 'bullet', 'hook fired ' + seen.length + ' times');
});
check('an already wrecked car takes no more damage', () => {
  const v = makeVehicle({ health: 0, wreck: true });
  hit(v, 25, 'crash');
  assert(v.health === 0);
});
check('zero or negative damage is ignored', () => {
  const v = makeVehicle({ health: 50 });
  hit(v, 0, 'crash');
  hit(v, -10, 'crash');
  assert(v.health === 50, 'health moved to ' + v.health);
});

/* ---------------- report ---------------- */

console.log(`\n${passed} passed, ${failed} failed`);
if (failures.length) {
  console.log('\nfailures:');
  for (const f of failures) console.log('  - ' + f);
  process.exit(1);
}
