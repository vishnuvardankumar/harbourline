// Harbourline: boot and the one loop. A fixed 60 Hz simulation feeds a
// render at the display's rate. Rounds, money, the bomb and the score live
// here, in one place; movement, weapons, bots and grenades each own their
// own module. ?shot=start|play|end with &seed=N sets up a deterministic
// frame for a capture, renders it twice, then freezes it and sets
// window.__shotReady.
import * as THREE from 'three';
import { PALETTE } from './palette.js';
import { createWorld, SITES, SPAWNS, ROUTES } from './world.js';
import { createInput } from './input.js';
import { createPlayer } from './player.js';
import { createWeapon, WEAPONS } from './weapons.js';
import { createBots } from './bots.js';
import { createGrenades } from './grenades.js';
import { createHud } from './hud.js';

const FIXED_STEP = 1 / 60;
const ROUND_SECONDS = 100;
const BUY_SECONDS = 20;
const WIN_ROUNDS = 5;
const MAX_ROUNDS = 9;
const BOMB_TIMER = 35;
const PLANT_SECONDS = 3;
const DEFUSE_SECONDS = 5;
const KILL_REWARD = 300;
const WIN_REWARD = 300;
const LOSS_REWARD = 200;

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seed = Number.parseInt(params.get('seed') ?? '1', 10) || 1;

