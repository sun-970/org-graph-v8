import * as THREE from "three";
import { OrbitControls } from "https://cdn.jsdelivr.net/gh/sun-970/org-graph-v4@main/vendor/OrbitControls.js";

const PEOPLE = [
  { id: "repo-owner", name: "仓库负责人", role: "路线图与终审", parent: null },
  { id: "issue-researcher", name: "问题研究员", role: "分流与调研", parent: "repo-owner" },
  { id: "release-engineer", name: "发布工程师", role: "版本与清单", parent: "repo-owner" },
  { id: "community-operator", name: "社区运营", role: "社群与活动", parent: "repo-owner" },
  { id: "triage", name: "分流助理", role: "issue 分拣", parent: "issue-researcher" },
  { id: "repro", name: "复现专员", role: "最小复现", parent: "issue-researcher" },
  { id: "brief", name: "摘要写手", role: "调研摘要", parent: "issue-researcher" },
  { id: "changelog", name: "日志编辑", role: "发布说明", parent: "release-engineer" },
  { id: "versioner", name: "版本管家", role: "版本号", parent: "release-engineer" },
  { id: "checklist", name: "发布检查", role: "检查清单", parent: "release-engineer" },
  { id: "moderator", name: "社群管家", role: "日常答疑", parent: "community-operator" },
  { id: "events", name: "活动策划", role: "社区活动", parent: "community-operator" },
  { id: "advocate", name: "布道专员", role: "对外讲解", parent: "community-operator" },
  { id: "docs-ops", name: "文档运营", role: "公开文档", parent: "community-operator" },
  { id: "qa-buddy", name: "质量搭档", role: "交叉验收", parent: "release-engineer" },
  { id: "scout", name: "情报员", role: "竞品跟踪", parent: "issue-researcher" },
];

const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

function hashHue(id) {
  let h = 0;
  for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) % 360;
  return h;
}

function hash01(id) {
  let h = 0;
  for (const ch of id) h = (h * 33 + ch.charCodeAt(0)) % 997;
  return h / 997;
}

