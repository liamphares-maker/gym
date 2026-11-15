// 3D body on the Body tab: the Anny human body model (NAVER LABS, Apache-2.0; body data CC0, from MakeHuman),
// shown blue standing with arms by its sides, which you can spin with a finger. body.bin holds an average young man plus three
// morphs: thin and heavy versions (Anny's weight setting and its local fat/size changes) and a muscular one.
// Height scales the whole figure (the camera never moves, so tall people look tall); BMI picks the blend.
// Loaded only when Body is first opened, as three.js and the body are large.
import * as THREE from './three.module.min.js';

const FRAME = 360; // canvas height in px
const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
let renderer, scene, camera, mat, body, key = '', yaw = 0.5, drag = null, running = false;

function setup() {
  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  scene = light(new THREE.Scene());
  camera = new THREE.PerspectiveCamera(30, 1, 0.1, 50);
  mat = new THREE.MeshStandardMaterial({ color: 0x3f7fd6, roughness: 0.6, metalness: 0 });

  const c = renderer.domElement;
  c.style.touchAction = 'pan-y'; // sideways drags spin the model; up/down still scrolls the page
  c.addEventListener('pointerdown', e => { drag = e.clientX; c.setPointerCapture(e.pointerId); });
  c.addEventListener('pointermove', e => { if (drag !== null) { yaw += (e.clientX - drag) * 0.012; drag = e.clientX; } });
  for (const t of ['pointerup', 'pointercancel']) c.addEventListener(t, () => drag = null);
}

// Studio light: soft fill, a white key from high in front (centred, so both sides light the same; from above so
// muscles cast soft shadows underneath), and bright rims from behind.
function light(s) {
  s.add(new THREE.HemisphereLight(0xdcebe0, 0x0a100c, 1.1));
  const keyLight = new THREE.DirectionalLight(0xffffff, 2.2);
  keyLight.position.set(0, 5, 2.5);
  s.add(keyLight);
  for (const x of [-3, 3]) {
    const rim = new THREE.DirectionalLight(0xd4ecdc, 2.6);
    rim.position.set(x, 2, -3);
    s.add(rim);
  }
  return s;
}

// BMI along the blend from thin (-1) to average (0) to heavy (+1), measured from the mesh's volume by Anny.
const BMI = [[-1, 17.42], [-0.75, 18.89], [-0.5, 20.46], [-0.25, 22.14], [0, 23.97], [0.25, 27.28], [0.5, 30.82], [0.75, 34.5], [1, 38.1]];
const MESH_H = 1.909; // body.bin's height in metres

// BMI → blend. Stops at either end (BMI 17 and 38): pushing the morphs further pulls the mesh out of shape.
function blend(bmi) {
  let k = 1;
  while (k < BMI.length - 1 && bmi > BMI[k][1]) k++;
  const [[t0, b0], [t1, b1]] = [BMI[k - 1], BMI[k]];
  return Math.min(1, Math.max(-1, t0 + (bmi - b0) / (b1 - b0) * (t1 - t0)));
}
// Muscle definition: full across the healthy range (18.5–25), fading out over its first and last point.
const tone = bmi => Math.max(0, Math.min(1, bmi - 18.5, 25 - bmi));

// body.bin: vertex count, triangle count, then base positions, thin, heavy and muscular deltas (float32 xyz) and triangles (uint16).
async function load() {
  const buf = await (await fetch('body.bin')).arrayBuffer();
  const [n, f] = new Uint32Array(buf, 0, 2), at = k => new Float32Array(buf, 8 + k * n * 12, n * 3);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(at(0), 3));
  geo.setIndex(new THREE.BufferAttribute(new Uint16Array(buf, 8 + 4 * n * 12, f * 3), 1));
  geo.computeVertexNormals();
  // Each morph also carries its change in normals, so shading stays right as the body fills out.
  const normals = [1, 2, 3].map(k => {
    const g = geo.clone(), p = g.attributes.position.array.slice(), d = at(k);
    for (let i = 0; i < p.length; i++) p[i] += d[i];
    g.setAttribute('position', new THREE.BufferAttribute(p, 3));
    g.computeVertexNormals();
    const nn = g.attributes.normal.array, base = geo.attributes.normal.array;
    for (let i = 0; i < nn.length; i++) nn[i] -= base[i];
    return new THREE.BufferAttribute(nn, 3);
  });
  geo.morphAttributes.position = [1, 2, 3].map(k => new THREE.BufferAttribute(at(k), 3));
  geo.morphAttributes.normal = normals;
  geo.morphTargetsRelative = true;
  body = new THREE.Mesh(geo, mat);
}

