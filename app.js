import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

const $ = (id) => document.getElementById(id);
const numberFormat = new Intl.NumberFormat('zh-CN');
const modes = {
  material: '拖动旋转 · 滚轮缩放 · 右键平移',
  wireframe: '三角形线框 · 观察网格密度与形体分布',
  normal: '视图空间法线 · 颜色随视角变化，辅助观察表面方向',
  uv: 'UV 棋盘 · 观察拉伸与密度；橙红色表示网格缺少 UV'
};
const state = {
  catalog: null, collection: null, asset: null, loadId: 0, model: null,
  group: null, mixer: null, action: null, animations: [], playing: false,
  mode: 'material', originals: new Map(), debugMaterials: [],
  cameraHome: null, stage: null, radius: 1, ready: false, lastFrame: performance.now()
};
let renderer, scene, camera, controls, checkerTexture, environmentTarget;
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

function setLoad(title, message, error = false) {
  $('load-state').hidden = false;
  if ($('fallback-preview')) $('fallback-preview').hidden = !error;
  $('load-state').classList.toggle('error', error);
  $('load-title').textContent = title;
  $('load-message').textContent = message;
  $('retry-load').hidden = !error;
  $('live-dot').classList.remove('ready');
  $('viewer-state').textContent = error ? '加载未完成' : '加载中';
}

function setReady() {
  $('load-state').hidden = true;
  if ($('fallback-preview')) $('fallback-preview').hidden = true;
  $('live-dot').classList.add('ready');
  $('viewer-state').textContent = '可交互 · 3D';
}

