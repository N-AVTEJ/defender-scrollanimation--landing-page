/**
 * Defender 110 V8 Asset Loader & Procedural Fallback Builder
 *
 * Maps canonical vehicle nodes via NODE_MAP, loads optional /assets/model/defender.glb
 * through GLTFLoader + DRACOLoader + KTX2Loader + MeshoptDecoder after binary preflight,
 * logs scene-graph mismatches, normalizes GLB bounds, and builds a sculpted hollowed-cabin
 * procedural Defender 110 V8 when the GLB is absent, HTML-trapped, or corrupt.
 */

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { KTX2Loader } from 'three/addons/loaders/KTX2Loader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { ASSET_PATHS, PALETTE, VEHICLE_DIMENSIONS } from '../config/config.js';
import { probeModelAsset } from './asset-probe.js';

export const NODE_MAP = Object.freeze({
  body: ['body', 'Body', 'defender_body', 'chassis'],
  door_driver: ['door_driver', 'Door_Driver', 'door_fl', 'Door_FL'],
  steering_wheel: ['steering_wheel', 'Steering_Wheel', 'steer'],
  seat: ['seat', 'seat_driver', 'Seat_FL'],
  wheels: ['wheel_fl', 'wheel_fr', 'wheel_rl', 'wheel_rr'],
  interior: ['interior', 'Interior', 'dashboard', 'cockpit'],
  exhaust: ['exhaust', 'Exhaust', 'tailpipes'],
  bonnet: ['bonnet', 'hood', 'Bonnet'],
  headlights: ['headlights', 'Headlights'],
  taillights: ['taillights', 'Taillights'],
});

/**
 * Disposes every unique Geometry, Material, and Texture inside an Object3D subtree.
 * @param {THREE.Object3D} root
 */
function disposeObjectTree(root) {
  if (!root) return;
  const geometries = new Set();
  const materials = new Set();
  const textures = new Set();

  root.traverse((obj) => {
    if (obj.geometry) geometries.add(obj.geometry);
    if (obj.material) {
      const list = Array.isArray(obj.material) ? obj.material : [obj.material];
      for (const mat of list) {
        if (!mat) continue;
        materials.add(mat);
        for (const value of Object.values(mat)) {
          if (value && value.isTexture) {
            textures.add(value);
          }
        }
      }
    }
  });

  for (const tex of textures) {
    if (typeof tex.source?.data?.close === 'function') {
      tex.source.data.close();
    }
    tex.dispose();
  }
  for (const mat of materials) {
    mat.dispose();
  }
  for (const geo of geometries) {
    geo.dispose();
  }
}

/**
 * Helper to create a Box mesh with shadow and frustum-culling defaults.
 */
function makeBox(w, h, d, material, x = 0, y = 0, z = 0, name = '') {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.frustumCulled = true;
  if (name) mesh.name = name;
  return mesh;
}

/**
 * Builds the canonical procedural Land Rover Defender 110 V8 fallback vehicle.
 * Coordinates: right-handed Y-up meters, y=0 ground, +Z forward, +X LHD driver side.
 */