function build(H, bmi) {
  const t = blend(bmi);
  body.morphTargetInfluences[0] = Math.max(0, -t);
  body.morphTargetInfluences[1] = Math.max(0, t);
  body.morphTargetInfluences[2] = tone(bmi);
  body.scale.setScalar(H / MESH_H);
}

function loop() {
  if (!renderer.domElement.isConnected) { running = false; return; } // Body tab closed: stop drawing
  if (drag === null && !reduce) yaw += 0.006;
  shown.rotation.y = yaw;
  renderer.render(scene, camera);
  requestAnimationFrame(loop);
}

// One renderer for both views: shows this mesh (the Body tab's body or Today's muscle body) and hides the other.
let shown;
function use(mesh) {
  if (shown === mesh) return;
  if (shown) scene.remove(shown);
  scene.add(shown = mesh);
}

// Puts the model in el (re-attached after each page redraw) and reshapes it for height h (cm) and weight kg.
let loading;
export async function show(el, h, kg) {
  if (!renderer) setup();
  await (loading ||= load());
  const c = renderer.domElement;
  if (c.parentNode !== el) el.prepend(c);
  renderer.setSize(el.clientWidth, FRAME);
  camera.aspect = el.clientWidth / FRAME;
  // Frames 0–2.25 m from a fixed spot, so a 7′ person nearly fills it and a 5′ person doesn't.
  camera.position.set(0, 1.1, 4.3);
  camera.lookAt(0, 1.1, 0);
  camera.updateProjectionMatrix();
  use(body);

  const ok = h >= 100 && h <= 250 && kg > 0;
  const H = ok ? h : 175, K = ok ? kg : 70;
  if (key !== `${H}|${K}`) { key = `${H}|${K}`; build(H / 100, K / (H / 100) ** 2); }
  if (!running) { running = true; requestAnimationFrame(loop); }
}

// ── Muscle map in 3D (Today) ──────────────────────────────────────────────────────────────────────────────────────────
// Écorché (github.com/Charleeh/ecorche, CC BY-SA 4.0; from BodyParts3D, CC BY 4.0, and Z-Anatomy, CC BY-SA 4.0): the
// surface muscles and the bones that show, at full detail, palms turned to face the body. muscles.bin holds the left half and the midline; the right half
// is the left mirrored. Each part is tagged with one of the app's muscle groups (or none, or bone), see MUSCLE_IDS.
const M3D = 300; // canvas height in px
const MUSCLE_IDS = ['chest', 'shoulders', 'biceps', 'triceps', 'forearms', 'abs', 'traps', 'lats', 'upperback', 'lowerback', 'glutes', 'quads', 'hamstrings', 'calves']; // ids 1–14; 0 other muscle, 15 bone
let mbody, groupOf, shade, mloading, mH, mR;