function paintPortrait(hue) {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, 256, 256);
  ctx.save();
  ctx.beginPath();
  ctx.arc(128, 128, 118, 0, Math.PI * 2);
  ctx.clip();
  ctx.fillStyle = `hsl(${(hue + 18) % 360}, 32%, 72%)`;
  ctx.fillRect(0, 0, 256, 256);
  ctx.fillStyle = `hsl(${hue}, 45%, 38%)`;
  ctx.beginPath();
  ctx.ellipse(128, 292, 110, 96, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#f0d2bf";
  ctx.beginPath();
  ctx.arc(128, 122, 58, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = `hsl(${(hue + 40) % 360}, 40%, 22%)`;
  ctx.beginPath();
  ctx.ellipse(128, 90, 62, 36, 0, Math.PI, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  ctx.beginPath();
  ctx.arc(128, 128, 118, 0, Math.PI * 2);
  ctx.strokeStyle = "#e8eef6";
  ctx.lineWidth = 10;
  ctx.stroke();
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

const ballVert = `
varying vec3 vWorldPos;
varying vec3 vWorldN;
void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWorldPos = wp.xyz;
  vWorldN = normalize(mat3(modelMatrix) * normal);
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

const ballFrag = `
uniform vec3 ballColor;
uniform sampler2D portrait;
uniform float selected;
varying vec3 vWorldPos;
varying vec3 vWorldN;
void main() {
  vec3 n = normalize(vWorldN);
  vec3 V = normalize(cameraPosition - vWorldPos);
  vec3 up = abs(V.y) < 0.96 ? vec3(0.0, 1.0, 0.0) : vec3(1.0, 0.0, 0.0);
  vec3 T = normalize(cross(up, V));
  vec3 B = cross(V, T);
  vec2 uv = vec2(dot(n, T), dot(n, B));
  float facing = dot(n, V);
  float r = length(uv);
  vec2 texUV = uv * 0.5 + 0.5;
  float mask = smoothstep(0.86, 0.74, r) * smoothstep(0.05, 0.22, facing);
  vec4 port = texture2D(portrait, texUV);
  vec3 keyL = normalize(vec3(0.45, 0.82, 0.35));
  vec3 fillL = normalize(vec3(-0.62, 0.28, -0.35));
  float ndKey = max(dot(n, keyL), 0.0);
  float ndFill = max(dot(n, fillL), 0.0);
  float hemi = n.y * 0.5 + 0.5;
  vec3 lit = ballColor * (0.2 + 0.5 * hemi + 0.85 * ndKey + 0.3 * ndFill);
  vec3 h = normalize(V + keyL);
  float spec = pow(max(dot(n, h), 0.0), 52.0);
  vec3 face = port.rgb * (0.84 + 0.16 * ndKey);
  vec3 col = mix(lit, face, mask * port.a);
  col += vec3(1.0) * spec * mix(0.5, 0.1, mask);
  col += ballColor * selected * 0.18;
  gl_FragColor = vec4(col, 1.0);
}
`;

function makeBallMaterial(color, portrait) {
  return new THREE.ShaderMaterial({
    uniforms: {
      ballColor: { value: color },
      portrait: { value: portrait },
      selected: { value: 0 },
    },
    vertexShader: ballVert,
    fragmentShader: ballFrag,
  });
}

function paintName(name) {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 64;
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, 256, 64);
  ctx.font = "600 28px PingFang SC, Microsoft YaHei, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.lineWidth = 6;
  ctx.strokeStyle = "#041018";
  ctx.strokeText(name, 128, 34);
  ctx.fillStyle = "#d7e4f0";
  ctx.fillText(name, 128, 34);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function layout(people) {
  const byId = new Map(people.map((p) => [p.id, { ...p, children: [] }]));
  for (const p of byId.values()) {
    if (p.parent && byId.has(p.parent)) byId.get(p.parent).children.push(p);
  }
  const root = [...byId.values()].find((p) => !p.parent);
  const pos = new Map();
  pos.set(root.id, new THREE.Vector3(0, 0.8, 0));
  const place = (node, radius, y) => {
    const n = node.children.length;
    node.children.forEach((child, i) => {
      const angle = (i / Math.max(n, 1)) * Math.PI * 2 - Math.PI / 2;
      const origin = pos.get(node.id);
      const here = new THREE.Vector3(
        origin.x + Math.cos(angle) * radius,
        y + Math.sin(i * 1.7) * 0.45,
        origin.z + Math.sin(angle) * radius,
      );
      pos.set(child.id, here);
      place(child, radius * 0.52, y - 1.6);
    });
  };
  place(root, 11.5, 0.2);
  return pos;
}

function radiusOf(person) {
  if (!person.parent) return 1.35;
  const parent = PEOPLE.find((p) => p.id === person.parent);
  return parent?.parent ? 0.68 : 0.95;
}

const stage = document.getElementById("stage");
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(stage.clientWidth, stage.clientHeight);
renderer.setClearColor(0x0b1c2c, 1);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
stage.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0x0b1c2c, 32, 78);
const camera = new THREE.PerspectiveCamera(42, stage.clientWidth / Math.max(stage.clientHeight, 1), 0.1, 200);
camera.position.set(16, 9.5, 20);
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.07;
controls.minDistance = 12;
controls.maxDistance = 56;
controls.maxPolarAngle = Math.PI / 2.05;
controls.target.set(0, -0.4, 0);
let spinning = !reducedMotion;
controls.autoRotate = spinning;
controls.autoRotateSpeed = 0.72;
controls.addEventListener("start", () => {
  /* dragging the view does not restart idle spin */
});

scene.add(new THREE.HemisphereLight(0xc5d6ea, 0x0a1520, 0.7));
const key = new THREE.DirectionalLight(0xfff3e0, 1.7);
key.position.set(12, 18, 10);
key.castShadow = true;
key.shadow.mapSize.set(1024, 1024);
scene.add(key);
const fill = new THREE.DirectionalLight(0x7eabff, 0.55);
fill.position.set(-14, 6, -8);
scene.add(fill);

const world = new THREE.Group();
scene.add(world);
const positions = layout(PEOPLE);
const nodes = [];
const balls = new Map();
const portraits = new Map();

for (const person of PEOPLE) {
  const hue = hashHue(person.id);
  const radius = radiusOf(person);
  const color = new THREE.Color(`hsl(${hue}, 52%, 48%)`);
  const portrait = paintPortrait(hue);
  portraits.set(person.id, portrait);
  const mesh = new THREE.Mesh(
    new THREE.SphereGeometry(radius, 48, 48),
    makeBallMaterial(color, portrait),
  );
  const p = positions.get(person.id);
  mesh.position.copy(p);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.userData = { person, base: p.clone(), phase: hashHue(person.id) / 57, radius };
  world.add(mesh);
  nodes.push(mesh);
  balls.set(person.id, mesh);

  const nameTex = paintName(person.name);
  const nameSprite = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: nameTex,
      transparent: true,
      depthTest: true,
      depthWrite: false,
    }),
  );
  const nameW = Math.max(1.8, person.name.length * 0.38);
  nameSprite.scale.set(nameW, nameW * 0.28, 1);
  nameSprite.renderOrder = 1;
  world.add(nameSprite);
  mesh.userData.nameSprite = nameSprite;
}

const Y_UP = new THREE.Vector3(0, 1, 0);
const links = PEOPLE.filter((p) => p.parent).map((person) => {
  const mesh = new THREE.Mesh(
    new THREE.CylinderGeometry(0.032, 0.032, 1, 8),
    new THREE.MeshStandardMaterial({
      color: 0x9ec4dc,
      emissive: 0x3a6a88,
      emissiveIntensity: 0.28,
      roughness: 0.45,
      metalness: 0.12,
      depthTest: true,
      depthWrite: false,
    }),
  );
  world.add(mesh);
  return { person, mesh };
});

function writeLinks() {
  for (const link of links) {
    const a = balls.get(link.person.parent).position;
    const b = balls.get(link.person.id).position;
    const dir = b.clone().sub(a);
    const len = Math.max(dir.length(), 0.001);
    link.mesh.position.copy(a).add(dir.clone().multiplyScalar(0.5));
    link.mesh.quaternion.setFromUnitVectors(Y_UP, dir.multiplyScalar(1 / len));
    link.mesh.scale.set(1, len, 1);
  }
}

const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
let selected = null;
let fly = null;

function setSpinning(on) {
  spinning = on && !reducedMotion;
  controls.autoRotate = spinning;
  const btn = document.getElementById("spin-btn");
  const hud = document.getElementById("spin-state");
  if (btn) btn.textContent = spinning ? "停止转动" : "继续转动";
  if (hud) hud.textContent = spinning ? "空闲时缓慢转动 · 点空白处可停" : "已停止自转 · 点空白处或按钮可再开";
}

function pick(event) {
  const rect = renderer.domElement.getBoundingClientRect();
  pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
  raycaster.setFromCamera(pointer, camera);
  const hit = raycaster.intersectObjects(nodes, false)[0];
  return hit?.object ?? null;
}

function showCard(person) {
  selected = person;
  const card = document.getElementById("card");
  card.hidden = false;
  document.getElementById("card-name").textContent = person.name;
  document.getElementById("card-role").textContent = person.role;
  document.getElementById("card-parent").textContent = person.parent
    ? `汇报给 ${PEOPLE.find((p) => p.id === person.parent).name}`
    : "企业根";
  const kids = PEOPLE.filter((p) => p.parent === person.id);
  document.getElementById("card-kids").textContent = `${kids.length} 个直属`;
  document.getElementById("card-avatar").src = portraits.get(person.id).image.toDataURL();
  for (const mesh of nodes) {
    const on = mesh.userData.person.id === person.id;
    mesh.material.uniforms.selected.value = on ? 1 : 0;
  }
}

function clearCard() {
  selected = null;
  document.getElementById("card").hidden = true;
  for (const mesh of nodes) mesh.material.uniforms.selected.value = 0;
}

function flyTo(id) {
  const mesh = balls.get(id);
  if (!mesh) return;
  const toTarget = mesh.position.clone();
  const fromTarget = controls.target.clone();
  const fromCam = camera.position.clone();
  const offset = fromCam.clone().sub(fromTarget);
  if (offset.lengthSq() < 0.0001) offset.set(10, 5, 12);
  const dist = Math.max(5.2, mesh.userData.radius * 6.4);
  const toCam = toTarget.clone().add(offset.setLength(dist));
  fly = {
    fromCam,
    toCam,
    fromTarget,
    toTarget,
    start: performance.now(),
    dur: reducedMotion ? 1 : 900,
  };
  controls.enabled = false;
  setSpinning(false);
}

renderer.domElement.addEventListener("pointerdown", (event) => {
  renderer.domElement.dataset.px = String(event.clientX);
  renderer.domElement.dataset.py = String(event.clientY);
});
renderer.domElement.addEventListener("pointerup", (event) => {
  const x = Number(renderer.domElement.dataset.px || 0);
  const y = Number(renderer.domElement.dataset.py || 0);
  if (Math.hypot(event.clientX - x, event.clientY - y) > 6) return;
  const obj = pick(event);
  if (obj) showCard(obj.userData.person);
  else {
    clearCard();
    setSpinning(!spinning);
  }
});

document.getElementById("card-close").onclick = (event) => {
  event.stopPropagation();
  clearCard();
};
document.getElementById("card-focus").onclick = () => selected && flyTo(selected.id);
document.getElementById("spin-btn").onclick = () => setSpinning(!spinning);

const input = document.getElementById("q");
const hits = document.getElementById("hits");
input.addEventListener("input", () => {
  const q = input.value.trim().toLowerCase();
  if (!q) {
    hits.hidden = true;
    hits.innerHTML = "";
    return;
  }
  const found = PEOPLE.filter((p) => p.name.includes(q) || p.id.includes(q) || p.role.includes(q)).slice(0, 8);
  hits.hidden = found.length === 0;
  hits.innerHTML = found
    .map((p) => `<li><button type="button" data-id="${p.id}">${p.name}<br><small>${p.role}</small></button></li>`)
    .join("");
});
hits.addEventListener("click", (event) => {
  const btn = event.target.closest("button");
  if (!btn) return;
  const person = PEOPLE.find((p) => p.id === btn.dataset.id);
  showCard(person);
  flyTo(person.id);
  hits.hidden = true;
});

const clock = new THREE.Clock();
function tick() {
  requestAnimationFrame(tick);
  const t = clock.getElapsedTime();
  if (fly) {
    const u = Math.min(1, (performance.now() - fly.start) / fly.dur);
    const e = u * u * (3 - 2 * u);
    camera.position.lerpVectors(fly.fromCam, fly.toCam, e);
    controls.target.lerpVectors(fly.fromTarget, fly.toTarget, e);
    if (u >= 1) {
      fly = null;
      controls.enabled = true;
    }
  }
  for (const mesh of nodes) {
    const { base, phase, radius, nameSprite } = mesh.userData;
    mesh.position.copy(base);
    if (!reducedMotion) {
      mesh.position.y = base.y + Math.sin(t * 0.85 + phase) * 0.16;
    }
    nameSprite.position.copy(mesh.position);
    nameSprite.position.y -= radius + 0.48;
  }
  writeLinks();
  controls.update();
  renderer.render(scene, camera);
}
writeLinks();
tick();

window.addEventListener("resize", () => {
  const w = stage.clientWidth;
  const h = Math.max(stage.clientHeight, 1);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  renderer.setSize(w, h);
});
