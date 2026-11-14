// Headless regression suite for the pedestrian / crowd systems.
//
// The game is one big HTML file, so this pulls the individual GCA helper
// functions out of it, runs them against a stub rig and asserts the
// behaviour the player would see. Run with:  node tests/ped-check.mjs
//
// Covers: head pivot clamp, gait variation, idle life, gunfire spotting,
// flee/duck poses, the activity system (dogs, jogging, ball, smoking,
// chat), court shooting, and the traffic-dodge reaction.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const html = fs.readFileSync(path.join(here, '..', 'Grand-Crupa-Auto-optimized-3.html'), 'utf8');

/* ---------------- extraction ---------------- */

function extractFn(src, name) {
  const start = src.indexOf('function ' + name + '(');
  if (start < 0) throw new Error('missing function ' + name);
  let depth = 0;
  for (let i = src.indexOf('{', start); i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') {
      depth--;
      if (depth === 0) return src.slice(start, i + 1);
    }
  }
  throw new Error('unbalanced function ' + name);
}

const FN = [
  '_pedSeed', '_pedGait', '_pedIdle', '_pedLook', '_pedDuck', '_pedSpot', '_pedFleePose',
  '_pedHeadClamp', '_gcaHeadGeo', '_gcaHeadNew', '_gcaHeadKids',
  '_gcaProp', '_gcaHideProps', '_gcaCourtReset', '_gcaActGuard', '_gcaFindPartner',
  '_gcaTryAct', '_gcaAct', '_pedActPose', '_gcaDodge', '_gcaDivePose',
];

const vars = [...html.matchAll(/var _gcaDogCol=[^;]+;/g)].map(m => m[0]).join('\n')
  + '\n' + 'var _gcaHY=1.55,_gcaHeadGeos=null;';

const src = vars + '\n' + FN.map(n => extractFn(html, n)).join('\n');

/* ---------------- stub rig ---------------- */

const rot = () => ({ x: 0, y: 0, z: 0, set(x, y, z) { this.x = x; this.y = y; this.z = z; }, rotateX(a) { this.x += a; }, rotateY(a) { this.y += a; }, rotateZ(a) { this.z += a; } });
const vec = () => ({ x: 0, y: 0, z: 0, set(x, y, z) { this.x = x; this.y = y; this.z = z; }, setScalar(s) { this.x = this.y = this.z = s; } });
const scale = () => ({ x: 1, y: 1, z: 1, set(x, y, z) { this.x = x; this.y = y; this.z = z; }, setScalar(s) { this.x = this.y = this.z = s; } });

class Obj {
  constructor() {
    this.children = [];
    this.position = vec();
    this.rotation = rot();
    this.scale = scale();
    this.visible = true;
    this.geometry = null;
    this.material = null;
  }
  add(...c) { this.children.push(...c); return this; }
  rotateX(a) { this.rotation.x += a; return this; }
  rotateY(a) { this.rotation.y += a; return this; }
  rotateZ(a) { this.rotation.z += a; return this; }
}

const W = { __gcaCourt: null };

const api = new Function(
  'window', 'Yt', 'J', 'Oe', 'Gt', 'fe', 'je', 'Ne', 'bn', 'Fn', 'se',
  src + `
  return { _pedSeed, _pedGait, _pedIdle, _pedLook, _pedDuck, _pedSpot, _pedFleePose,
    _pedHeadClamp, _gcaProp, _gcaHideProps, _gcaCourtReset, _gcaActGuard,
    _gcaFindPartner, _gcaTryAct, _gcaAct, _pedActPose, _gcaDodge, _gcaDivePose };
  `,
)(
  W,
  Obj, Obj, Obj, Obj, Obj,
  (c) => ({ color: c }),
  (a, b) => a + Math.random() * (b - a),
  (a, b) => Math.atan2(Math.sin(b - a), Math.cos(b - a)),
  (a, b, k, dt) => a + (b - a) * (1 - Math.exp(-k * dt)),
  (v, a, b) => Math.max(a, Math.min(b, v)),
);

const G = api;

/* ---------------- fixtures ---------------- */

function part() { return new Obj(); }

function makePed(over = {}) {
  const p = {
    group: part(), body: part(), head: part(), neck: part(),
    armL: part(), armR: part(), foreL: part(), foreR: part(),
    legL: part(), legR: part(), shinL: part(), shinR: part(),
    pos: { x: 0, z: 0 }, state: 'walk', speed: 1.2, t: 0, yaw: 0, phase: 0,
    active: true, dead: false, type: 'civ', walkSpd: 1.4,
    act: '', actT: 0, partner: null,
    ...over,
  };
  return p;
}