// muscles.bin: u32 part count; per part u32 vertices, indices, group | mirrored << 8; then every part's positions
// (int16 xyz, 0.1 mm), indices (uint16), normals (int8 xyz) and tones (uint8 shade, paleness; baked from the model's colours).
async function loadMuscles() {
  const buf = await (await fetch('muscles.bin')).arrayBuffer();
  const n = new Uint32Array(buf, 0, 1)[0], head = new Uint32Array(buf, 4, n * 3), parts = [];
  let V = 0, I = 0;
  for (let k = 0; k < n; k++) { const [v, i, g] = head.subarray(k * 3, k * 3 + 3), m = g >> 8; parts.push({ v, i, g: g & 255, m }); V += v * (1 + m); I += i * (1 + m); }
  let off = 4 + n * 12;
  const take = (T, per, key) => { for (const p of parts) { p[key] = new T(buf, off, p[key === 'idx' ? 'i' : 'v'] * per); off += p[key].byteLength; } };
  take(Int16Array, 3, 'pos'); take(Uint16Array, 1, 'idx'); take(Int8Array, 3, 'nrm'); take(Uint8Array, 2, 'tone');
  const pos = new Int16Array(V * 3), nrm = new Int8Array(V * 3), idx = new Uint32Array(I);
  groupOf = new Uint8Array(V); shade = new Uint8Array(V * 2);
  let v0 = 0, i0 = 0;
  for (const p of parts) for (const flip of p.m ? [1, -1] : [1]) {
    pos.set(p.pos, v0 * 3); nrm.set(p.nrm, v0 * 3); shade.set(p.tone, v0 * 2); groupOf.fill(p.g, v0, v0 + p.v);
    if (flip < 0) for (let j = v0 * 3; j < (v0 + p.v) * 3; j += 3) { pos[j] = -pos[j]; nrm[j] = -nrm[j]; }
    for (let j = 0; j < p.i; j += 3) { // mirrored triangles wind the other way
      idx[i0 + j] = v0 + p.idx[j]; idx[i0 + j + 1] = v0 + p.idx[flip < 0 ? j + 2 : j + 1]; idx[i0 + j + 2] = v0 + p.idx[flip < 0 ? j + 1 : j + 2];
    }
    v0 += p.v; i0 += p.i;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(nrm, 3, true));
  geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(V * 3), 3));
  geo.setAttribute('glow', new THREE.BufferAttribute(new Float32Array(V), 1));
  geo.setIndex(new THREE.BufferAttribute(idx, 1));
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.65, metalness: 0 });
  mat.onBeforeCompile = s => { // the picked exercise's muscles glow on their own, so they show even in shadow
    s.vertexShader = 'attribute float glow;\nvarying float vGlow;\n' + s.vertexShader.replace('#include <color_vertex>', '#include <color_vertex>\nvGlow = glow;');
    s.fragmentShader = 'varying float vGlow;\n' + s.fragmentShader.replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += diffuseColor.rgb * vGlow;');
  };
  mbody = new THREE.Mesh(geo, mat);
  mbody.scale.setScalar(1e-4);
  geo.computeBoundingBox();
  const b = geo.boundingBox;
  mH = b.max.y * 1e-4;
  mR = Math.max(-b.min.x, b.max.x, -b.min.z, b.max.z) * 1e-4; // furthest reach from the spin axis
}

// Dark muscles, faint theme colour for the session's, full and glowing for the picked exercise's. Bones a little paler.
// Muscle, bone and tendon colours come from the theme's --m3d.
function paint(on, hot, shine = 0.9) {
  const css = getComputedStyle(document.documentElement), v = css.getPropertyValue('--accent').match(/[\d.]+/g) || [75, 100, 60];
  const [BASE, BONE, PALE] = css.getPropertyValue('--m3d').trim().split(/\s+/).map(c => new THREE.Color(c));
  const lit = new THREE.Color(`hsl(${v[0]}, ${v[1]}%, ${v[2]}%)`), faint = BASE.clone().lerp(lit, 0.2);
  const look = [BASE, ...MUSCLE_IDS.map(k => hot.has(k) ? lit : on.has(k) ? faint : BASE), BONE];
  const col = mbody.geometry.attributes.color, glow = mbody.geometry.attributes.glow, c = new THREE.Color();
  for (let i = 0; i < groupOf.length; i++) {
    const g = groupOf[i], hotty = g >= 1 && g <= 14 && hot.has(MUSCLE_IDS[g - 1]);
    c.copy(look[g]);
    if (!hotty) c.lerp(PALE, (shade[i * 2 + 1] / 255) ** 4 * 0.6); // tendons and fascia show paler, as in the model
    c.multiplyScalar(0.45 + 0.55 * shade[i * 2] / 255); // the model's baked shading, so crevices read
    col.setXYZ(i, c.r, c.g, c.b);
    glow.array[i] = hotty ? shine : 0;
  }
  col.needsUpdate = glow.needsUpdate = true;
}

