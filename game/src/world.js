// Harbourline: an original dusk harbour yard, 36 x 28 m, built from boxes.
// Two bomb sites, three lanes, and cover worth playing around. Every box is
// a collider for movement and a surface a bullet stops on. No models, no
// textures, no network: plain geometry and a chosen palette only.
//
// Layout (x east, z south, north is -z):
//   Site A (west, x -14, z -9)   Site B (east, x 14, z -9)
//   Mid plaza (x 0, z 0) with a pillar and low crates
//   Attackers spawn south (z 11), defenders north (z -11)
import * as THREE from 'three';
import { PALETTE } from './palette.js';

export const SITES = {
  A: { name: 'A', centre: new THREE.Vector3(-14, 0, -9), radius: 3.4 },
  B: { name: 'B', centre: new THREE.Vector3(14, 0, -9), radius: 3.4 },
};

export const SPAWNS = {
  attack: [
    { x: -6, z: 11, yaw: 0 },
    { x: 0, z: 12, yaw: 0 },
    { x: 6, z: 11, yaw: 0 },
  ],
  defend: [
    { x: -12, z: -11, yaw: Math.PI },
    { x: 0, z: -12, yaw: Math.PI },
    { x: 12, z: -11, yaw: Math.PI },
  ],
};

// Waypoint routes, one per lane, from south spawn to each site and to mid.
export const ROUTES = {
  A: [
    [-11, 8], [-12, 2], [-13, -3], [-14, -7],
  ],
  B: [
    [11, 8], [12, 2], [13, -3], [14, -7],
  ],
  mid: [
    [-2, 8], [0, 3], [1, -2], [0, -6],
  ],
  defendA: [
    [-12, -10], [-13, -6], [-14, -8],
  ],
  defendB: [
    [12, -10], [13, -6], [14, -8],
  ],
  defendMid: [
    [0, -11], [0, -6], [-2, -2],
  ],
};

export function createWorld(scene) {
  const group = new THREE.Group();
  scene.add(group);
  const materials = {};
  for (const name of ['canvas', 'surface', 'hairline', 'ink', 'muted', 'accent', 'ally', 'enemy']) {
    materials[name] = new THREE.MeshStandardMaterial({
      color: new THREE.Color(PALETTE[name]),
      roughness: name === 'accent' || name === 'ink' ? 0.55 : 0.92,
      metalness: 0.03,
    });
  }
  const colliders = [];
  const shootables = [];

  function box(width, height, depth, x, y, z, material) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), materials[material]);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    colliders.push(new THREE.Box3().setFromObject(mesh));
    shootables.push(mesh);
    return mesh;
  }

  function flat(width, depth, x, z, material, y = 0.02) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, 0.04, depth), materials[material]);
    mesh.position.set(x, y, z);
    mesh.receiveShadow = true;
    group.add(mesh);
    return mesh;
  }

  // Floor and outer walls, 5 m high, open to the dusk sky.
  box(36.4, 0.4, 28.4, 0, -0.2, 0, 'canvas');
  box(0.4, 5, 28.4, -18.2, 2.5, 0, 'surface');
  box(0.4, 5, 28.4, 18.2, 2.5, 0, 'surface');
  box(36.4, 5, 0.4, 0, 2.5, -14.2, 'surface');
  box(36.4, 5, 0.4, 0, 2.5, 14.2, 'surface');

  // Site A: amber crates and a low wall, west.
  box(3.2, 1.2, 1.2, -15, 0.6, -9, 'hairline');
  box(1.2, 1.2, 3.2, -12.4, 0.6, -10.6, 'hairline');
  box(1.6, 2.2, 1.6, -16, 1.1, -6.4, 'accent');
  box(2.2, 0.9, 1.2, -13, 0.45, -6.8, 'surface');
  flat(7, 7, -14, -9, 'accent');

  // Site B: silo crates and a gantry block, east.
  box(1.6, 2.6, 1.6, 16, 1.3, -10, 'hairline');
  box(3.2, 1.2, 1.2, 14.6, 0.6, -7.2, 'hairline');
  box(1.2, 1.2, 3.2, 12.4, 0.6, -10.4, 'surface');
  box(2.2, 0.9, 1.2, 15, 0.45, -6.4, 'surface');
  flat(7, 7, 14, -9, 'accent');

  // Mid plaza: a pillar, low crates, and a raised walkway block.
  box(1.4, 3.4, 1.4, 0, 1.7, 0, 'hairline');
  box(3.4, 1.1, 1.2, -5, 0.55, 1.4, 'hairline');
  box(1.2, 1.1, 3.4, 5, 0.55, 1.4, 'hairline');
  box(1.8, 0.7, 1.8, -8, 0.35, -2, 'surface');
  box(1.8, 0.7, 1.8, 8, 0.35, -2, 'surface');
  box(5, 0.5, 2, 0, 0.25, -6, 'surface');

  // Lanes: staggered cover so no sightline runs the whole map.
  box(1.2, 1.1, 2.6, -10, 0.55, 5, 'hairline');
  box(2.6, 1.1, 1.2, 10, 0.55, 5, 'hairline');
  box(1, 1.8, 1, -15.5, 0.9, 4, 'surface');
  box(1, 1.8, 1, 15.5, 0.9, 4, 'surface');
  box(2, 0.8, 1, -3, 0.4, 8, 'surface');
  box(2, 0.8, 1, 3, 0.4, 8, 'surface');

  // Site markers: thin amber frames floating over each site, so a site reads at a glance.
  for (const site of Object.values(SITES)) {
    const frame = new THREE.Mesh(
      new THREE.BoxGeometry(1.6, 0.08, 0.08),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.accent) }),
    );
    frame.position.set(site.centre.x, 3.6, site.centre.z);
    group.add(frame);
  }

  const sky = new THREE.HemisphereLight(new THREE.Color(PALETTE.surface), new THREE.Color(PALETTE.canvas), 2.2);
  scene.add(sky);
  const key = new THREE.DirectionalLight(new THREE.Color(PALETTE.ink), 3.0);
  key.position.set(12, 16, 9);
  key.target.position.set(0, 0, -3);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.camera.left = -22;
  key.shadow.camera.right = 22;
  key.shadow.camera.top = 22;
  key.shadow.camera.bottom = -22;
  key.shadow.camera.far = 60;
  key.shadow.bias = -0.0006;
  scene.add(key, key.target);
  const fill = new THREE.DirectionalLight(new THREE.Color(PALETTE.muted), 0.5);
  fill.position.set(-10, 10, 12);
  scene.add(fill);

  return { colliders, shootables, group };
}