function mulberry32(initial) {
  let a = initial;
  return function random() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const random = mulberry32(seed);

const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.getElementById('game').appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(PALETTE.canvas);
scene.fog = new THREE.Fog(new THREE.Color(PALETTE.canvas), 24, 60);
const camera = new THREE.PerspectiveCamera(74, window.innerWidth / window.innerHeight, 0.05, 160);
scene.add(camera);

const world = createWorld(scene);
const bots = createBots(scene, world, ROUTES);
const weapon = createWeapon(camera);
const grenades = createGrenades(scene, world);
const hud = createHud();
const player = createPlayer(world.colliders, SPAWNS.attack[1]);
const input = createInput(renderer.domElement, onLockChange);
const raycaster = new THREE.Raycaster();
raycaster.far = 90;
const shootables = world.shootables.concat(bots.hitMeshes);
const direction = new THREE.Vector3();
const aimPoint = new THREE.Vector3();

// Match state, kept in one object.
const match = {
  phase: 'menu', // menu | buy | play | roundEnd | matchEnd
  round: 1,
  scoreAttack: 0,
  scoreDefend: 0,
  money: 800,
  roundTime: ROUND_SECONDS,
  buyTime: BUY_SECONDS,
  roundEndAt: 0,
  bomb: { state: 'carried', site: null, timer: BOMB_TIMER, position: new THREE.Vector3() },
  plantProgress: 0,
  defuseProgress: 0,
  defuser: null,
  kills: 0,
};
const body = player.state;
let elapsed = 0;
let frozen = false;
let started = false;
let accumulator = 0;
let lastTime = performance.now();
let prevFiring = false;

function syncCamera() {
  camera.position.set(body.position.x, body.position.y + body.eye, body.position.z);
  camera.rotation.set(body.pitch, body.yaw, 0, 'YXZ');
}

function pushHud() {
  hud.setAmmo(weapon.state.mag, weapon.state.reserve, weapon.def.name, weapon.state.grenades);
  hud.setHealth(body.health);
  hud.setMoney(match.money);
  hud.setTimer(match.roundTime);
  hud.setScore(match.scoreAttack, match.scoreDefend);
  hud.setRound(match.round);
  const bomb = match.bomb;
  hud.setBomb(
    bomb.state === 'planted' ? `Planted ${Math.ceil(bomb.timer)}s` :
    bomb.state === 'carried' ? 'Carried' :
    bomb.state === 'defused' ? 'Defused' : 'Detonated',
  );
}

function feed(text) {
  hud.feedLine(text);
}

function siteAt(pos) {
  for (const site of Object.values(SITES)) {
    if (Math.hypot(pos.x - site.centre.x, pos.z - site.centre.z) < site.radius) return site;
  }
  return null;
}

function botActors(now) {
  const list = [];
  if (body.alive) {
    list.push({
      pos: new THREE.Vector3(body.position.x, 1.5, body.position.z),
      team: 'attack', alive: true, isPlayer: true, ref: body,
    });
  }
  for (const bot of bots.bots) {
    if (!bot.alive) continue;
    list.push({
      pos: new THREE.Vector3(bot.position.x, 1.5, bot.position.z),
      team: bot.team, alive: true, isPlayer: false, ref: bot,
    });
  }
  return list;
}

function damagePlayer(amount, fromName) {
  if (!body.alive) return;
  body.health -= amount;
  hud.damageFlash();
  pushHud();
  if (body.health <= 0) {
    body.health = 0;
    body.alive = false;
    feed(`${fromName} eliminated you`);
    hud.banner('You are down — your team fights on', 2600);
  }
}

function onBotShoot(bot, target, hitChance) {
  if (random() > hitChance) return;
  const damage = 9 + Math.floor(random() * 10);
  if (target.isPlayer) {
    damagePlayer(damage, bot.name);
  } else if (target.ref && target.ref.alive) {
    const killed = bots.damage(target.ref, damage);
    if (killed) {
      feed(`${bot.name} eliminated ${target.ref.name}`);
      if (target.ref.team === 'defend') match.money += 0;
    }
  }
}

function shoot(spread) {
  if (!weapon.takeRound()) return false;
  camera.getWorldDirection(direction);
  direction.x += (random() * 2 - 1) * spread;
  direction.y += (random() * 2 - 1) * spread;
  direction.z += (random() * 2 - 1) * spread;
  direction.normalize();
  scene.updateMatrixWorld(true);
  raycaster.set(camera.position, direction);
  const hit = raycaster.intersectObjects(shootables, false)[0];
  if (hit) {
    const bot = hit.object.userData.bot;
    if (bot && bot.alive) {
      const isHead = hit.object.userData.part === 'head';
      const amount = Math.round(weapon.def.damage * (isHead ? weapon.def.headMul : 1));
      const killed = bots.damage(bot, amount);
      match.kills += killed ? 1 : 0;
      if (killed) {
        match.money += KILL_REWARD;
        feed(`You eliminated ${bot.name}${isHead ? ' — headshot' : ''}  +$${KILL_REWARD}`);
      }
      hud.hitMarker(killed, shot ? 4000 : 90);
    }
  }
  weapon.pullTrigger();
  player.recoil(weapon.def.kick + random() * 0.004, (random() * 2 - 1) * 0.004);
  pushHud();
  return true;
}

function throwGrenade() {
  if (weapon.state.grenades <= 0) return;
  camera.getWorldDirection(direction);
  aimPoint.copy(camera.position);
  if (grenades.throwFrom(aimPoint, direction)) {
    weapon.state.grenades -= 1;
    feed('You threw a frag grenade');
    pushHud();
  }
}

function buy(id) {
  if (match.phase !== 'buy') return;
  if (id === 'grenade') {
    if (match.money < 300 || weapon.state.grenades >= 2) return;
    match.money -= 300;
    weapon.state.grenades += 1;
    feed('Bought a frag grenade');
  } else {
    const def = WEAPONS[id];
    if (!def || match.money < def.price) return;
    match.money -= def.price;
    weapon.equip(id);
    feed(`Bought ${def.name}`);
  }
  pushHud();
  if (match.phase === 'buy') hud.showBuy(match.money, buy, deploy);
}

function startRound() {
  match.phase = 'buy';
  match.roundTime = ROUND_SECONDS;
  match.buyTime = BUY_SECONDS;
  match.bomb = { state: 'carried', site: null, timer: BOMB_TIMER, position: new THREE.Vector3() };
  match.plantProgress = 0;
  match.defuseProgress = 0;
  match.defuser = null;
  player.reset(SPAWNS.attack[1]);
  weapon.equip(match.round === 1 ? 'raptor' : weapon.state.id);
  weapon.refill();
  if (match.round === 1) weapon.state.grenades = 0;
  bots.reset(SPAWNS);
  hud.hideOverlay();
  hud.showBuy(match.money, buy, deploy);
  pushHud();
}

function deploy() {
  if (match.phase !== 'buy') return;
  hud.hideBuy();
  match.phase = 'play';
  started = true;
  if (!shot) input.requestLock();
  hud.banner(`Round ${match.round} — plant the device at A or B`, 2600);
}

function endRound(winner, reason) {
  if (match.phase !== 'play' && match.phase !== 'buy') return;
  match.phase = 'roundEnd';
  match.roundEndAt = elapsed;
  if (winner === 'attack') {
    match.scoreAttack += 1;
    match.money += WIN_REWARD;
  } else {
    match.scoreDefend += 1;
    match.money += LOSS_REWARD;
  }
  hud.hideBuy();
  if (document.pointerLockElement) document.exitPointerLock();
  feed(`${winner === 'attack' ? 'Vipers' : 'Wardens'} take round ${match.round} — ${reason}`);
  hud.banner(`${winner === 'attack' ? 'Vipers' : 'Wardens'} win the round — ${reason}`, 3200);
  pushHud();
}

function endMatch() {
  match.phase = 'matchEnd';
  const won = match.scoreAttack > match.scoreDefend;
  hud.showEnd(
    won ? 'Vipers win the match' : 'Wardens win the match',
    `Final score Vipers ${match.scoreAttack} — ${match.scoreDefend} Wardens. ${match.kills} eliminations by you.`,
    'Play again',
  );
  if (document.pointerLockElement) document.exitPointerLock();
}

function nextAfterRound() {
  if (match.scoreAttack >= WIN_ROUNDS || match.scoreDefend >= WIN_ROUNDS || match.round >= MAX_ROUNDS) {
    endMatch();
    return;
  }
  match.round += 1;
  startRound();
}

function stepBots(dt, now) {
  const list = botActors(now);
  for (const bot of bots.bots) {
    bots.step(bot, dt, now, list, onBotShoot);
  }
}

function stepBomb(dt) {
  const bomb = match.bomb;
  if (bomb.state === 'planted') {
    bomb.timer -= dt;
    // A defender standing on the bomb defuses it over 5 seconds.
    const defuser = bots.alive('defend').find((b) => Math.hypot(b.position.x - bomb.position.x, b.position.z - bomb.position.z) < 2);
    if (defuser) {
      match.defuseProgress += dt;
      if (match.defuseProgress >= DEFUSE_SECONDS) {
        bomb.state = 'defused';
        feed(`${defuser.name} defused the device`);
        endRound('defend', 'device defused');
        return;
      }
    } else {
      match.defuseProgress = 0;
    }
    if (bomb.timer <= 0) {
      bomb.state = 'exploded';
      feed('The device detonated');
      endRound('attack', 'device detonated');
    }
  }
}

function stepPlant(dt, keys) {
  const bomb = match.bomb;
  if (bomb.state !== 'carried' || !body.alive) {
    match.plantProgress = 0;
    return;
  }
  const site = siteAt(body.position);
  if (!site || !keys.has('KeyE')) {
    match.plantProgress = 0;
    return;
  }
  match.plantProgress += dt;
  hud.setBomb(`Planting ${site.name}… ${Math.ceil(PLANT_SECONDS - match.plantProgress)}s`);
  if (match.plantProgress >= PLANT_SECONDS) {
    bomb.state = 'planted';
    bomb.site = site;
    bomb.timer = BOMB_TIMER;
    bomb.position.set(site.centre.x, 0, site.centre.z);
    match.plantProgress = 0;
    feed(`You planted the device at site ${site.name}`);
    hud.banner('Device planted — hold the site', 2600);
  }
}

function checkRoundEnd() {
  if (match.phase !== 'play') return;
  const attackersAlive = (body.alive ? 1 : 0) + bots.countAlive('attack');
  const defendersAlive = bots.countAlive('defend');
  if (match.bomb.state === 'carried' || match.bomb.state === 'planted') {
    if (defendersAlive === 0 && match.bomb.state !== 'planted') {
      endRound('attack', 'defenders eliminated');
      return;
    }
    if (attackersAlive === 0 && match.bomb.state !== 'planted') {
      endRound('defend', 'attackers eliminated');
      return;
    }
    if (attackersAlive === 0 && match.bomb.state === 'planted') {
      // Planted and no attackers left: defenders still must defuse, but the
      // bomb will detonate on its timer; keep playing until it does.
    }
  }
  if (match.roundTime <= 0 && match.bomb.state === 'carried') {
    endRound('defend', 'time expired, device not planted');
  }
}

function step(dt) {
  elapsed += dt;
  if (match.phase === 'play') {
    match.roundTime -= dt;
    player.step(dt, input.state.keys);
    weapon.step(dt);
    stepBots(dt, elapsed);
    stepPlant(dt, input.state.keys);
    stepBomb(dt);
    const blast = grenades.step(dt);
    if (blast) {
      const victims = [];
      if (body.alive) victims.push({ pos: body.position, isPlayer: true, ref: body });
      for (const bot of bots.bots) if (bot.alive) victims.push({ pos: bot.position, isPlayer: false, ref: bot });
      for (const victim of victims) {
        const d = Math.hypot(victim.pos.x - blast.position.x, victim.pos.z - blast.position.z);
        if (d > blast.radius) continue;
        const amount = grenades.damageAt(blast.position, d);
        if (victim.isPlayer) damagePlayer(amount, 'grenade');
        else if (bots.damage(victim.ref, amount)) feed(`Grenade eliminated ${victim.ref.name}`);
      }
    }
    checkRoundEnd();
  } else if (match.phase === 'roundEnd') {
    weapon.step(dt);
    if (elapsed - match.roundEndAt > 4) nextAfterRound();
  } else if (match.phase === 'buy') {
    match.buyTime -= dt;
    if (match.buyTime <= 0) deploy();
  }
  pushHud();
}

function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min((now - lastTime) / 1000, 0.1);
  lastTime = now;
  if (!frozen) {
    const look = input.takeLook();
    if (match.phase === 'play' && body.alive) player.look(look.x, look.y);
    const pressed = input.takePressed();
    for (const code of pressed) {
      if (code === 'KeyR' && match.phase === 'play') weapon.reload();
      if (code === 'KeyG' && match.phase === 'play') throwGrenade();
      if (code === 'Digit1' && match.phase === 'buy') buy('raptor');
      if (code === 'Digit2' && match.phase === 'buy') buy('hush');
      if (code === 'Digit3' && match.phase === 'buy') buy('longbow');
      if (code === 'Digit4' && match.phase === 'buy') buy('grenade');
      if (code === 'KeyB' && match.phase === 'play') {
        // Re-open the buy panel only before the round timer has run far.
        if (match.roundTime > ROUND_SECONDS - 15) {
          match.phase = 'buy';
          match.buyTime = 8;
          input.releaseLock();
          hud.showBuy(match.money, buy, deploy);
        }
      }
    }
    if (input.state.firing && match.phase === 'play' && body.alive) {
      const isAuto = weapon.def.auto;
      if (isAuto ? weapon.ready() : weapon.ready() && !prevFiring) {
        shoot(shot ? 0 : weapon.spread(player.groundSpeed()));
      }
    }
    prevFiring = input.state.firing;
    accumulator += dt;
    let steps = 0;
    while (accumulator >= FIXED_STEP && steps < 5) {
      step(FIXED_STEP);
      accumulator -= FIXED_STEP;
      steps += 1;
    }
    if (accumulator > FIXED_STEP * 5) accumulator = 0;
    syncCamera();
  }
  renderer.render(scene, camera);
}

