// Bots: two allies and three enemies, each a visible body with a head and a
// torso a bullet can hit. They follow a route, hold a position, and shoot
// back when they can see a target: line of sight is a ray against the
// world's shootables, and their fire is burst-y and inaccurate at range, so
// a player who stops, aims and uses cover wins the duel.
//
// A bot's state is one object; the loop in main.js owns rounds, money and
// the bomb, and this module owns only how a bot moves, sees and shoots.
import * as THREE from 'three';
import { PALETTE } from './palette.js';
import { makeMover } from './player.js';

const HEALTH = 100;
const SPEED = 3.6;
const RADIUS = 0.34;

export function createBots(scene, world, routes) {
  const allyMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.ally), roughness: 0.6, metalness: 0.05 });
  const enemyMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.enemy), roughness: 0.6, metalness: 0.05 });
  const headMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.ink), roughness: 0.5, metalness: 0.05 });
  const darkMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.hairline), roughness: 0.85 });
  const torsoGeo = new THREE.BoxGeometry(0.52, 0.78, 0.3);
  const headGeo = new THREE.SphereGeometry(0.155, 16, 12);
  const legGeo = new THREE.BoxGeometry(0.44, 0.55, 0.26);
  const gunGeo = new THREE.BoxGeometry(0.07, 0.09, 0.55);
  const mover = makeMover(world.colliders, RADIUS, 1.72);
  const ray = new THREE.Raycaster();
  ray.far = 60;
  const dir = new THREE.Vector3();
  const toTarget = new THREE.Vector3();
  const bots = [];
  const hitMeshes = [];

  function makeBot(def) {
    const group = new THREE.Group();
    group.position.set(def.x, 0, def.z);
    const legs = new THREE.Mesh(legGeo, darkMat);
    legs.position.y = 0.28;
    const torso = new THREE.Mesh(torsoGeo, def.team === 'attack' ? allyMat : enemyMat);
    torso.position.y = 1.0;
    torso.userData.part = 'torso';
    const head = new THREE.Mesh(headGeo, headMat);
    head.position.y = 1.53;
    head.userData.part = 'head';
    const gun = new THREE.Mesh(gunGeo, darkMat);
    gun.position.set(0.2, 1.05, -0.3);
    group.add(legs, torso, head, gun);
    group.traverse((mesh) => {
      if (mesh.isMesh) {
        mesh.castShadow = true;
        mesh.receiveShadow = true;
      }
    });
    scene.add(group);
    const bot = {
      name: def.name, team: def.team, group, torso, head,
      position: group.position, health: HEALTH, alive: true,
      route: def.route.map(([x, z]) => new THREE.Vector2(x, z)),
      waypoint: 0, holdUntil: 0, yaw: def.yaw ?? 0,
      burstLeft: 0, burstAt: 0, nextShot: 0, reactAt: 0,
      target: null, seenAt: -10, fall: 0, respawnAt: 0,
      velocity: new THREE.Vector3(),
    };
    torso.userData.bot = bot;
    head.userData.bot = bot;
    hitMeshes.push(torso, head);
    bots.push(bot);
    return bot;
  }

  const defs = [
    { name: 'Kite', team: 'attack', x: -6, z: 11, yaw: 0, route: routes.A },
    { name: 'Bramble', team: 'attack', x: 6, z: 11, yaw: 0, route: routes.mid },
    { name: 'Ash', team: 'defend', x: -12, z: -11, yaw: Math.PI, route: routes.defendA },
    { name: 'Cinder', team: 'defend', x: 12, z: -11, yaw: Math.PI, route: routes.defendB },
    { name: 'Flint', team: 'defend', x: 0, z: -12, yaw: Math.PI, route: routes.defendMid },
  ];
  for (const def of defs) makeBot(def);

  function eyeOf(bot) {
    return new THREE.Vector3(bot.position.x, 1.5, bot.position.z);
  }

  function canSee(bot, targetPos) {
    const eye = eyeOf(bot);
    toTarget.copy(targetPos).sub(eye);
    const dist = toTarget.length();
    if (dist > 42) return false;
    dir.copy(toTarget).normalize();
    ray.set(eye, dir);
    ray.far = dist;
    const hit = ray.intersectObjects(world.shootables, false)[0];
    return !hit;
  }

  // Pick the nearest living enemy the bot can see. `actors` are {pos, team, alive, isPlayer}.
  function pickTarget(bot, actors, now) {
    let best = null;
    let bestDist = Infinity;
    for (const actor of actors) {
      if (!actor.alive || actor.team === bot.team) continue;
      const d = bot.position.distanceTo(actor.pos);
      if (d >= bestDist) continue;
      if (!canSee(bot, actor.pos)) continue;
      best = actor;
      bestDist = d;
    }
    if (best) {
      if (bot.target !== best) bot.reactAt = now + 0.45 + Math.random() * 0.35;
      bot.target = best;
      bot.seenAt = now;
    } else if (now - bot.seenAt > 1.2) {
      bot.target = null;
    }
    return bot.target;
  }

  function step(bot, dt, now, actors, onShoot) {
    if (!bot.alive) {
      bot.fall = Math.min(1, bot.fall + dt / 0.4);
      bot.group.rotation.x = -bot.fall * 1.45;
      return;
    }
    bot.group.rotation.x = 0;
    const target = pickTarget(bot, actors, now);
    if (target && now >= bot.reactAt) {
      // Face the target and fire in bursts of 3, with a pause between bursts.
      toTarget.copy(target.pos).sub(bot.position);
      bot.yaw = Math.atan2(-toTarget.x, -toTarget.z);
      bot.group.rotation.y = bot.yaw;
      if (now >= bot.nextShot) {
        if (bot.burstLeft <= 0) {
          bot.burstLeft = 3;
          bot.nextShot = now + 0.7 + Math.random() * 0.5;
        } else {
          bot.burstLeft -= 1;
          bot.nextShot = now + 0.16;
          const dist = bot.position.distanceTo(target.pos);
          const hitChance = Math.max(0.12, 0.55 - dist * 0.011);
          onShoot(bot, target, hitChance);
        }
      }
      return;
    }
    // No target: walk the route, pausing at each waypoint to look around.
    if (now < bot.holdUntil) return;
    const wp = bot.route[bot.waypoint];
    if (!wp) return;
    const dx = wp.x - bot.position.x;
    const dz = wp.y - bot.position.z;
    const dist = Math.hypot(dx, dz);
    if (dist < 0.6) {
      bot.waypoint = (bot.waypoint + 1) % bot.route.length;
      bot.holdUntil = now + 1.2 + Math.random() * 1.5;
      return;
    }
    const stepX = (dx / dist) * SPEED * dt;
    const stepZ = (dz / dist) * SPEED * dt;
    const nextX = bot.position.x + stepX;
    if (!mover.overlaps(nextX, 0, bot.position.z, 1.72, 0.04)) bot.position.x = nextX;
    const nextZ = bot.position.z + stepZ;
    if (!mover.overlaps(bot.position.x, 0, nextZ, 1.72, 0.04)) bot.position.z = nextZ;
    bot.yaw = Math.atan2(-dx, -dz);
    bot.group.rotation.y = bot.yaw;
  }

  function damage(bot, amount) {
    if (!bot.alive) return false;
    bot.health -= amount;
    if (bot.health > 0) return false;
    bot.alive = false;
    bot.fall = 0;
    bot.target = null;
    return true;
  }

  function reset(spawns) {
    // Spawn per team, in order: attack bots take the attack spawns, defend
    // bots the defend spawns. (An earlier version indexed one flat list, so
    // a defender could respawn in the attackers' yard.)
    const perTeam = { attack: 0, defend: 0 };
    bots.forEach((bot) => {
      const list = spawns[bot.team] ?? [];
      const at = list[perTeam[bot.team] % list.length] ?? { x: 0, z: 0, yaw: 0 };
      perTeam[bot.team] += 1;
      bot.position.set(at.x, 0, at.z);
      bot.health = HEALTH;
      bot.alive = true;
      bot.fall = 0;
      bot.group.rotation.set(0, bot.yaw, 0);
      bot.waypoint = 0;
      bot.holdUntil = 0;
      bot.target = null;
      bot.burstLeft = 0;
      bot.nextShot = 0;
    });
  }

  return {
    bots,
    hitMeshes,
    step,
    damage,
    reset,
    alive(team) {
      return bots.filter((b) => b.team === team && b.alive);
    },
    countAlive(team) {
      return bots.filter((b) => b.team === team && b.alive).length;
    },
  };
}