function buildProceduralDefender() {
  const root = new THREE.Group();
  root.name = 'defender_110_v8_procedural';

  // Physically based materials
  const santoriniBody = new THREE.MeshPhysicalMaterial({
    color: '#111311',
    metalness: 0.72,
    roughness: 0.24,
    clearcoat: 0.9,
    clearcoatRoughness: 0.1,
    envMapIntensity: 1.35,
  });

  const bonnetClearcoat = new THREE.MeshPhysicalMaterial({
    color: '#121412',
    metalness: 0.78,
    roughness: 0.16,
    clearcoat: 1.0,
    clearcoatRoughness: 0.06,
    envMapIntensity: 1.75,
  });

  const satinCladding = new THREE.MeshStandardMaterial({
    color: '#1b1d1a',
    metalness: 0.2,
    roughness: 0.68,
    envMapIntensity: 0.85,
  });

  const brushedAluminum = new THREE.MeshStandardMaterial({
    color: '#6e7377',
    metalness: 0.86,
    roughness: 0.28,
    envMapIntensity: 1.25,
  });

  const darkAlloy = new THREE.MeshStandardMaterial({
    color: '#202221',
    metalness: 0.75,
    roughness: 0.34,
    envMapIntensity: 1.15,
  });

  const tireRubber = new THREE.MeshStandardMaterial({
    color: '#141514',
    metalness: 0.05,
    roughness: 0.86,
    envMapIntensity: 0.4,
  });

  const windsorLeather = new THREE.MeshStandardMaterial({
    color: '#1f1c19',
    metalness: 0.06,
    roughness: 0.58,
    envMapIntensity: 0.7,
  });

  const magnesiumBeam = new THREE.MeshStandardMaterial({
    color: '#343735',
    metalness: 0.52,
    roughness: 0.44,
    envMapIntensity: 1.0,
  });

  const caliperOrange = new THREE.MeshStandardMaterial({
    color: PALETTE.accent,
    metalness: 0.32,
    roughness: 0.36,
    envMapIntensity: 1.0,
  });

  const glassMaterial = new THREE.MeshPhysicalMaterial({
    color: '#182022',
    metalness: 0.05,
    roughness: 0.06,
    clearcoat: 1.0,
    clearcoatRoughness: 0.04,
    transparent: true,
    opacity: 0.22,
    depthWrite: false,
    envMapIntensity: 1.4,
  });

  const binnacleScreenMat = new THREE.MeshStandardMaterial({
    color: '#0e1110',
    emissive: '#353d38',
    emissiveIntensity: 0.55,
    roughness: 0.25,
    metalness: 0.1,
  });

  const accentScreenMat = new THREE.MeshStandardMaterial({
    color: '#151210',
    emissive: PALETTE.accent,
    emissiveIntensity: 0.7,
    roughness: 0.3,
  });

  const domeLensMat = new THREE.MeshStandardMaterial({
    color: '#2b2520',
    emissive: '#ffb878',
    emissiveIntensity: 0.05,
    roughness: 0.2,
  });

  const headlightEmissive = new THREE.MeshStandardMaterial({
    color: '#cfd4d8',
    emissive: PALETTE.fujiWhite,
    emissiveIntensity: 0.35,
    roughness: 0.15,
    metalness: 0.2,
  });

  const taillightEmissive = new THREE.MeshStandardMaterial({
    color: '#3d100a',
    emissive: PALETTE.accent,
    emissiveIntensity: 0.35,
    roughness: 0.22,
    metalness: 0.1,
  });

  // ---------------------------------------------------------------------------
  // 1. BODY (Hollowed cabin structure — zero solid cabin box occluding POV)
  // ---------------------------------------------------------------------------
  const body = new THREE.Group();
  body.name = 'body';

  // Floor pan & center transmission spine
  body.add(makeBox(1.84, 0.12, 3.15, satinCladding, 0, 0.40, -0.525, 'floor_pan'));
  body.add(makeBox(0.30, 0.10, 1.36, windsorLeather, 0, 0.51, 0.28, 'center_tunnel'));

  // Firewall & front engine bay understructure
  body.add(makeBox(1.84, 0.68, 0.16, satinCladding, 0, 0.80, 1.04, 'firewall'));
  body.add(makeBox(1.62, 0.66, 1.16, satinCladding, 0, 0.71, 1.70, 'engine_bay_core'));

  // Left & Right rock sliders / sills
  body.add(makeBox(0.10, 0.14, 2.15, satinCladding, 0.93, 0.41, -0.025, 'sill_left'));
  body.add(makeBox(0.10, 0.14, 2.15, satinCladding, -0.93, 0.41, -0.025, 'sill_right'));

  // Front fenders (hollowed wheel wells around z = +1.48)
  for (const side of [1, -1]) {
    const tag = side > 0 ? 'fl' : 'fr';
    body.add(makeBox(0.14, 0.25, 1.68, santoriniBody, side * 0.91, 1.005, 1.48, `fender_top_${tag}`));
    body.add(makeBox(0.14, 0.40, 0.38, santoriniBody, side * 0.91, 0.68, 0.83, `fender_rear_${tag}`));
    body.add(makeBox(0.14, 0.40, 0.38, santoriniBody, side * 0.91, 0.68, 2.13, `fender_front_${tag}`));
    body.add(makeBox(0.10, 0.08, 0.76, satinCladding, side * 0.95, 0.93, 1.48, `arch_flare_f_${tag}`));
  }

  // Rear quarter panels & iconic Defender side alpine windows
  for (const side of [1, -1]) {
    const tag = side > 0 ? 'rl' : 'rr';
    body.add(makeBox(0.12, 0.68, 0.58, santoriniBody, side * 0.90, 0.80, -0.73, `quarter_fwd_${tag}`));
    body.add(makeBox(0.12, 0.26, 0.92, santoriniBody, side * 0.90, 1.01, -1.48, `quarter_mid_${tag}`));
    body.add(makeBox(0.12, 0.68, 0.40, santoriniBody, side * 0.90, 0.80, -2.14, `quarter_aft_${tag}`));
    body.add(makeBox(0.10, 0.08, 0.76, satinCladding, side * 0.95, 0.93, -1.48, `arch_flare_r_${tag}`));

    // Upper rear quarter framing: C-pillar, floating cargo panel, alpine skylight, D-pillar
    body.add(makeBox(0.10, 0.68, 0.20, santoriniBody, side * 0.90, 1.48, -1.15, `c_pillar_${tag}`));
    body.add(makeBox(0.10, 0.48, 0.70, santoriniBody, side * 0.90, 1.38, -1.60, `cargo_panel_${tag}`));
    body.add(makeBox(0.02, 0.16, 0.68, glassMaterial, side * 0.90, 1.70, -1.60, `alpine_glass_${tag}`));
    body.add(makeBox(0.10, 0.04, 0.70, santoriniBody, side * 0.90, 1.80, -1.60, `alpine_frame_${tag}`));
    body.add(makeBox(0.10, 0.68, 0.38, santoriniBody, side * 0.90, 1.48, -2.14, `d_pillar_${tag}`));
    body.add(makeBox(0.02, 0.62, 0.56, glassMaterial, side * 0.90, 1.47, -0.76, `rear_side_glass_${tag}`));
  }

  // B-pillars & sloped A-pillars
  for (const side of [1, -1]) {
    const tag = side > 0 ? 'l' : 'r';
    body.add(makeBox(0.10, 1.38, 0.12, satinCladding, side * 0.91, 1.15, -0.46, `b_pillar_${tag}`));

    const aPillar = makeBox(0.08, 0.77, 0.09, santoriniBody, side * 0.90, 1.48, 0.86, `a_pillar_${tag}`);
    aPillar.rotation.x = -0.49;
    body.add(aPillar);
  }

  // Windshield header, cowl, and tilted transparent windshield glass
  body.add(makeBox(1.80, 0.08, 0.10, santoriniBody, 0, 1.82, 0.69, 'windshield_header'));
  body.add(makeBox(1.80, 0.06, 0.12, satinCladding, 0, 1.13, 1.03, 'cowl_base'));
  const windshield = new THREE.Mesh(new THREE.PlaneGeometry(1.68, 0.76), glassMaterial);
  windshield.name = 'windshield_glass';
  windshield.position.set(0, 1.48, 0.86);
  windshield.rotation.x = -Math.PI / 2 + 1.08;
  windshield.renderOrder = 2;
  body.add(windshield);

  // Roof & satin black roof rails
  body.add(makeBox(1.80, 0.09, 2.90, santoriniBody, 0, 1.865, -0.77, 'roof_panel'));
  body.add(makeBox(0.06, 0.045, 2.55, satinCladding, 0.78, 1.932, -0.775, 'roof_rail_left'));
  body.add(makeBox(0.06, 0.045, 2.55, satinCladding, -0.78, 1.932, -0.775, 'roof_rail_right'));

  // Passenger door (-X side, fixed closed)
  body.add(makeBox(0.06, 0.68, 1.02, santoriniBody, -0.93, 0.78, 0.11, 'door_passenger_lower'));
  body.add(makeBox(0.045, 0.68, 0.06, santoriniBody, -0.93, 1.46, 0.59, 'door_passenger_frame_f'));
  body.add(makeBox(0.045, 0.68, 0.06, santoriniBody, -0.93, 1.46, -0.37, 'door_passenger_frame_r'));
  body.add(makeBox(0.045, 0.05, 1.00, santoriniBody, -0.93, 1.79, 0.11, 'door_passenger_frame_t'));
  body.add(makeBox(0.012, 0.60, 0.90, glassMaterial, -0.93, 1.46, 0.11, 'door_passenger_glass'));
  body.add(makeBox(0.14, 0.10, 0.18, santoriniBody, -1.03, 1.14, 0.50, 'mirror_passenger'));

  // Front grille, bumper & skid plate
  body.add(makeBox(1.06, 0.30, 0.08, satinCladding, 0, 0.90, 2.31, 'front_grille_frame'));
  for (let i = 0; i < 3; i += 1) {
    body.add(makeBox(0.96, 0.03, 0.04, brushedAluminum, 0, 0.82 + i * 0.075, 2.35, `grille_slat_${i}`));
  }
  body.add(makeBox(1.92, 0.22, 0.16, satinCladding, 0, 0.54, 2.30, 'front_bumper'));
  const skidPlate = makeBox(1.14, 0.05, 0.26, brushedAluminum, 0, 0.34, 2.26, 'front_skidplate');
  skidPlate.rotation.x = 0.42;
  body.add(skidPlate);
  body.add(makeBox(0.06, 0.06, 0.08, caliperOrange, 0.44, 0.46, 2.37, 'tow_hook_l'));
  body.add(makeBox(0.06, 0.06, 0.08, caliperOrange, -0.44, 0.46, 2.37, 'tow_hook_r'));

  // Rear tailgate, window, bumper, diffuser & spare wheel
  body.add(makeBox(1.68, 0.62, 0.08, santoriniBody, 0, 0.85, -2.30, 'tailgate_lower'));
  body.add(makeBox(0.18, 0.64, 0.08, santoriniBody, 0.75, 1.48, -2.30, 'tailgate_pillar_l'));
  body.add(makeBox(0.18, 0.64, 0.08, santoriniBody, -0.75, 1.48, -2.30, 'tailgate_pillar_r'));
  body.add(makeBox(1.68, 0.08, 0.08, santoriniBody, 0, 1.78, -2.30, 'tailgate_header'));
  body.add(makeBox(1.32, 0.54, 0.015, glassMaterial, 0, 1.45, -2.30, 'tailgate_glass'));
  body.add(makeBox(1.92, 0.20, 0.14, satinCladding, 0, 0.46, -2.31, 'rear_bumper'));
  body.add(makeBox(1.00, 0.14, 0.12, satinCladding, 0, 0.29, -2.30, 'rear_diffuser_center'));

  // Tailgate-mounted spare wheel
  const spareGroup = new THREE.Group();
  spareGroup.name = 'spare_wheel';
  spareGroup.position.set(0, 1.02, -2.41);
  const spareTireGeo = new THREE.CylinderGeometry(0.39, 0.39, 0.22, 24);
  spareTireGeo.rotateX(Math.PI / 2);
  const spareTire = new THREE.Mesh(spareTireGeo, tireRubber);
  spareTire.castShadow = true;
  spareTire.receiveShadow = true;
  const spareHubGeo = new THREE.CylinderGeometry(0.24, 0.24, 0.23, 18);
  spareHubGeo.rotateX(Math.PI / 2);
  const spareHub = new THREE.Mesh(spareHubGeo, darkAlloy);
  const spareCapGeo = new THREE.CylinderGeometry(0.08, 0.08, 0.245, 16);
  spareCapGeo.rotateX(Math.PI / 2);
  const spareCap = new THREE.Mesh(spareCapGeo, brushedAluminum);
  spareGroup.add(spareTire, spareHub, spareCap);
  body.add(spareGroup);

  root.add(body);

  // ---------------------------------------------------------------------------
  // 2. BONNET (Clearcoat hood for CH 04 reflection rattle)
  // ---------------------------------------------------------------------------
  const bonnet = new THREE.Group();
  bonnet.name = 'bonnet';
  bonnet.position.set(0, 1.10, 1.12);
  bonnet.add(makeBox(1.66, 0.07, 1.18, bonnetClearcoat, 0, 0.0, 0.59, 'bonnet_main'));
  bonnet.add(makeBox(0.92, 0.035, 1.04, bonnetClearcoat, 0, 0.038, 0.56, 'bonnet_power_bulge'));
  bonnet.add(makeBox(0.22, 0.02, 0.34, satinCladding, 0.56, 0.04, 0.38, 'bonnet_vent_l'));
  bonnet.add(makeBox(0.22, 0.02, 0.34, satinCladding, -0.56, 0.04, 0.38, 'bonnet_vent_r'));
  root.add(bonnet);

  // ---------------------------------------------------------------------------
  // 3. DRIVER DOOR (Hinged at A-pillar [0.96, 0.90, 0.62], <= 0.08m thick)
  // ---------------------------------------------------------------------------
  const door_driver = new THREE.Group();
  door_driver.name = 'door_driver';
  door_driver.position.set(...VEHICLE_DIMENSIONS.doorHinge);

  // Lower panel: thickness 0.06 m (x_local in [-0.06, 0.00])
  door_driver.add(makeBox(0.06, 0.68, 1.02, santoriniBody, -0.03, -0.12, -0.51, 'door_driver_panel'));
  // Upper window frame: thickness 0.045 m (x_local in [-0.045, 0.00])
  door_driver.add(makeBox(0.045, 0.68, 0.06, santoriniBody, -0.0225, 0.56, -0.03, 'door_driver_frame_f'));
  door_driver.add(makeBox(0.045, 0.68, 0.06, santoriniBody, -0.0225, 0.56, -0.99, 'door_driver_frame_r'));
  door_driver.add(makeBox(0.045, 0.05, 1.02, santoriniBody, -0.0225, 0.88, -0.51, 'door_driver_frame_t'));
  // Transparent glass
  door_driver.add(makeBox(0.01, 0.60, 0.90, glassMaterial, -0.02, 0.56, -0.51, 'door_driver_glass'));
  // Exposed aluminum Defender hinges & exterior flush handle
  door_driver.add(makeBox(0.025, 0.045, 0.055, brushedAluminum, 0.004, 0.12, -0.025, 'door_hinge_top'));
  door_driver.add(makeBox(0.025, 0.045, 0.055, brushedAluminum, 0.004, -0.18, -0.025, 'door_hinge_bot'));
  door_driver.add(makeBox(0.016, 0.035, 0.15, brushedAluminum, 0.005, 0.12, -0.84, 'door_handle_ext'));
  // Side mirror
  door_driver.add(makeBox(0.09, 0.03, 0.04, satinCladding, 0.04, 0.24, -0.12, 'mirror_stalk_l'));
  door_driver.add(makeBox(0.11, 0.10, 0.16, santoriniBody, 0.10, 0.25, -0.12, 'mirror_housing_l'));
  // Interior door card & grab handle
  door_driver.add(makeBox(0.02, 0.52, 0.88, windsorLeather, -0.068, -0.10, -0.51, 'door_card_l'));
  door_driver.add(makeBox(0.03, 0.035, 0.24, brushedAluminum, -0.08, 0.02, -0.45, 'door_pull_l'));
  root.add(door_driver);

  // ---------------------------------------------------------------------------
  // 4. STEERING WHEEL (Aimed toward driver eye POV)
  // ---------------------------------------------------------------------------
  const steering_wheel = new THREE.Group();
  steering_wheel.name = 'steering_wheel';
  steering_wheel.position.set(...VEHICLE_DIMENSIONS.steeringWheel.pos);
  steering_wheel.rotation.x = Math.abs(VEHICLE_DIMENSIONS.steeringWheel.tiltRad); // +0.384 rad

  const rimGeo = new THREE.TorusGeometry(0.18, 0.02, 14, 36);
  const rimMesh = new THREE.Mesh(rimGeo, windsorLeather);
  rimMesh.castShadow = true;
  rimMesh.name = 'steering_rim';
  steering_wheel.add(rimMesh);

  // 12-o'clock signal orange marker
  const markerGeo = new THREE.TorusGeometry(0.18, 0.0215, 10, 8, 0.16);
  markerGeo.rotateZ(Math.PI / 2 - 0.08);
  const markerMesh = new THREE.Mesh(markerGeo, caliperOrange);
  markerMesh.name = 'steering_top_marker';
  steering_wheel.add(markerMesh);

  // Horn pad & column hub
  const hubGeo = new THREE.CylinderGeometry(0.062, 0.062, 0.04, 20);
  hubGeo.rotateX(Math.PI / 2);
  const hubMesh = new THREE.Mesh(hubGeo, windsorLeather);
  hubMesh.name = 'steering_hub';
  steering_wheel.add(hubMesh);

  const colGeo = new THREE.CylinderGeometry(0.032, 0.038, 0.24, 14);
  colGeo.rotateX(Math.PI / 2);
  const colMesh = new THREE.Mesh(colGeo, satinCladding);
  colMesh.position.set(0, 0, 0.13);
  steering_wheel.add(colMesh);

  // 4 brushed aluminum spokes
  steering_wheel.add(makeBox(0.32, 0.024, 0.018, brushedAluminum, 0, -0.015, 0, 'steer_spoke_horiz'));
  steering_wheel.add(makeBox(0.026, 0.14, 0.018, brushedAluminum, -0.045, -0.095, 0, 'steer_spoke_bl'));
  steering_wheel.add(makeBox(0.026, 0.14, 0.018, brushedAluminum, 0.045, -0.095, 0, 'steer_spoke_br'));
  root.add(steering_wheel);

  // ---------------------------------------------------------------------------
  // 5. DRIVER SEAT (Backrest at z <= -0.25 so mobile POV z=-0.05 clears >= 0.19m)
  // ---------------------------------------------------------------------------
  const seat = new THREE.Group();
  seat.name = 'seat';
  seat.add(makeBox(0.50, 0.14, 0.48, windsorLeather, 0.42, 0.58, -0.12, 'seat_driver_cushion'));
  seat.add(makeBox(0.46, 0.62, 0.14, windsorLeather, 0.42, 0.97, -0.32, 'seat_driver_backrest'));
  seat.add(makeBox(0.24, 0.18, 0.12, windsorLeather, 0.42, 1.39, -0.32, 'seat_driver_headrest'));
  seat.add(makeBox(0.02, 0.46, 0.02, caliperOrange, 0.42, 0.98, -0.248, 'seat_driver_accent'));
  root.add(seat);

  // ---------------------------------------------------------------------------
  // 6. INTERIOR (Cross-car beam, dash, binnacle, Pivi, console, passenger seat)
  // ---------------------------------------------------------------------------
  const interior = new THREE.Group();
  interior.name = 'interior';

  // Passenger seat
  interior.add(makeBox(0.50, 0.14, 0.48, windsorLeather, -0.42, 0.58, -0.12, 'seat_pass_cushion'));
  interior.add(makeBox(0.46, 0.62, 0.14, windsorLeather, -0.42, 0.97, -0.32, 'seat_pass_backrest'));
  interior.add(makeBox(0.24, 0.18, 0.12, windsorLeather, -0.42, 1.39, -0.32, 'seat_pass_headrest'));

  // Cross-car structural magnesium beam & dash pad
  interior.add(makeBox(1.72, 0.09, 0.12, magnesiumBeam, 0, 0.95, 0.84, 'magnesium_beam'));
  interior.add(makeBox(1.72, 0.11, 0.32, windsorLeather, 0, 1.035, 0.84, 'dash_upper_pad'));

  // Driver binnacle screen + hood (y <= 1.12)
  interior.add(makeBox(0.32, 0.03, 0.16, windsorLeather, 0.42, 1.105, 0.80, 'binnacle_hood'));
  interior.add(makeBox(0.28, 0.11, 0.02, binnacleScreenMat, 0.42, 1.04, 0.78, 'binnacle_screen'));
  interior.add(makeBox(0.09, 0.012, 0.024, accentScreenMat, 0.42, 1.04, 0.778, 'binnacle_rev_bar'));

  // Center Pivi Pro screen & center console
  interior.add(makeBox(0.24, 0.14, 0.025, binnacleScreenMat, 0.0, 0.96, 0.76, 'pivi_screen'));
  interior.add(makeBox(0.28, 0.30, 0.80, windsorLeather, 0.0, 0.61, 0.25, 'center_console'));
  interior.add(makeBox(0.045, 0.09, 0.055, brushedAluminum, 0.04, 0.80, 0.42, 'gear_selector'));

  // Passenger grab handle & dome lens
  interior.add(makeBox(0.40, 0.035, 0.045, brushedAluminum, -0.42, 1.02, 0.76, 'passenger_grab_handle'));
  const domeLens = makeBox(0.14, 0.018, 0.07, domeLensMat, 0, 1.81, 0.15, 'interior_dome_lens');
  domeLens.castShadow = false;
  interior.add(domeLens);
  root.add(interior);

  // ---------------------------------------------------------------------------
  // 7. WHEELS (4 shared-geometry wheels with #e0541f V8 brake calipers)
  // ---------------------------------------------------------------------------
  const wheelTireGeo = new THREE.CylinderGeometry(
    VEHICLE_DIMENSIONS.wheelRadius,
    VEHICLE_DIMENSIONS.wheelRadius,
    VEHICLE_DIMENSIONS.tireWidth,
    28
  );
  wheelTireGeo.rotateZ(Math.PI / 2);
  const wheelRimGeo = new THREE.CylinderGeometry(0.27, 0.27, VEHICLE_DIMENSIONS.tireWidth + 0.01, 20);
  wheelRimGeo.rotateZ(Math.PI / 2);
  const wheelHubGeo = new THREE.CylinderGeometry(0.075, 0.075, VEHICLE_DIMENSIONS.tireWidth + 0.03, 16);
  wheelHubGeo.rotateZ(Math.PI / 2);
  const rotorGeo = new THREE.CylinderGeometry(0.21, 0.21, 0.035, 20);
  rotorGeo.rotateZ(Math.PI / 2);
  const spokeGeo = new THREE.BoxGeometry(0.025, 0.46, 0.038);
  const caliperGeo = new THREE.BoxGeometry(0.06, 0.13, 0.09);

  const wheelDefs = [
    ['wheel_fl', VEHICLE_DIMENSIONS.wheels.fl, 1],
    ['wheel_fr', VEHICLE_DIMENSIONS.wheels.fr, -1],
    ['wheel_rl', VEHICLE_DIMENSIONS.wheels.rl, 1],
    ['wheel_rr', VEHICLE_DIMENSIONS.wheels.rr, -1],
  ];

  const wheels = wheelDefs.map(([name, pos, side]) => {
    const wg = new THREE.Group();
    wg.name = name;
    wg.position.set(...pos);

    const tire = new THREE.Mesh(wheelTireGeo, tireRubber);
    tire.castShadow = true;
    tire.receiveShadow = true;

    const rim = new THREE.Mesh(wheelRimGeo, darkAlloy);
    const hub = new THREE.Mesh(wheelHubGeo, brushedAluminum);
    const rotor = new THREE.Mesh(rotorGeo, brushedAluminum);
    rotor.position.x = -side * 0.04;

    const caliper = new THREE.Mesh(caliperGeo, caliperOrange);
    caliper.position.set(side * 0.02, 0.08, -0.12);

    wg.add(tire, rim, hub, rotor, caliper);

    for (let s = 0; s < 5; s += 1) {
      const spoke = new THREE.Mesh(spokeGeo, brushedAluminum);
      spoke.position.x = side * (VEHICLE_DIMENSIONS.tireWidth * 0.5 + 0.005);
      spoke.rotation.x = (s * Math.PI) / 5;
      wg.add(spoke);
    }

    root.add(wg);
    return wg;
  });

  // ---------------------------------------------------------------------------
  // 8. QUAD EXHAUST (4 tips at tipsX, y=0.30, z=-2.36 + inner glow discs)
  // ---------------------------------------------------------------------------
  const exhaust = new THREE.Group();
  exhaust.name = 'exhaust';
  const exhaustGlowMeshes = [];

  const tipBarrelGeo = new THREE.CylinderGeometry(0.052, 0.055, 0.18, 20, 1, true);
  tipBarrelGeo.rotateX(Math.PI / 2);
  const tipGlowGeo = new THREE.CylinderGeometry(0.044, 0.044, 0.02, 16);
  tipGlowGeo.rotateX(Math.PI / 2);

  for (let i = 0; i < VEHICLE_DIMENSIONS.exhaust.tipsX.length; i += 1) {
    const x = VEHICLE_DIMENSIONS.exhaust.tipsX[i];
    const y = VEHICLE_DIMENSIONS.exhaust.tipY;
    const z = VEHICLE_DIMENSIONS.exhaust.tipZ;

    const barrel = new THREE.Mesh(tipBarrelGeo, brushedAluminum);
    barrel.name = `exhaust_barrel_${i}`;
    barrel.position.set(x, y, z + 0.06);
    barrel.castShadow = true;
    exhaust.add(barrel);

    const glowMat = new THREE.MeshStandardMaterial({
      color: '#1b110c',
      emissive: PALETTE.accent,
      emissiveIntensity: 0.04,
      roughness: 0.35,
      metalness: 0.2,
    });
    const glowDisc = new THREE.Mesh(tipGlowGeo, glowMat);
    glowDisc.name = `exhaust_glow_${i}`;
    glowDisc.position.set(x, y, z + 0.03);
    exhaust.add(glowDisc);
    exhaustGlowMeshes.push(glowDisc);
  }
  root.add(exhaust);

  // ---------------------------------------------------------------------------
  // 9. HEADLIGHTS & TAILLIGHTS
  // ---------------------------------------------------------------------------
  const headlights = new THREE.Group();
  headlights.name = 'headlights';
  const hlLensGeo = new THREE.CylinderGeometry(0.095, 0.095, 0.04, 20);
  hlLensGeo.rotateX(Math.PI / 2);
  for (const side of [1, -1]) {
    const housing = makeBox(0.28, 0.24, 0.06, satinCladding, side * 0.72, 0.94, 2.31, `hl_housing_${side}`);
    const lens = new THREE.Mesh(hlLensGeo, headlightEmissive);
    lens.position.set(side * 0.72, 0.94, 2.345);
    lens.name = `hl_lens_${side}`;
    const drlBar = makeBox(0.24, 0.025, 0.03, headlightEmissive, side * 0.72, 0.84, 2.345, `hl_drl_${side}`);
    headlights.add(housing, lens, drlBar);
  }
  root.add(headlights);

  const taillights = new THREE.Group();
  taillights.name = 'taillights';
  for (const side of [1, -1]) {
    taillights.add(makeBox(0.11, 0.14, 0.04, taillightEmissive, side * 0.82, 1.03, -2.34, `tl_top_${side}`));
    taillights.add(makeBox(0.11, 0.14, 0.04, taillightEmissive, side * 0.82, 0.85, -2.34, `tl_bot_${side}`));
  }
  taillights.add(makeBox(0.32, 0.035, 0.04, taillightEmissive, 0, 1.85, -2.21, 'tl_high_mount'));
  root.add(taillights);

  return {
    root,
    nodes: {
      body,
      door_driver,
      steering_wheel,
      seat,
      wheels,
      interior,
      exhaust,
      bonnet,
      headlights,
      taillights,
      exhaustGlowMeshes,
      domeLens,
    },
    isFallback: true,
    dispose() {
      disposeObjectTree(root);
    },
  };
}