function makeChecker() {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 1024;
  const ctx = canvas.getContext('2d');
  const cells = 8;
  const step = canvas.width / cells;
  for (let y = 0; y < cells; y++) {
    for (let x = 0; x < cells; x++) {
      ctx.fillStyle = (x + y) % 2 === 0 ? '#e6e4d8' : '#275067';
      ctx.fillRect(x * step, y * step, step, step);
      ctx.strokeStyle = '#bb825b';
      ctx.lineWidth = 2;
      ctx.strokeRect(x * step + 1, y * step + 1, step - 2, step - 2);
      ctx.fillStyle = (x + y) % 2 === 0 ? '#294c5d' : '#e6e4d8';
      ctx.font = 'bold 32px monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(`${String.fromCharCode(65 + y)}${x + 1}`, x * step + step / 2, y * step + step / 2);
    }
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.anisotropy = Math.min(renderer.capabilities.getMaxAnisotropy(), 8);
  return texture;
}

function setupViewer() {
  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.setClearColor(0x000000, 0);
  renderer.domElement.setAttribute('aria-hidden', 'true');
  $('canvas-host').append(renderer.domElement);

  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(38, 1, 0.01, 1000);
  camera.position.set(4, 2, 6);
  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = !reducedMotion.matches;
  controls.dampingFactor = 0.075;
  controls.autoRotate = false;
  controls.autoRotateSpeed = 0.65;
  controls.maxPolarAngle = Math.PI * 0.92;
  controls.screenSpacePanning = true;
  scene.add(new THREE.HemisphereLight(0xdcebf7, 0x32495a, 0.9));
  const key = new THREE.DirectionalLight(0xffe8cf, 2.0);
  key.position.set(5, 8, 5);
  scene.add(key);
  const rim = new THREE.DirectionalLight(0x9bc7e8, 1.5);
  rim.position.set(-6, 4, -4);
  scene.add(rim);
  const fill = new THREE.DirectionalLight(0xb2cbdd, 0.65);
  fill.position.set(-4, 1, 5);
  scene.add(fill);
  const pmrem = new THREE.PMREMGenerator(renderer);
  const room = new RoomEnvironment();
  environmentTarget = pmrem.fromScene(room, 0.04);
  scene.environment = environmentTarget.texture;
  scene.environmentIntensity = 0.6;
  room.dispose();
  pmrem.dispose();
  checkerTexture = makeChecker();

  const resize = () => {
    const bounds = $('canvas-host').getBoundingClientRect();
    const width = Math.max(1, bounds.width), height = Math.max(1, bounds.height);
    renderer.setSize(width, height);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
  };
  new ResizeObserver(resize).observe($('canvas-host'));
  resize();
  renderer.domElement.addEventListener('webglcontextlost', (event) => {
    event.preventDefault();
    state.ready = false;
    setLoad('图形上下文已中断', '请刷新页面恢复模型。如果问题重复出现，请关闭其他占用显卡的页面。', true);
  });
  renderer.domElement.addEventListener('webglcontextrestored', () => window.location.reload());
  renderer.setAnimationLoop(render);
}

function render(now) {
  const delta = Math.min(Math.max((now - state.lastFrame) / 1000, 0), 0.06);
  state.lastFrame = now;
  if (document.hidden) return;
  controls.update(delta);
  if (state.mixer && state.playing) state.mixer.update(delta);
  if (state.action && state.animations.length) {
    const duration = state.action.getClip().duration;
    const time = state.action.time;
    $('animation-progress').value = duration > 0 ? String(Math.round(time / duration * 1000)) : '0';
    $('animation-time').textContent = `${time.toFixed(1)} / ${duration.toFixed(1)} s`;
  }
  renderer.render(scene, camera);
}

function disposeObject(object, disposeTextures = true) {
  const geometries = new Set(), materials = new Set(), textures = new Set();
  object.traverse((node) => {
    if (node.geometry) geometries.add(node.geometry);
    const list = node.material ? (Array.isArray(node.material) ? node.material : [node.material]) : [];
    for (const material of list) {
      materials.add(material);
      if (disposeTextures) for (const value of Object.values(material)) {
        if (value?.isTexture && value !== checkerTexture && value !== environmentTarget?.texture) textures.add(value);
      }
    }
    if (node.skeleton) node.skeleton.dispose();
  });
  geometries.forEach((item) => item.dispose());
  materials.forEach((item) => item.dispose());
  textures.forEach((item) => item.dispose());
}

function clearModel() {
  state.ready = false;
  if (state.mixer) {
    state.mixer.stopAllAction();
    state.mixer.uncacheRoot(state.model);
  }
  state.mixer = null;
  state.action = null;
  state.animations = [];
  state.playing = false;
  $('animation-bar').hidden = true;
  for (const [mesh, material] of state.originals) mesh.material = material;
  state.debugMaterials.forEach((material) => material.dispose());
  state.debugMaterials = [];
  state.originals.clear();
  if (state.group) {
    scene.remove(state.group);
    disposeObject(state.group);
  }
  if (state.stage) {
    scene.remove(state.stage);
    disposeObject(state.stage, false);
  }
  state.group = state.model = state.stage = null;
}

function makeStage(size, groundY) {
  const group = new THREE.Group();
  const grid = new THREE.GridHelper(size * 3.6, 24, 0x7895a5, 0x527487);
  grid.position.y = groundY - size * 0.005;
  grid.material.transparent = true;
  grid.material.opacity = 0.17;
  group.add(grid);
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(size * 0.61, size * 0.614, 100),
    new THREE.MeshBasicMaterial({ color: 0xc3946c, side: THREE.DoubleSide, transparent: true, opacity: 0.26, depthWrite: false })
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = groundY - size * 0.004;
  group.add(ring);
  scene.add(group);
  state.stage = group;
}

function frameModel(asset) {
  state.model.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(state.model);
  if (box.isEmpty()) throw new Error('模型不含可显示的几何体。');
  const center = box.getCenter(new THREE.Vector3());
  const size = box.getSize(new THREE.Vector3());
  const radius = Math.max(size.length() * 0.5, 0.01);
  state.radius = radius;
  state.group.position.copy(center).negate();
  const verticalFov = THREE.MathUtils.degToRad(camera.fov);
  const horizontalFov = 2 * Math.atan(Math.tan(verticalFov / 2) * camera.aspect);
  const angle = Math.min(verticalFov, horizontalFov);
  const distance = radius / Math.sin(angle / 2) * 1.2;
  const azimuth = THREE.MathUtils.degToRad(asset.camera?.azimuth ?? 36);
  const elevation = THREE.MathUtils.degToRad(asset.camera?.elevation ?? 20);
  camera.position.set(distance * Math.cos(elevation) * Math.sin(azimuth), distance * Math.sin(elevation), distance * Math.cos(elevation) * Math.cos(azimuth));
  camera.near = radius / 100;
  camera.far = radius * 100;
  camera.updateProjectionMatrix();
  controls.target.set(0, -size.y * 0.025, 0);
  controls.minDistance = radius * 0.35;
  controls.maxDistance = radius * 15;
  controls.update();
  state.cameraHome = { position: camera.position.clone(), target: controls.target.clone() };
  makeStage(Math.max(size.x, size.y, size.z), box.min.y - center.y);
}

function setMode(mode) {
  state.mode = mode;
  document.querySelectorAll('[data-mode]').forEach((button) => button.setAttribute('aria-pressed', String(button.dataset.mode === mode)));
  $('mode-help').textContent = modes[mode];
  for (const [mesh, original] of state.originals) mesh.material = original;
  state.debugMaterials.forEach((material) => material.dispose());
  state.debugMaterials = [];
  if (!state.model || mode === 'material') return;
  for (const [mesh] of state.originals) {
    let material;
    if (mode === 'wireframe') {
      material = new THREE.MeshBasicMaterial({ color: 0xe9b78c, wireframe: true, transparent: true, opacity: 0.85, side: THREE.DoubleSide });
    } else if (mode === 'normal') {
      material = new THREE.MeshNormalMaterial({ side: THREE.DoubleSide });
    } else {
      material = mesh.geometry.getAttribute('uv')
        ? new THREE.MeshBasicMaterial({ map: checkerTexture, side: THREE.DoubleSide, toneMapped: false })
        : new THREE.MeshBasicMaterial({ color: 0xc56545, side: THREE.DoubleSide, toneMapped: false });
    }
    mesh.material = material;
    state.debugMaterials.push(material);
  }
}

function resetView() {
  if (!state.cameraHome) return;
  camera.position.copy(state.cameraHome.position);
  controls.target.copy(state.cameraHome.target);
  controls.update();
}

function setDownload(id, path) {
  const link = $(id);
  if (path && typeof path === 'string') {
    link.href = path;
    link.setAttribute('aria-disabled', 'false');
    link.removeAttribute('tabindex');
  } else {
    link.removeAttribute('href');
    link.setAttribute('aria-disabled', 'true');
    link.setAttribute('tabindex', '-1');
  }
}

function stat(label, value, suffix = '') {
  const wrapper = document.createElement('div');
  wrapper.className = 'asset-stat';
  const dt = document.createElement('dt');
  dt.textContent = label;
  const dd = document.createElement('dd');
  dd.textContent = typeof value === 'number' && Number.isFinite(value) ? numberFormat.format(value) : '—';
  if (suffix) {
    const unit = document.createElement('small');
    unit.textContent = suffix;
    dd.append(unit);
  }
  wrapper.append(dt, dd);
  return wrapper;
}

function updateInspector(asset) {
  $('asset-title').textContent = asset.title;
  $('asset-subtitle').textContent = asset.subtitle || 'ASSET STUDY';
  $('asset-purpose').textContent = asset.purpose || '';
  const stats = asset.stats || {};
  $('asset-stats').replaceChildren(stat('三角面', stats.triangles), stat('材质', stats.materials), stat('网格', stats.meshes), stat('动画', stats.animations));
  $('quality-summary').textContent = asset.quality?.summary || '';
  const checks = [];
  for (const item of asset.quality?.checks || []) {
    const li = document.createElement('li');
    const label = document.createElement('span');
    label.textContent = item.label;
    const value = document.createElement('span');
    value.className = `check-value ${['note', 'issue'].includes(item.state) ? item.state : ''}`;
    value.textContent = item.value;
    li.append(label, value);
    checks.push(li);
  }
  $('quality-checks').replaceChildren(...checks);
  const notes = [];
  for (const note of asset.quality?.notes || []) {
    const li = document.createElement('li');
    li.textContent = note;
    notes.push(li);
  }
  $('quality-notes').replaceChildren(...notes);
  $('quality-details').hidden = notes.length === 0;
  $('quality-details').open = false;
  setDownload('download-blend', asset.blend);
  setDownload('download-glb', asset.glb);
  if ($('asset-evidence')) {
    $('asset-evidence').href = asset.evidenceUrl || 'review.html#production';
    $('asset-evidence').textContent = asset.evidenceLabel || '查看制作与技术说明 ↗';
  }
  if ($('fallback-preview') && asset.thumbnail) {
    $('fallback-preview').src = asset.thumbnail;
    $('fallback-preview').alt = `${asset.title}静态预览`;
  }
  $('canvas-host').setAttribute('aria-label', `${asset.title}，三维模型；拖动旋转，滚轮缩放，右键平移；方向键旋转，加减键缩放，R 重置`);
}

function setupAnimations(clips) {
  state.animations = clips;
  $('animation-select').replaceChildren();
  $('animation-bar').hidden = clips.length === 0;
  if (!clips.length) return;
  state.mixer = new THREE.AnimationMixer(state.model);
  clips.forEach((clip, index) => {
    const option = document.createElement('option');
    option.value = String(index);
    option.textContent = clip.name || `动画 ${index + 1}`;
    $('animation-select').append(option);
  });
  chooseAnimation(0);
}

function chooseAnimation(index) {
  if (!state.mixer || !state.animations[index]) return;
  state.mixer.stopAllAction();
  state.action = state.mixer.clipAction(state.animations[index]);
  state.action.reset().play();
  state.mixer.update(0);
  state.playing = false;
  $('animation-toggle').textContent = '播放';
  $('animation-toggle').setAttribute('aria-label', '播放动画');
}

async function selectAsset(asset) {
  const loadId = ++state.loadId;
  state.asset = asset;
  const shareUrl = new URL(window.location.href);
  shareUrl.searchParams.set('asset', asset.id);
  history.replaceState(null, '', shareUrl);
  updateInspector(asset);
  document.querySelectorAll('.asset-tile').forEach((tile) => tile.setAttribute('aria-pressed', String(tile.dataset.assetId === asset.id)));
  const collection = state.catalog.collections.find((item) => item.id === asset.collection);
  $('asset-series').textContent = collection?.eyebrow || collection?.title || '';
  clearModel();
  setLoad(`正在加载${asset.title}`, '读取模型、材质与动画');
  if (!asset.glb) {
    setLoad('模型文件尚未接入', '这个条目还没有 GLB 文件。请接入模型后重新加载，或选择其他作品。', true);
    return;
  }
  try {
    const gltf = await new GLTFLoader().loadAsync(asset.glb, (progress) => {
      if (loadId !== state.loadId || !progress.total) return;
      $('load-message').textContent = `模型已读取 ${Math.round(progress.loaded / progress.total * 100)}%`;
    });
    if (loadId !== state.loadId) {
      disposeObject(gltf.scene);
      return;
    }
    state.model = gltf.scene;
    state.group = new THREE.Group();
    state.group.add(state.model);
    scene.add(state.group);
    state.model.traverse((node) => {
      if (node.isMesh) {
        state.originals.set(node, node.material);
        node.frustumCulled = false;
      }
    });
    frameModel(asset);
    setupAnimations(gltf.animations || []);
    setMode(state.mode);
    await renderer.compileAsync(scene, camera);
    if (loadId !== state.loadId) return;
    state.ready = true;
    setReady();
  } catch (error) {
    if (loadId !== state.loadId) return;
    clearModel();
    const detail = error instanceof Error ? error.message : String(error);
    console.error('模型加载失败', asset.id, detail);
    setLoad('模型未能加载', '请重试或选择其他作品；也可通过上方 PDF 与技术案例查看静态图和检查证据。', true);
  }
}

function renderAssetRail(assets) {
  const tiles = assets.map((asset) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'asset-tile';
    button.dataset.assetId = asset.id;
    button.setAttribute('aria-pressed', 'false');
    button.setAttribute('aria-label', `查看${asset.title}`);
    const preview = document.createElement('div');
    preview.className = 'asset-preview';
    const placeholder = document.createElement('span');
    placeholder.className = 'asset-placeholder';
    placeholder.textContent = asset.subtitle?.split(' ')[0]?.slice(0, 3) || '3D';
    preview.append(placeholder);
    if (asset.thumbnail) {
      const image = document.createElement('img');
      image.alt = '';
      image.loading = 'lazy';
      image.src = asset.thumbnail;
      image.addEventListener('load', () => placeholder.remove(), { once: true });
      image.addEventListener('error', () => image.remove(), { once: true });
      preview.append(image);
    }
    const check = document.createElement('span');
    check.className = 'tile-selected';
    check.textContent = '✓';
    check.setAttribute('aria-hidden', 'true');
    preview.append(check);
    const title = document.createElement('h3');
    title.textContent = asset.title;
    const meta = document.createElement('p');
    const triangles = asset.stats?.triangles;
    meta.textContent = typeof triangles === 'number' ? `${numberFormat.format(triangles)} TRIANGLES` : '3D ASSET STUDY';
    button.append(preview, title, meta);
    button.addEventListener('click', () => selectAsset(asset));
    return button;
  });
  $('asset-rail').replaceChildren(...tiles);
  const counts = { asset: 0, lod: 0, scene: 0, other: 0 };
  for (const asset of assets) {
    const kind = ['asset', 'lod', 'scene'].includes(asset.kind) ? asset.kind : 'other';
    counts[kind]++;
  }
  const summary = [
    counts.asset ? `${counts.asset} 项资产` : '',
    counts.lod ? `${counts.lod} 个 LOD` : '',
    counts.scene ? `${counts.scene} 个场景` : '',
    counts.other ? `${counts.other} 项内容` : ''
  ].filter(Boolean);
  $('asset-count').textContent = summary.join(' · ') || '暂无内容';
}