const manager = (peds) => ({ list: peds, veh: { list: [] }, pl: { x: 0, z: 0, alive: true } });

const DT = 1 / 60;
let passed = 0, failed = 0;
const failures = [];

function check(name, fn) {
  try {
    const r = fn();
    if (r === false) throw new Error('returned false');
    passed++;
  } catch (err) {
    failed++;
    failures.push(name + ' :: ' + err.message);
  }
}

const near = (a, b, eps = 1e-6) => Math.abs(a - b) <= eps;
function assert(cond, msg) { if (!cond) throw new Error(msg || 'assertion failed'); }

/* ---------------- head pivot ---------------- */

check('head yaw is clamped to 1.15', () => {
  const p = makePed(); p.head.rotation.y = 3;
  G._pedHeadClamp(p);
  assert(p.head.rotation.y === 1.15, 'got ' + p.head.rotation.y);
});
check('head pitch clamps both ways', () => {
  const a = makePed(), b = makePed();
  a.head.rotation.x = 2; b.head.rotation.x = -2;
  G._pedHeadClamp(a); G._pedHeadClamp(b);
  assert(a.head.rotation.x === 0.7 && b.head.rotation.x === -0.7);
});
check('head roll clamps', () => {
  const p = makePed(); p.head.rotation.z = -2;
  G._pedHeadClamp(p);
  assert(p.head.rotation.z === -0.55);
});
check('sane head rotation is untouched', () => {
  const p = makePed(); p.head.rotation.set(0.2, 0.4, -0.1);
  G._pedHeadClamp(p);
  assert(near(p.head.rotation.y, 0.4) && near(p.head.rotation.x, 0.2));
});

/* ---------------- gait ---------------- */

check('gait scales the leg swing while moving', () => {
  const p = makePed({ speed: 1.3, phase: 1 });
  p.legL.rotation.x = 1;
  G._pedGait(p, DT);
  assert(p.legL.rotation.x !== 1, 'leg untouched');
});
check('faster pedestrians take bigger strides', () => {
  const slow = makePed({ speed: 0.5, phase: 1 }), fast = makePed({ speed: 1.6, phase: 1 });
  slow.legL.rotation.x = fast.legL.rotation.x = 1;
  slow.legR.rotation.x = fast.legR.rotation.x = 1;
  G._pedSeed(slow); G._pedSeed(fast);
  slow._gA = fast._gA = 1.6; slow._gB = fast._gB = 1.6;
  G._pedGait(slow, DT); G._pedGait(fast, DT);
  assert(Math.abs(fast.legL.rotation.x) > Math.abs(slow.legL.rotation.x), 'no stride difference');
});
check('gait is skipped for the dead', () => {
  const p = makePed({ speed: 1.4, dead: true, phase: 1 });
  p.legL.rotation.x = 1;
  G._pedGait(p, DT);
  assert(p.legL.rotation.x === 1);
});

/* ---------------- idle life ---------------- */

check('idle pedestrians sway', () => {
  const p = makePed({ state: 'idle', speed: 0, t: 1.1 });
  G._pedSeed(p);
  G._pedIdle(p, DT);
  assert(Math.abs(p.body.rotation.z) > 0, 'no sway');
});
check('idle pose is skipped while walking', () => {
  const p = makePed({ state: 'idle', speed: 1.4, t: 1.1 });
  G._pedSeed(p);
  G._pedIdle(p, DT);
  assert(p.body.rotation.z === 0);
});

/* ---------------- spotting, ducking, fleeing ---------------- */

check('a pedestrian turns to look at the noise', () => {
  const p = makePed({ spotT: 1.5, spotX: 10, spotZ: 0, spotK: 0.5, yaw: 0 });
  G._pedSpot(p, DT);
  assert(Math.abs(p.head.rotation.y) > 0.05, 'head did not turn');
});
check('spotting expires', () => {
  const p = makePed({ spotT: 0.01, spotX: 10, spotZ: 0, yaw: 0 });
  p.head.rotation.y = 0.2;
  G._pedSpot(p, DT);
  assert(p.head.rotation.y === 0.2);
});
check('fleeing raises both arms', () => {
  const p = makePed({ state: 'flee', speed: 5, phase: 1, t: 2 });
  G._pedSeed(p);
  G._pedFleePose(p, DT);
  assert(p.armL.rotation.x < -1 && p.armR.rotation.x < -1, 'arms not up');
});
check('flee pose needs the flee state', () => {
  const p = makePed({ state: 'walk', speed: 5 });
  G._pedSeed(p);
  G._pedFleePose(p, DT);
  assert(p.armL.rotation.x === 0);
});
check('ducking lowers the body', () => {
  const p = makePed({ duckT: 0.5, duck: 1 });
  G._pedDuck(p, DT);
  assert(p.body.position.y < 0, 'body did not drop: ' + p.body.position.y);
});