/**
 * Resolves a candidate node name from a lookup map (exact first, then case-insensitive).
 */
function resolveNamedNode(byExact, byLower, candidates) {
  for (const name of candidates) {
    if (byExact.has(name)) {
      return { node: byExact.get(name), exact: true };
    }
  }
  for (const name of candidates) {
    const low = name.toLowerCase();
    if (byLower.has(low)) {
      return { node: byLower.get(low), exact: false };
    }
  }
  return { node: null, exact: false };
}

/**
 * Normalizes a loaded GLTF scene into canonical Defender dimensions and maps NODE_MAP.
 * @param {THREE.Object3D} gltfScene
 */
function normalizeAndMapGLTF(gltfScene) {
  const root = new THREE.Group();
  root.name = 'defender_110_v8_gltf';
  root.add(gltfScene);

  gltfScene.updateMatrixWorld(true);
  let box = new THREE.Box3().setFromObject(gltfScene);
  if (box.isEmpty()) {
    return null;
  }

  const size = new THREE.Vector3();
  box.getSize(size);
  if (size.x > size.z * 1.25) {
    gltfScene.rotation.y = Math.PI / 2;
    gltfScene.updateMatrixWorld(true);
    box = new THREE.Box3().setFromObject(gltfScene);
    box.getSize(size);
    console.warn('[defender-loader] Rotated GLB +90deg around Y to align +Z forward.');
  }

  const scale = VEHICLE_DIMENSIONS.length / Math.max(size.z, 0.001);
  gltfScene.scale.multiplyScalar(scale);
  gltfScene.updateMatrixWorld(true);

  box = new THREE.Box3().setFromObject(gltfScene);
  const center = new THREE.Vector3();
  box.getCenter(center);
  gltfScene.position.set(-center.x, VEHICLE_DIMENSIONS.groundY - box.min.y, -center.z);
  gltfScene.updateMatrixWorld(true);

  // Collect scene graph & enforce PBR materials + shadows + frustum culling
  const byExact = new Map();
  const byLower = new Map();
  const graphSummary = [];

  gltfScene.traverse((obj) => {
    if (obj.name) {
      if (!byExact.has(obj.name)) byExact.set(obj.name, obj);
      const low = obj.name.toLowerCase();
      if (!byLower.has(low)) byLower.set(low, obj);
      graphSummary.push(`${obj.name} (${obj.type})`);
    }
    if (obj.isMesh) {
      obj.frustumCulled = true;
      obj.castShadow = true;
      obj.receiveShadow = true;
      const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
      const converted = mats.map((mat) => {
        if (!mat) {
          return new THREE.MeshStandardMaterial({ color: '#222422', roughness: 0.55, metalness: 0.25 });
        }
        if (mat.isMeshStandardMaterial || mat.isMeshPhysicalMaterial) {
          return mat;
        }
        const pbr = new THREE.MeshStandardMaterial({
          color: mat.color ? mat.color.clone() : new THREE.Color('#222422'),
          map: mat.map ?? null,
          roughness: 0.55,
          metalness: 0.25,
        });
        mat.dispose();
        return pbr;
      });
      obj.material = Array.isArray(obj.material) ? converted : converted[0];
    }
  });

  let hasMismatch = false;
  const resolveSingle = (key) => {
    const res = resolveNamedNode(byExact, byLower, NODE_MAP[key]);
    if (!res.node || !res.exact) hasMismatch = true;
    if (res.node) return res.node;
    const placeholder = new THREE.Group();
    placeholder.name = `${key}_placeholder`;
    root.add(placeholder);
    return placeholder;
  };

  const body = resolveSingle('body');
  let door_driver = resolveSingle('door_driver');
  const steering_wheel = resolveSingle('steering_wheel');
  const seat = resolveSingle('seat');
  const interior = resolveSingle('interior');
  const exhaust = resolveSingle('exhaust');
  const bonnet = resolveSingle('bonnet');
  const headlights = resolveSingle('headlights');
  const taillights = resolveSingle('taillights');

  const wheels = NODE_MAP.wheels.map((wName) => {
    const res = resolveNamedNode(byExact, byLower, [wName]);
    if (!res.node || !res.exact) hasMismatch = true;
    return res.node || new THREE.Group();
  });

  if (hasMismatch) {
    console.warn(
      '[defender-loader] Scene graph node mismatch or missing optional nodes; hierarchy:',
      graphSummary.slice(0, 60)
    );
  }

  // Wrap door_driver in an A-pillar hinge pivot if its origin is far from the front edge
  if (door_driver && door_driver.parent && door_driver.children.length > 0) {
    const doorBox = new THREE.Box3().setFromObject(door_driver);
    if (!doorBox.isEmpty()) {
      const doorCenter = new THREE.Vector3();
      doorBox.getCenter(doorCenter);
      const hingeTarget = new THREE.Vector3(doorBox.max.x, doorCenter.y, doorBox.max.z);
      const doorWorld = new THREE.Vector3();
      door_driver.getWorldPosition(doorWorld);
      if (doorWorld.distanceTo(hingeTarget) > 0.12) {
        const hingePivot = new THREE.Group();
        hingePivot.name = 'door_driver_hinge';
        hingePivot.position.copy(hingeTarget);
        door_driver.parent.add(hingePivot);
        hingePivot.attach(door_driver);
        door_driver = hingePivot;
      }
    }
  }

  // Collect or synthesize exhaustGlowMeshes
  const exhaustGlowMeshes = [];
  exhaust.traverse((obj) => {
    if (obj.isMesh) {
      const mat = Array.isArray(obj.material) ? obj.material[0] : obj.material;
      if (mat && mat.emissive && /glow|ember|inner|tip/i.test(obj.name || '')) {
        exhaustGlowMeshes.push(obj);
      }
    }
  });
  if (exhaustGlowMeshes.length === 0) {
    const tipGlowGeo = new THREE.CylinderGeometry(0.044, 0.044, 0.02, 16);
    tipGlowGeo.rotateX(Math.PI / 2);
    for (let i = 0; i < VEHICLE_DIMENSIONS.exhaust.tipsX.length; i += 1) {
      const glowMat = new THREE.MeshStandardMaterial({
        color: '#1b110c',
        emissive: PALETTE.accent,
        emissiveIntensity: 0.04,
        roughness: 0.35,
      });
      const disc = new THREE.Mesh(tipGlowGeo, glowMat);
      disc.name = `exhaust_glow_${i}`;
      disc.position.set(
        VEHICLE_DIMENSIONS.exhaust.tipsX[i],
        VEHICLE_DIMENSIONS.exhaust.tipY,
        VEHICLE_DIMENSIONS.exhaust.tipZ + 0.03
      );
      root.add(disc);
      exhaustGlowMeshes.push(disc);
    }
  }

  return {
    root,
    nodes: {
      body,
      door_driver,
      steering_wheel,
      seat,
      wheels,
      interior,
      exhaust,
      bonnet,
      headlights,
      taillights,
      exhaustGlowMeshes,
      domeLens: null,
    },
    isFallback: false,
    dispose() {
      disposeObjectTree(root);
    },
  };
}