function selectCollection(collectionId, preferredAssetId = null) {
  const collection = state.catalog.collections.find((item) => item.id === collectionId);
  if (!collection) return;
  state.collection = collection;
  document.querySelectorAll('.collection-tab').forEach((tab) => {
    const active = tab.dataset.collectionId === collectionId;
    tab.setAttribute('aria-selected', String(active));
    tab.tabIndex = active ? 0 : -1;
  });
  $('collection-status').textContent = collection.status || '当前 3D 原型';
  $('collection-description').textContent = collection.description || collection.title;
  const assets = state.catalog.assets.filter((asset) => asset.collection === collectionId);
  renderAssetRail(assets);
  const asset = assets.find((item) => item.id === preferredAssetId) || assets[0];
  if (asset) selectAsset(asset);
  else {
    ++state.loadId;
    clearModel();
    updateInspector({ title: '这个系列尚未添加作品', quality: {}, stats: {} });
    setLoad('系列中暂无模型', '选择其他系列继续浏览。', false);
  }
}

function renderCollections() {
  const tabs = state.catalog.collections.map((collection) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'collection-tab';
    button.dataset.collectionId = collection.id;
    button.setAttribute('role', 'tab');
    button.setAttribute('aria-controls', 'viewer');
    button.setAttribute('aria-selected', 'false');
    button.tabIndex = -1;
    button.textContent = collection.title;
    const count = document.createElement('span');
    count.className = 'collection-tab-count';
    count.textContent = `${state.catalog.assets.filter((asset) => asset.collection === collection.id).length} 项内容`;
    button.append(count);
    button.addEventListener('click', () => selectCollection(collection.id));
    return button;
  });
  $('collection-tabs').replaceChildren(...tabs);
  $('collection-tabs').addEventListener('keydown', (event) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const current = tabs.findIndex((tab) => tab === document.activeElement);
    const index = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : (current + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
    tabs[index].focus();
    selectCollection(tabs[index].dataset.collectionId);
  });
}

