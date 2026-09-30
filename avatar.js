// Аватар на первом экране. Три режима — задаются атрибутом data-avatar у .hero__stage:
//   data-avatar="assets/avatar.png"  — картинка (PNG/WebP без фона) с 3D-наклоном за курсором;
//   data-avatar="assets/avatar.glb"  — 3D-модель (GLB), поворачивается к курсору;
//   data-avatar=""                   — временный процедурный персонаж-заглушка.

const stage = document.querySelector('.hero__stage');
const canvas = stage?.querySelector('.hero__canvas');

const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// Общий трекинг курсора: -1..1 относительно центра сцены
const pointer = { x: 0, y: 0, active: false };
window.addEventListener('pointermove', (e) => {
  if (!stage) return;
  const rect = stage.getBoundingClientRect();
  const cx = rect.left + rect.width / 2;
  const cy = rect.top + rect.height * 0.4;
  pointer.x = Math.max(-1, Math.min(1, (e.clientX - cx) / (window.innerWidth * 0.5)));
  pointer.y = Math.max(-1, Math.min(1, (e.clientY - cy) / (window.innerHeight * 0.5)));
  pointer.active = true;
}, { passive: true });

function useImage(src) {
  const wrap = document.createElement('div');
  wrap.className = 'hero__avatar';
  const img = document.createElement('img');
  img.className = 'hero__avatar-img';
  img.src = src;
  img.alt = 'Егор';
  img.decoding = 'async';
  wrap.appendChild(img);
  canvas.replaceWith(wrap);
  if (reduceMotion) return;

  const smooth = { x: 0, y: 0 };
  const start = performance.now();
  const loop = (now) => {
    const t = (now - start) / 1000;
    const tx = pointer.active ? pointer.x : Math.sin(t * 0.6) * 0.3;
    const ty = pointer.active ? pointer.y : Math.sin(t * 0.8) * 0.15;
    smooth.x += (tx - smooth.x) * 0.08;
    smooth.y += (ty - smooth.y) * 0.08;
    const lift = Math.sin(t * 1.3) * 8;
    img.style.transform =
      `translate3d(${smooth.x * 10}px, ${lift}px, 0) rotateY(${smooth.x * 12}deg) rotateX(${-smooth.y * 8}deg)`;
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
}

async function init() {
  if (!stage || !canvas) return;
  const src = stage.dataset.avatar;
  const isModel = /\.(glb|gltf)(\?|$)/i.test(src || '');
  if (src && !isModel) return useImage(src);

  let THREE, RoomEnvironment;
  try {
    THREE = await import('three');
    ({ RoomEnvironment } = await import('three/addons/environments/RoomEnvironment.js'));
  } catch (e) {
    canvas.remove();
    return;
  }

  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  } catch (e) {
    canvas.remove();
    return;
  }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.55;

  const camera = new THREE.PerspectiveCamera(28, 1, 0.1, 200);

  // ---------- Свет ----------
  const key = new THREE.DirectionalLight(0xfff1e2, 2.4);
  key.position.set(3, 4, 6);
  scene.add(key);
  const rimViolet = new THREE.DirectionalLight(0x8d6bff, 5);
  rimViolet.position.set(-5, 2, -4);
  scene.add(rimViolet);
  const rimLime = new THREE.DirectionalLight(0xd4ff3f, 2.6);
  rimLime.position.set(5, 0.5, -3);
  scene.add(rimLime);
  scene.add(new THREE.HemisphereLight(0xcfc4ff, 0x20122e, 0.6));

  // ---------- Материалы ----------
  const M = {
    skin: new THREE.MeshPhysicalMaterial({ color: 0xf0a982, roughness: 0.55, sheen: 0.4, sheenColor: 0xffc9a8, clearcoat: 0.12, clearcoatRoughness: 0.6 }),
    skinDark: new THREE.MeshPhysicalMaterial({ color: 0xd98a66, roughness: 0.6 }),
    blush: new THREE.MeshBasicMaterial({ color: 0xff7a8a, transparent: true, opacity: 0.22, depthWrite: false }),
    hair: new THREE.MeshPhysicalMaterial({ color: 0x2a1810, roughness: 0.5, sheen: 1, sheenColor: 0x7a4a2c, clearcoat: 0.3, clearcoatRoughness: 0.4 }),
    white: new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.12, clearcoat: 1 }),
    iris: new THREE.MeshPhysicalMaterial({ color: 0x5a3417, roughness: 0.25, clearcoat: 1 }),
    pupil: new THREE.MeshPhysicalMaterial({ color: 0x0b0706, roughness: 0.2, clearcoat: 1 }),
    shine: new THREE.MeshBasicMaterial({ color: 0xffffff }),
    mouth: new THREE.MeshPhysicalMaterial({ color: 0x7a2630, roughness: 0.5 }),
    hoodie: new THREE.MeshPhysicalMaterial({ color: 0x6b4cff, roughness: 0.85, sheen: 1, sheenColor: 0xb9a6ff, sheenRoughness: 0.6 }),
    hoodieDark: new THREE.MeshPhysicalMaterial({ color: 0x4e33d6, roughness: 0.9, sheen: 1, sheenColor: 0x9c86ff }),
    lime: new THREE.MeshPhysicalMaterial({ color: 0xc8f53a, roughness: 0.3, clearcoat: 0.8, clearcoatRoughness: 0.2 }),
    black: new THREE.MeshPhysicalMaterial({ color: 0x141418, roughness: 0.45, clearcoat: 0.4 }),
    string: new THREE.MeshPhysicalMaterial({ color: 0xf2f2f5, roughness: 0.6 }),
  };

  const mesh = (geo, mat, pos = [0, 0, 0], scale, rot) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(...pos);
    if (scale) m.scale.set(...scale);
    if (rot) m.rotation.set(...rot);
    return m;
  };
  const sphere = (r, seg = 48) => new THREE.SphereGeometry(r, seg, Math.round(seg * 0.75));

  // ---------- Персонаж ----------
  const character = new THREE.Group();
  scene.add(character);
  // pivot — то, что поворачивается к курсору (голова у заглушки, вся модель у GLB)
  let pivot = null;
  const eyes = [];
  const brows = [];
  let body = null;

  if (isModel) {
    try {
      const { GLTFLoader } = await import('three/addons/loaders/GLTFLoader.js');
      const gltf = await new GLTFLoader().loadAsync(src);
      const model = gltf.scene;
      // центрируем модель: низ на 0, по центру X/Z
      const box = new THREE.Box3().setFromObject(model);
      const center = box.getCenter(new THREE.Vector3());
      model.position.sub(new THREE.Vector3(center.x, box.min.y, center.z));
      pivot = new THREE.Group();
      pivot.add(model);
      character.add(pivot);
    } catch (e) {
      console.warn('Не удалось загрузить 3D-модель аватара', e);
    }
  }

  if (!pivot) {
    buildPlaceholder();
  }

  function buildPlaceholder() {

  // Тело — худи
  body = new THREE.Group();
  character.add(body);
  body.add(mesh(sphere(1.25, 64), M.hoodie, [0, -2.05, -0.05], [1.35, 0.95, 0.82]));
  // капюшон за шеей
  body.add(mesh(new THREE.TorusGeometry(0.62, 0.26, 24, 64), M.hoodieDark, [0, -1.28, -0.28], [1, 1, 0.9], [Math.PI / 2 - 0.35, 0, 0]));
  // шнурки
  [-0.2, 0.2].forEach((x) => {
    body.add(mesh(new THREE.CapsuleGeometry(0.025, 0.55, 6, 12), M.string, [x, -1.62, 0.93], null, [0.3, 0, x * 0.3]));
    body.add(mesh(sphere(0.05, 16), M.string, [x * 1.08, -1.92, 1.02]));
  });
  // шея
  body.add(mesh(new THREE.CylinderGeometry(0.3, 0.36, 0.5, 32), M.skin, [0, -0.98, 0]));

  // Наушники на шее
  const phones = new THREE.Group();
  phones.position.set(0, -1.12, 0.1);
  phones.rotation.x = 0.42;
  phones.add(mesh(new THREE.TorusGeometry(0.66, 0.075, 16, 80, Math.PI * 1.25), M.lime, [0, 0, 0], null, [Math.PI / 2, 0, Math.PI * 0.875]));
  [-1, 1].forEach((s) => {
    const cup = new THREE.Group();
    cup.position.set(s * 0.6, 0.02, 0.32);
    cup.rotation.set(0, s * 0.5, s * 0.15);
    cup.add(mesh(new THREE.CylinderGeometry(0.24, 0.24, 0.16, 40), M.lime, [0, 0, 0], null, [Math.PI / 2, 0, 0]));
    cup.add(mesh(new THREE.TorusGeometry(0.19, 0.06, 16, 40), M.black, [0, 0, -0.09]));
    cup.add(mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.02, 24), M.black, [0, 0, 0.085], null, [Math.PI / 2, 0, 0]));
    phones.add(cup);
  });
  body.add(phones);

  // Голова
  const head = new THREE.Group();
  head.position.set(0, 0.55, 0);
  character.add(head);
  pivot = head;

  const skull = new THREE.Group();
  skull.add(mesh(sphere(1, 72), M.skin, [0, 0.06, 0], [0.97, 1.06, 0.94]));
  head.add(skull);

  // уши
  [-1, 1].forEach((s) => {
    head.add(mesh(sphere(0.22, 32), M.skin, [s * 0.93, -0.02, -0.02], [0.5, 1, 0.8], [0, s * 0.3, 0]));
    head.add(mesh(sphere(0.12, 24), M.skinDark, [s * 0.97, -0.02, 0.03], [0.35, 0.8, 0.6], [0, s * 0.3, 0]));
  });

  // нос
  head.add(mesh(sphere(0.14, 32), M.skin, [0, -0.13, 0.93], [1.05, 0.85, 1]));
  // румянец
  [-1, 1].forEach((s) => head.add(mesh(sphere(0.16, 24), M.blush, [s * 0.5, -0.25, 0.8], [1, 0.7, 0.3], [0, s * 0.5, 0])));

  // рот — лёгкая ухмылка
  const mouth = mesh(new THREE.TorusGeometry(0.17, 0.035, 12, 32, Math.PI * 0.85), M.mouth, [0.05, -0.43, 0.85], null, [0.15, 0, Math.PI + 0.3]);
  head.add(mouth);

  // глаза (слегка выступают из головы, чтобы не «проваливаться» при поворотах)
  [-1, 1].forEach((s) => {
    const eye = new THREE.Group();
    eye.position.set(s * 0.33, 0.08, 0.76);
    eye.add(mesh(sphere(0.23, 40), M.white, [0, 0, 0], [1, 1.12, 0.8]));
    const look = new THREE.Group(); // вращается — зрачок «ездит» по яблоку
    look.add(mesh(sphere(0.13, 32), M.iris, [0, 0, 0.16], [1, 1.05, 0.4]));
    look.add(mesh(sphere(0.075, 24), M.pupil, [0, 0, 0.2], [1, 1.05, 0.4]));
    look.add(mesh(sphere(0.032, 12), M.shine, [0.045, 0.055, 0.225]));
    look.add(mesh(sphere(0.016, 12), M.shine, [-0.04, -0.045, 0.22]));
    eye.add(look);
    head.add(eye);
    eyes.push({ eye, look });
  });

  // брови
  [-1, 1].forEach((s) => {
    const b = mesh(new THREE.CapsuleGeometry(0.055, 0.26, 8, 16), M.hair, [s * 0.34, 0.42, 0.86], null, [0, s * -0.35, Math.PI / 2 + s * -0.18]);
    head.add(b);
    brows.push(b);
  });

  // волосы: «шапка» + объёмная чёлка-квифф
  const hair = new THREE.Group();
  head.add(hair);
  hair.add(mesh(new THREE.SphereGeometry(1.03, 72, 36, 0, Math.PI * 2, 0, Math.PI * 0.46), M.hair, [0, 0.14, -0.04], [0.97, 1.02, 0.94], [-0.42, 0, 0]));
  // виски
  [-1, 1].forEach((s) => hair.add(mesh(sphere(0.3, 32), M.hair, [s * 0.82, 0.38, 0.05], [0.45, 1.1, 0.9], [0, 0, s * -0.2])));
  // объёмный квифф из мягких «глиняных» масс: [x, y, z, sx, sy, sz, rotX, rotZ]
  const blobs = [
    [0.05, 1.02, 0.28, 0.72, 0.42, 0.62, -0.35, -0.25],
    [-0.38, 0.92, 0.3, 0.5, 0.34, 0.5, -0.3, 0.35],
    [0.42, 0.95, 0.22, 0.52, 0.36, 0.52, -0.3, -0.45],
    [0.28, 1.18, 0.42, 0.46, 0.3, 0.42, -0.6, -0.6],
    [-0.05, 1.12, -0.2, 0.7, 0.38, 0.6, 0.2, 0.1],
    [0.55, 0.78, 0.45, 0.3, 0.22, 0.3, -0.5, -0.9],
    [-0.6, 0.72, 0.42, 0.26, 0.2, 0.28, -0.4, 0.8],
  ];
  blobs.forEach(([x, y, z, sx, sy, sz, rx, rz]) => hair.add(mesh(sphere(1, 48), M.hair, [x, y, z], [sx, sy, sz], [rx, 0, rz])));
  }

  // ---------- Композиция и адаптив ----------
  // Камера подбирается по габаритам персонажа, чтобы он никогда не обрезался
  character.updateMatrixWorld(true);
  const bounds = new THREE.Box3().setFromObject(character);
  // у заглушки в кадр берём голову и плечи, низ худи уходит под маску
  if (!isModel) bounds.min.y = Math.max(bounds.min.y, -1.9);
  const size = bounds.getSize(new THREE.Vector3());
  const mid = bounds.getCenter(new THREE.Vector3());
  const PAD = 1.18; // запас на повороты головы и покачивание

  const resize = () => {
    const { clientWidth: w, clientHeight: h } = stage;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    const tan = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    const distH = (size.y * PAD) / 2 / tan;
    const distW = (size.x * PAD) / 2 / (tan * camera.aspect);
    const dist = Math.max(distH, distW) + size.z / 2;
    camera.position.set(mid.x, mid.y, mid.z + dist);
    camera.lookAt(mid);
    camera.near = dist / 50;
    camera.far = dist * 4;
    camera.updateProjectionMatrix();
  };
  new ResizeObserver(resize).observe(stage);
  resize();

  // ---------- Взаимодействие ----------
  const smooth = { x: 0, y: 0 };

  // Моргание
  let nextBlink = 1.5;
  let blinkT = -1;

  // Появление
  let intro = reduceMotion ? 1 : 0;

  let visible = true;
  new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; }).observe(stage);

  const clock = new THREE.Clock();
  const easeOutBack = (t) => 1 + 2.2 * Math.pow(t - 1, 3) + 1.2 * Math.pow(t - 1, 2);

  renderer.setAnimationLoop(() => {
    const dt = Math.min(clock.getDelta(), 0.05);
    if (!visible) return;
    const t = clock.elapsedTime;

    // idle-движение, когда мышь не двигается (и на мобильных)
    const idleX = Math.sin(t * 0.6) * 0.25;
    const idleY = Math.sin(t * 0.9) * 0.1;
    const targetX = pointer.active ? pointer.x : idleX;
    const targetY = pointer.active ? pointer.y : idleY;
    smooth.x += (targetX - smooth.x) * Math.min(1, dt * 4);
    smooth.y += (targetY - smooth.y) * Math.min(1, dt * 4);

    pivot.rotation.y = smooth.x * (isModel ? 0.45 : 0.5);
    pivot.rotation.x = smooth.y * (isModel ? 0.12 : 0.25);
    pivot.rotation.z = -smooth.x * 0.05;
    if (body) body.rotation.y = smooth.x * 0.18;
    eyes.forEach(({ look }) => {
      look.rotation.y = smooth.x * 0.3;
      look.rotation.x = smooth.y * 0.22;
    });
    brows.forEach((b) => { b.position.y = 0.42 + Math.max(0, -smooth.y) * 0.05; });

    // моргание
    if (!reduceMotion) {
      nextBlink -= dt;
      if (nextBlink <= 0 && blinkT < 0) { blinkT = 0; nextBlink = 2.5 + Math.random() * 3; }
      if (blinkT >= 0) {
        blinkT += dt;
        const k = blinkT < 0.08 ? 1 - blinkT / 0.08 : Math.min(1, (blinkT - 0.08) / 0.1);
        eyes.forEach(({ eye }) => { eye.scale.y = Math.max(0.08, k); });
        if (blinkT > 0.18) { blinkT = -1; eyes.forEach(({ eye }) => { eye.scale.y = 1; }); }
      }
    }

    // покачивание и появление
    character.position.y = reduceMotion ? 0 : Math.sin(t * 1.3) * size.y * 0.012;
    if (intro < 1) {
      intro = Math.min(1, intro + dt / 1.1);
      const s = 0.6 + 0.4 * easeOutBack(intro);
      character.scale.setScalar(s);
      character.position.y -= (1 - intro) * size.y * 0.25;
    }

    renderer.render(scene, camera);
  });
}

init();
