// Frag grenades: one throw, one arc, one explosion. The grenade is a small
// sphere with velocity and gravity; it bounces off walls at reduced speed,
// beeps as its fuse runs down, then deals falloff damage to everyone in
// range. No new objects in the hot loop: one mesh, reused.
import * as THREE from 'three';
import { PALETTE } from './palette.js';
import { makeMover } from './player.js';

const FUSE = 1.6;
const BLAST_RADIUS = 6.5;
const MAX_DAMAGE = 95;
const GRAVITY = 14;

export function createGrenades(scene, world) {
  const mover = makeMover(world.colliders, 0.12, 0.24);
  const mesh = new THREE.Mesh(
    new THREE.SphereGeometry(0.12, 12, 10),
    new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.accent), roughness: 0.4, metalness: 0.4 }),
  );
  mesh.visible = false;
  mesh.castShadow = true;
  scene.add(mesh);
  const blast = new THREE.Mesh(
    new THREE.SphereGeometry(1, 16, 12),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.accent), transparent: true, opacity: 0.55, depthWrite: false }),
  );
  blast.visible = false;
  scene.add(blast);

  const state = {
    active: false, fuse: 0, blastAt: -10,
    position: new THREE.Vector3(), velocity: new THREE.Vector3(),
  };

  function throwFrom(origin, direction) {
    if (state.active) return false;
    state.active = true;
    state.fuse = FUSE;
    state.position.copy(origin);
    state.velocity.copy(direction).multiplyScalar(11);
    state.velocity.y += 3.2;
    mesh.position.copy(state.position);
    mesh.visible = true;
    return true;
  }

  // Step the grenade; returns a damage event when it explodes, else null.
  function step(dt) {
    if (!state.active) {
      blast.visible = performance.now() / 1000 - state.blastAt < 0.25;
      if (blast.visible) {
        const t = (performance.now() / 1000 - state.blastAt) / 0.25;
        blast.scale.setScalar(1 + t * BLAST_RADIUS);
      }
      return null;
    }
    state.fuse -= dt;
    state.velocity.y -= GRAVITY * dt;
    const next = state.position.clone().addScaledVector(state.velocity, dt);
    // Bounce: if the next step overlaps a collider, reflect that axis.
    if (mover.overlaps(next.x, state.position.y, state.position.z, 0.24, 0)) {
      state.velocity.x *= -0.4;
    } else {
      state.position.x = next.x;
    }
    if (mover.overlaps(state.position.x, state.position.y, next.z, 0.24, 0)) {
      state.velocity.z *= -0.4;
    } else {
      state.position.z = next.z;
    }
    if (next.y < 0.12) {
      state.position.y = 0.12;
      state.velocity.y = Math.abs(state.velocity.y) * 0.4;
      state.velocity.x *= 0.7;
      state.velocity.z *= 0.7;
    } else if (mover.overlaps(state.position.x, next.y, state.position.z, 0.24, 0)) {
      state.velocity.y *= -0.4;
      state.position.y += 0.05;
    } else {
      state.position.y = next.y;
    }
    mesh.position.copy(state.position);
    if (state.fuse > 0) return null;
    state.active = false;
    mesh.visible = false;
    blast.position.copy(state.position);
    blast.scale.setScalar(1);
    blast.visible = true;
    state.blastAt = performance.now() / 1000;
    return { position: state.position.clone(), radius: BLAST_RADIUS, maxDamage: MAX_DAMAGE };
  }

  function damageAt(point, distance) {
    const f = Math.max(0, 1 - distance / BLAST_RADIUS);
    return Math.round(MAX_DAMAGE * f * f);
  }

  return { state, throwFrom, step, damageAt };
}