function bindControls() {
  document.querySelectorAll('[data-mode]').forEach((button) => button.addEventListener('click', () => setMode(button.dataset.mode)));
  $('reset-view').addEventListener('click', resetView);
  $('auto-rotate').addEventListener('click', () => {
    controls.autoRotate = !controls.autoRotate;
    $('auto-rotate').setAttribute('aria-pressed', String(controls.autoRotate));
  });
  $('fullscreen').addEventListener('click', async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else if ($('viewer').requestFullscreen) await $('viewer').requestFullscreen();
    } catch {
      $('mode-help').textContent = '浏览器未允许全屏；仍可在当前画布中查看模型。';
    }
  });
  if (!document.fullscreenEnabled) $('fullscreen').hidden = true;
  $('retry-load').addEventListener('click', () => {
    if (state.asset && renderer) selectAsset(state.asset);
    else window.location.reload();
  });
  $('animation-select').addEventListener('change', (event) => chooseAnimation(Number(event.target.value)));
  $('animation-toggle').addEventListener('click', () => {
    state.playing = !state.playing;
    $('animation-toggle').textContent = state.playing ? '暂停' : '播放';
    $('animation-toggle').setAttribute('aria-label', state.playing ? '暂停动画' : '播放动画');
  });
  $('animation-progress').addEventListener('input', (event) => {
    if (!state.action || !state.mixer) return;
    state.action.time = Number(event.target.value) / 1000 * state.action.getClip().duration;
    state.mixer.update(0);
  });
  $('canvas-host').addEventListener('keydown', (event) => {
    if (!state.ready) return;
    if (event.key.toLowerCase() === 'r') { event.preventDefault(); resetView(); return; }
    if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', '+', '=', '-', '_'].includes(event.key)) return;
    event.preventDefault();
    const offset = camera.position.clone().sub(controls.target);
    const spherical = new THREE.Spherical().setFromVector3(offset);
    if (event.key === 'ArrowLeft') spherical.theta -= 0.12;
    if (event.key === 'ArrowRight') spherical.theta += 0.12;
    if (event.key === 'ArrowUp') spherical.phi -= 0.12;
    if (event.key === 'ArrowDown') spherical.phi += 0.12;
    if (event.key === '+' || event.key === '=') spherical.radius *= 0.9;
    if (event.key === '-' || event.key === '_') spherical.radius *= 1.1;
    spherical.phi = THREE.MathUtils.clamp(spherical.phi, 0.05, controls.maxPolarAngle);
    spherical.radius = THREE.MathUtils.clamp(spherical.radius, controls.minDistance, controls.maxDistance);
    camera.position.copy(controls.target).add(new THREE.Vector3().setFromSpherical(spherical));
    controls.update();
  });
}