/**
 * Loads /assets/model/defender.glb via GLTFLoader + DRACOLoader + KTX2Loader + MeshoptDecoder,
 * falling back cleanly with console.warn to the procedural Defender 110 V8 on missing/HTML/corrupt assets.
 *
 * @param {THREE.LoadingManager} [loadingManager]
 * @param {THREE.WebGLRenderer} [renderer]
 */
export async function loadDefender(loadingManager = null, renderer = null) {
  const probe = await probeModelAsset(ASSET_PATHS.model, loadingManager);
  if (!probe.ok) {
    console.warn(
      `[defender-loader] Using procedural Defender 110 V8 fallback (${probe.reason}: ${probe.url}).`
    );
    return buildProceduralDefender();
  }

  const manager = loadingManager || new THREE.LoadingManager();
  const dracoLoader = new DRACOLoader(manager);
  dracoLoader.setDecoderPath(ASSET_PATHS.draco || '/draco/');

  const ktx2Loader = new KTX2Loader(manager);
  ktx2Loader.setTranscoderPath(ASSET_PATHS.basis || '/basis/');
  if (renderer) {
    ktx2Loader.detectSupport(renderer);
  }

  await MeshoptDecoder.ready;

  const gltfLoader = new GLTFLoader(manager);
  gltfLoader.setDRACOLoader(dracoLoader);
  gltfLoader.setKTX2Loader(ktx2Loader);
  gltfLoader.setMeshoptDecoder(MeshoptDecoder);

  if (typeof manager.itemStart === 'function') {
    manager.itemStart(ASSET_PATHS.model);
  }

  try {
    const gltf = await gltfLoader.parseAsync(probe.buffer, '/assets/model/');
    const mapped = normalizeAndMapGLTF(gltf.scene);
    if (!mapped) {
      console.warn('[defender-loader] Loaded GLB has empty bounds; using procedural Defender fallback.');
      disposeObjectTree(gltf.scene);
      return buildProceduralDefender();
    }
    return mapped;
  } catch (err) {
    console.warn(
      '[defender-loader] Failed to parse GLB; using procedural Defender 110 V8 fallback:',
      err?.message || err
    );
    return buildProceduralDefender();
  } finally {
    if (typeof manager.itemEnd === 'function') {
      manager.itemEnd(ASSET_PATHS.model);
    }
    dracoLoader.dispose();
    ktx2Loader.dispose();
  }
}