function onLockChange(locked) {
  if (shot) return;
  if (locked) {
    hud.hideOverlay();
  } else if (match.phase === 'play' && !match.bomb) {
    hud.showOverlay('paused');
  } else if (match.phase === 'play') {
    hud.showOverlay('paused');
  } else if (match.phase === 'menu') {
    hud.showOverlay('start');
  }
}

hud.onPlay(() => {
  if (shot) return;
  if (match.phase === 'matchEnd') {
    match.round = 1;
    match.scoreAttack = 0;
    match.scoreDefend = 0;
    match.money = 800;
    match.kills = 0;
    startRound();
    return;
  }
  if (match.phase === 'menu') {
    match.phase = 'buy';
    startRound();
    return;
  }
  input.requestLock();
});

function aimAt(point) {
  const dx = point.x - body.position.x;
  const dy = point.y - (body.position.y + body.eye);
  const dz = point.z - body.position.z;
  const length = Math.hypot(dx, dy, dz) || 1;
  body.yaw = Math.atan2(-dx, -dz);
  body.pitch = Math.asin(Math.max(-1, Math.min(1, dy / length)));
  syncCamera();
}

function settle(steps) {
  for (let index = 0; index < steps; index += 1) step(FIXED_STEP);
}

function runShot(name) {
  hud.hideOverlay();
  hud.hideBuy();
  body.pitch = 0;
  body.yaw = 0;
  if (name === 'start') {
    match.phase = 'menu';
    body.position.set(0.6, 0, 8.6);
    settle(20);
    aimAt(new THREE.Vector3(0, 1.5, -6));
    hud.showOverlay('start');
  } else {
    match.phase = 'play';
    match.round = 1;
    match.scoreAttack = 0;
    match.scoreDefend = 0;
    match.money = 1100;
    body.position.set(0, 0, 8);
    body.yaw = 0;
    body.pitch = 0;
    settle(20);
    const target = bots.bots.find((b) => b.team === 'defend' && b.alive);
    if (target) {
      // Aim at the torso, twice: the bot stays standing and visible in the
      // frame, wounded, with a hit marker and a kill-feed line behind it.
      aimPoint.set(target.position.x, 1.0, target.position.z);
      for (let round = 0; round < 2; round += 1) {
        aimAt(aimPoint);
        shoot(0);
        if (round < 1) settle(8);
      }
    }
    settle(12);
    if (name === 'end') {
      match.scoreAttack = 0;
      match.scoreDefend = 0;
      endRound('attack', 'defenders eliminated');
      settle(30);
    }
  }
  pushHud();
  paintTwiceThenReady();
}

function paintTwiceThenReady() {
  let painted = 0;
  function paint() {
    requestAnimationFrame(paint);
    syncCamera();
    renderer.render(scene, camera);
    painted += 1;
    if (painted === 2) {
      window.__shotReady = true;
      frozen = true;
    }
  }
  requestAnimationFrame(paint);
}

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

syncCamera();
pushHud();
if (shot) runShot(shot);
else requestAnimationFrame(frame);