// Puts the spinning muscle model in el, lighting the muscles in on faintly and those in hot brightly.
export async function muscles(el, on, hot) {
  if (!renderer) setup();
  await (mloading ||= loadMuscles());
  if (!el.isConnected) return; // the page was redrawn while loading
  paint(on, hot);
  use(mbody);
  const cv = renderer.domElement;
  if (cv.parentNode !== el) el.replaceChildren(cv);
  renderer.setSize(el.clientWidth, M3D);
  camera.aspect = el.clientWidth / M3D;
  // Whole figure, a little room around it: tall enough for its height, wide enough for outstretched arms as it spins.
  // A theme can shrink the figure (--m3d-zoom) and stand its feet a fraction up from the bottom (--m3d-floor), e.g. on
  // Gothic's plinth, clear of its arch.
  const css = getComputedStyle(document.documentElement), zoom = +css.getPropertyValue('--m3d-zoom') || 1, floor = +css.getPropertyValue('--m3d-floor');
  const fit = Math.max(mH * 0.55, mR * 1.1 / camera.aspect) / zoom, y = floor ? fit * (1 - 2 * floor) : mH / 2; // fit = half the height in view
  camera.position.set(0, y, fit / Math.tan(Math.PI / 12) + mR);
  camera.lookAt(0, y, 0);
  camera.updateProjectionMatrix();
  if (!running) { running = true; requestAnimationFrame(loop); }
}

// Plan's muscle icons: the muscle model zoomed in on each muscle, lit up, as image URLs by muscle id. Drawn once
// per colour scheme on a throwaway renderer, so Today's live model is left alone.
const BEHIND = new Set(['triceps', 'traps', 'lats', 'upperback', 'lowerback', 'glutes', 'hamstrings', 'calves']);
const ONE_ARM = new Set(['biceps', 'triceps', 'forearms']);
export async function icons(px = 132) {
  await (mloading ||= loadMuscles());
  const r = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
  r.setSize(px, px, false);
  const s = light(new THREE.Scene()), cam = new THREE.OrthographicCamera(), out = {};
  const prev = mbody.parent, spin = mbody.rotation.y, pos = mbody.geometry.attributes.position.array;
  cam.position.set(0, 0, 5);
  s.add(mbody);
  MUSCLE_IDS.forEach((m, k) => {
    const flip = BEHIND.has(m) ? -1 : 1; // turned round, x on screen is the model's -x
    const xs = [], ys = [];
    for (let i = 0; i < groupOf.length; i++) {
      if (groupOf[i] !== k + 1) continue;
      const x = pos[i * 3] * flip;
      if (ONE_ARM.has(m) && x > 0) continue; // just the arm on the left of the picture
      xs.push(x); ys.push(pos[i * 3 + 1]);
    }
    // Frame the bulk of the muscle: the outermost 3% each way are stray tendon tips that would pull it off-centre.
    const cut = a => { a.sort((p, q) => p - q); return [a[Math.floor(a.length * 0.03)], a[Math.floor(a.length * 0.97)]]; };
    const [x0, x1] = cut(xs), [y0, y1] = cut(ys);
    const cx = (x0 + x1) / 2e4, cy = (y0 + y1) / 2e4, h = Math.max(x1 - x0, y1 - y0) / 2e4 * 1.3; // a little body round it
    Object.assign(cam, { left: cx - h, right: cx + h, top: cy + h, bottom: cy - h, near: 0.1, far: 20 });
    cam.updateProjectionMatrix();
    mbody.rotation.y = flip < 0 ? Math.PI : 0;
    paint(new Set(), new Set([m]), 0.25); // less glow than Today's, so the muscle's shape reads at this size
    r.render(s, cam);
    out[m] = r.domElement.toDataURL();
  });
  mbody.rotation.y = spin;
  if (prev) prev.add(mbody); else s.remove(mbody);
  r.dispose(); r.forceContextLoss();
  return out;
}