/* ---------------- activities ---------------- */

check('activities are gated by distance to the player', () => {
  const p = makePed({ state: 'idle' });
  const m = manager([p]);
  m.pl.x = 400; m.pl.z = 400;
  let any = false;
  for (let i = 0; i < 200; i++) { p.act = ''; if (G._gcaTryAct(m, p)) any = true; }
  assert(!any && p.act === '', 'started an activity 400 m away');
});
check('idle pedestrians pick activities when the player is close', () => {
  const p = makePed();
  const m = manager([p]);
  const seen = new Set();
  for (let i = 0; i < 400; i++) {
    p.act = ''; p.state = 'idle'; p.partner = null;
    G._gcaTryAct(m, p);
    if (p.act) seen.add(p.act);
  }
  assert(seen.size >= 3, 'too few activity types: ' + [...seen]);
  assert([...seen].every(a => ['dog', 'jog', 'ball', 'smoke', 'chat'].includes(a)));
});
check('dead pedestrians never start activities', () => {
  const p = makePed({ dead: true });
  const m = manager([p]);
  for (let i = 0; i < 100; i++) G._gcaTryAct(m, p);
  assert(p.act === '');
});
check('dog walkers get a slower walk speed and give it back', () => {
  const p = makePed({ walkSpd: 1.5 });
  p.act = 'dog'; p.actT = 10; p.state = 'walk';
  G._gcaHideProps(p);
  G._gcaActGuard(p, 30);
  assert(p.act === '' && p.walkSpd === 1.5, 'speed not restored');
});
check('an activity survives while the pedestrian keeps walking', () => {
  const p = makePed();
  p.act = 'dog'; p.actT = 5; p.state = 'walk';
  G._gcaActGuard(p, DT);
  assert(p.act === 'dog', 'act dropped too early');
});
check('dying cancels the activity and hides props', () => {
  const p = makePed();
  p.act = 'dog'; p.actT = 5; p.state = 'walk';
  G._pedActPose(p, DT);
  const dog = p._gca_p_dog;
  assert(dog && dog.visible, 'dog never appeared');
  p.dead = true;
  G._gcaActGuard(p, DT);
  assert(p.act === '' && !dog.visible, 'dog still showing after death');
});
check('chat pairs both pedestrians up facing each other', () => {
  const a = makePed({ pos: { x: 0, z: 0 } });
  const b = makePed({ pos: { x: 2, z: 0 } });
  const m = manager([a, b]);
  const mate = G._gcaFindPartner(m, a);
  assert(mate === b && b.act === 'chat' && a.partner === b, 'no chat pair');
  assert(mate.state === 'act');
});

/* ---------------- activity poses ---------------- */