async function init() {
  if (window.location.protocol === 'file:') {
    setLoad('请通过本地服务打开', '浏览器无法直接读取本地模型。请按目录中的“本地启动说明.txt”启动，再访问 http://127.0.0.1:8765。', true);
    return;
  }
  try {
    setupViewer();
    bindControls();
  } catch (error) {
    console.error('三维画布初始化失败', error);
    setLoad('无法启动三维画布', '当前浏览器未能启动 WebGL 2。可查看静态预览、上方 PDF 和技术案例，或开启硬件加速后重试。', true);
    $('retry-load').onclick = () => window.location.reload();
    return;
  }
  try {
    const response = await fetch('./assets/catalog.json', { cache: 'no-cache' });
    if (!response.ok) throw new Error(`作品目录响应 ${response.status}`);
    const catalog = await response.json();
    if (catalog.schemaVersion !== 1 || !Array.isArray(catalog.collections) || !Array.isArray(catalog.assets) || !catalog.collections.length) throw new Error('作品目录格式不正确');
    state.catalog = catalog;
    renderCollections();
    const initialCollection = catalog.collections.find((collection) => collection.id === catalog.defaultCollection) || catalog.collections[0];
    const requestedId = new URL(window.location.href).searchParams.get('asset');
    const requestedAsset = catalog.assets.find((item) => item.id === requestedId);
    selectCollection(requestedAsset?.collection || initialCollection.id, requestedAsset?.id || catalog.defaultAsset);
  } catch (error) {
    console.error('作品目录加载失败', error);
    setLoad('作品目录未能读取', '请确认 assets/catalog.json 存在且内容完整，然后重新加载页面。', true);
  }
}

init();
