// Weapons: one table, one view model, one state machine. Every weapon is
// defined here, so the buy menu, the HUD and the shooting code all read the
// same numbers. Damage is per torso hit; a head hit multiplies it.
import * as THREE from 'three';
import { PALETTE } from './palette.js';

export const WEAPONS = {
  sidearm: {
    id: 'sidearm', name: 'Sidearm', price: 0,
    damage: 28, headMul: 3.2, mag: 12, reserve: 48,
    gap: 0.22, reload: 1.3, spreadStill: 0.003, spreadMove: 0.02, kick: 0.007, auto: false,
  },
  raptor: {
    id: 'raptor', name: 'Raptor rifle', price: 900,
    damage: 34, headMul: 3.2, mag: 30, reserve: 90,
    gap: 0.1, reload: 1.9, spreadStill: 0.0022, spreadMove: 0.028, kick: 0.009, auto: true,
  },
  hush: {
    id: 'hush', name: 'Hush SMG', price: 600,
    damage: 24, headMul: 3.3, mag: 32, reserve: 96,
    gap: 0.07, reload: 1.6, spreadStill: 0.005, spreadMove: 0.034, kick: 0.006, auto: true,
  },
  longbow: {
    id: 'longbow', name: 'Longbow sniper', price: 1500,
    damage: 95, headMul: 2.1, mag: 5, reserve: 15,
    gap: 1.1, reload: 2.6, spreadStill: 0.0004, spreadMove: 0.05, kick: 0.03, auto: false,
  },
};

export const WEAPON_ORDER = ['sidearm', 'raptor', 'hush', 'longbow'];

export function createWeapon(camera) {
  const grip = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.hairline), roughness: 0.7, metalness: 0.2 });
  const body = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.ink), roughness: 0.5, metalness: 0.35 });
  const model = new THREE.Group();
  const receiver = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.1, 0.42), body);
  const barrel = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.045, 0.4), grip);
  barrel.position.set(0, 0.025, -0.38);
  const stock = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.08, 0.22), grip);
  stock.position.set(0, -0.02, 0.3);
  model.add(receiver, barrel, stock);
  model.position.set(0.24, -0.2, -0.42);
  camera.add(model);

  const flash = new THREE.Mesh(
    new THREE.PlaneGeometry(0.24, 0.24),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.accent), transparent: true, opacity: 0.9, depthWrite: false, side: THREE.DoubleSide }),
  );
  flash.position.set(0.24, -0.18, -0.95);
  flash.visible = false;
  camera.add(flash);
  const flashLight = new THREE.PointLight(new THREE.Color(PALETTE.accent), 0, 5);
  flashLight.position.set(0.24, -0.16, -0.6);
  camera.add(flashLight);

  let def = WEAPONS.raptor;
  const state = {
    id: def.id, mag: def.mag, reserve: def.reserve,
    cooldown: 0, reloadLeft: 0, flash: 0, kick: 0, grenades: 0,
  };

  function step(dt) {
    state.cooldown = Math.max(0, state.cooldown - dt);
    state.flash = Math.max(0, state.flash - dt);
    state.kick += (0 - state.kick) * Math.min(1, dt * 14);
    model.position.z = -0.42 + state.kick;
    model.rotation.x = state.kick * 2.2;
    flash.visible = state.flash > 0;
    flash.rotation.z = state.flash * 30;
    flashLight.intensity = state.flash > 0 ? 18 : 0;
    if (state.reloadLeft > 0) {
      state.reloadLeft = Math.max(0, state.reloadLeft - dt);
      model.rotation.x = -0.55 * Math.min(1, ((def.reload - state.reloadLeft) * 2) / def.reload);
      if (state.reloadLeft === 0) {
        const need = def.mag - state.mag;
        const take = Math.min(need, state.reserve);
        state.mag += take;
        state.reserve -= take;
      }
    }
  }

  return {
    state,
    get def() { return def; },
    step,
    ready() {
      return state.mag > 0 && state.cooldown === 0 && state.reloadLeft === 0;
    },
    pullTrigger() {
      state.cooldown = def.gap;
      state.flash = 0.06;
      state.kick = 0.055;
    },
    takeRound() {
      if (state.mag <= 0) return false;
      state.mag -= 1;
      return true;
    },
    reload() {
      if (state.reloadLeft > 0 || state.mag === def.mag || state.reserve === 0) return;
      state.reloadLeft = def.reload;
    },
    spread(speed) {
      return def.spreadStill + Math.min(1, speed / 5.4) * def.spreadMove;
    },
    equip(id) {
      def = WEAPONS[id] ?? WEAPONS.sidearm;
      state.id = def.id;
      state.mag = def.mag;
      state.reserve = def.reserve;
      state.cooldown = 0;
      state.reloadLeft = 0;
      state.flash = 0;
      state.kick = 0;
    },
    refill() {
      state.mag = def.mag;
      state.reserve = def.reserve;
      state.cooldown = 0;
      state.reloadLeft = 0;
    },
  };
}