check('the ball is dribbled low during a basketball act', () => {
  const p = makePed();
  p.act = 'ball'; p.actT = 10; p.state = 'act'; p.actPh = 0.4; p._gcaAt = 0;
  G._pedActPose(p, DT);
  const ball = p._gca_p_ball;
  assert(ball && ball.visible, 'ball missing');
  assert(ball.position.y > 0 && ball.position.y < 1, 'ball not near the ground');
});
check('a court shot climbs to rim height', () => {
  const p = makePed({ pos: { x: 0, z: 0 } });
  p.act = 'ball'; p.actT = 10; p.state = 'act'; p._gcaAt = 1;
  p._gcaHo = { x: 0, z: 5, dir: 1 };
  p.actPh = 7.14;
  G._pedActPose(p, DT);
  const ball = p._gca_p_ball;
  assert(ball.position.y > 2.6, 'shot never got up: ' + ball.position.y);
  assert(ball.position.z > 3, 'shot did not travel toward the hoop');
});
check('dog walkers get four legs and a leash', () => {
  const p = makePed({ speed: 1.3 });
  p.act = 'dog'; p.actT = 10; p.state = 'walk'; p.t = 1;
  G._pedActPose(p, DT);
  const dog = p._gca_p_dog, leash = p._gca_p_leash;
  assert(dog.visible && p._gcaDogLegs.length === 4, 'dog rig incomplete');
  assert(leash.visible && leash.scale.z > 0.4, 'leash not stretched');
});
check('smokers produce a puff', () => {
  const p = makePed();
  p.act = 'smoke'; p.actT = 10; p.state = 'act'; p.t = 2;
  G._pedActPose(p, DT);
  assert(p._gca_p_cig.visible, 'no cigarette');
  assert(p._gca_p_puff.visible, 'no puff at t=2');
});
check('joggers lean forward with tucked arms', () => {
  const p = makePed({ speed: 3.2, phase: 1 });
  p.act = 'jog'; p.state = 'walk'; p.actT = 10;
  G._pedActPose(p, DT);
  assert(p.body.rotation.x < 0 && p.foreR.rotation.x < -1);
});
check('ball activity on court walks toward a hoop spot', () => {
  const p = makePed({ pos: { x: 0, z: 0 } });
  const m = manager([p]);
  m._move = (t, e, x, z) => { t._movedTo = { x, z }; };
  W.__gcaCourt = { x: 20, z: 0, hoops: [{ x: 10, z: 0, dir: 1 }, { x: 30, z: 0, dir: -1 }] };
  p.act = 'ball'; p.actT = 20; p.state = 'act'; p._gcaAt = 1; p.actPh = 0;
  G._gcaAct(m, p, DT);
  assert(p._gcaHo && p._gcaSpot, 'no hoop target chosen');
  assert(m._move && p._movedTo, 'never walked anywhere');
});

/* ---------------- traffic dodge ---------------- */

function withCar(p, { dx = 0, dz = -4, yaw = 0, speed = 12 } = {}) {
  const m = manager([p]);
  const car = { x: p.pos.x + dx, z: p.pos.z + dz, yaw, speed, vx: Math.sin(yaw) * speed, vz: Math.cos(yaw) * speed, wreck: false };
  m.veh.list.push(car);
  return m;
}

check('pedestrians dive away from an oncoming car', () => {
  const p = makePed({ pos: { x: 0, z: 0 } });
  const m = withCar(p);
  G._gcaDodge(m, p, DT);
  assert(p.diveT > 0, 'no dive');
  assert(Math.hypot(p.kx, p.kz) > 3, 'no sideways impulse');
});
check('they ignore a car driving away', () => {
  const p = makePed({ pos: { x: 0, z: 0 } });
  const m = withCar(p, { dz: -4, yaw: Math.PI });
  m.veh.list[0].vz = -12;
  G._gcaDodge(m, p, DT);
  assert(!(p.diveT > 0), 'dived for a car heading the other way');
});
check('they ignore slow cars', () => {
  const p = makePed({ pos: { x: 0, z: 0 } });
  const m = withCar(p, { speed: 2 });
  G._gcaDodge(m, p, DT);
  assert(!(p.diveT > 0));
});
check('a dive has a cooldown', () => {
  const p = makePed({ pos: { x: 0, z: 0 } });
  const m = withCar(p);
  G._gcaDodge(m, p, DT);
  p.diveT = 0;
  G._gcaDodge(m, p, DT);
  assert(p.diveT === 0, 'dived again inside the cooldown');
});
check('diving cancels an activity and hides its props', () => {
  const p = makePed({ pos: { x: 0, z: 0 } });
  p.act = 'dog'; p.actT = 8; p.state = 'walk';
  G._pedActPose(p, DT);
  assert(p._gca_p_dog.visible);
  const m = withCar(p);
  G._gcaDodge(m, p, DT);
  assert(p.act === '' && p._gca_p_dog && !p._gca_p_dog.visible, 'dog kept showing during the dive');
});
check('the dive pose hops and leans', () => {
  const p = makePed({ diveT: 0.8, diveSide: 1 });
  let peak = 0;
  for (let i = 0; i < 30; i++) {
    p.group.position.y = 0;
    G._gcaDivePose(p, DT);
    peak = Math.max(peak, p.group.position.y);
    p.diveT -= DT;
  }
  assert(peak > 0.05, 'no hop: ' + peak);
  assert(p.body.rotation.z < 0, 'no lean');
  assert(p.armL.rotation.x < -0.5, 'arms not raised');
});

/* ---------------- report ---------------- */

console.log(`\n${passed} passed, ${failed} failed`);
if (failures.length) {
  console.log('\nfailures:');
  for (const f of failures) console.log('  - ' + f);
  process.exit(1);
}
