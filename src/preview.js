// Página de inspeção dos modelos: orientação, escala, encaixe da arma e
// todas as animações do FBX.  Abra /preview.html com o servidor rodando.
import * as THREE from 'three';
import { Assets } from './entities/Assets.js';

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(innerWidth, innerHeight);
renderer.setClearColor(0x262b44);
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.add(new THREE.HemisphereLight(0xffffff, 0x3a4466, 1.5));
const sun = new THREE.DirectionalLight(0xffffff, 1.1);
sun.position.set(1, 2, 1.5);
scene.add(sun);
scene.add(new THREE.GridHelper(6, 6, 0xff0044, 0x5a6988));
scene.add(new THREE.AxesHelper(1.5));            // X vermelho · Y verde · Z azul

const camera = new THREE.PerspectiveCamera(40, innerWidth / innerHeight, 0.1, 60);

const assets = new Assets();
const state = { mixer: null, action: null, object: null, gun: null, holder: null };

await assets.load();

const { object, animations } = assets.newCharacter();
scene.add(object);
state.object = object;
state.mixer = new THREE.AnimationMixer(object);

object.traverse(o => {
  if (o.name === 'weaponHolderR') state.holder = o;
});
const box = new THREE.Box3().setFromObject(object);   // mede antes de pendurar a arma
state.gun = state.holder ? assets.attachWeapon(state.holder, 'pistol') : null;
const size = box.getSize(new THREE.Vector3());

document.getElementById('info').textContent =
  `escala: ${assets.charScale.toFixed(5)} (altura crua ${assets.charRawHeight.toFixed(1)})\n` +
  `altura final: ${size.y.toFixed(2)} m\n` +
  `caixa: ${box.min.toArray().map(v => v.toFixed(2))} .. ${box.max.toArray().map(v => v.toFixed(2))}\n` +
  `osso da mão: ${state.holder ? 'weaponHolderR' : 'NÃO ENCONTRADO'}\n` +
  `pistola (bruto): ${assets.pistol.size.toArray().map(v => v.toFixed(0))}\n` +
  `animações: ${animations.length}`;

const bar = document.getElementById('anims');
for (const clip of animations) {
  const b = document.createElement('button');
  b.textContent = clip.name;
  b.onclick = () => {
    state.mixer.stopAllAction();
    state.action = state.mixer.clipAction(clip);
    state.action.play();
    [...bar.children].forEach(c => c.classList.remove('on'));
    b.classList.add('on');
  };
  bar.appendChild(b);
}
bar.querySelector('button')?.click();

// órbita simples com o mouse
let ang = 0.6, elev = 1.1, dist = 4, drag = false, lx = 0, ly = 0;
addEventListener('mousedown', e => { drag = true; lx = e.clientX; ly = e.clientY; });
addEventListener('mouseup', () => { drag = false; });
addEventListener('mousemove', e => {
  if (!drag) return;
  ang -= (e.clientX - lx) * 0.01;
  elev = Math.max(0.1, Math.min(3.2, elev + (e.clientY - ly) * 0.01));
  lx = e.clientX; ly = e.clientY;
});
addEventListener('wheel', e => { dist = Math.max(1.5, Math.min(12, dist + e.deltaY * 0.002)); });
addEventListener('resize', () => {
  renderer.setSize(innerWidth, innerHeight);
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
});

// controle usado pelos testes automatizados
window.preview = {
  assets, state, scene, camera, renderer, THREE,
  play(name) { bar.querySelectorAll('button').forEach(b => { if (b.textContent === name) b.click(); }); },
  view(x, y, z, lookY = 0.9) {
    camera.position.set(x, y, z);
    camera.lookAt(0, lookY, 0);
    renderer.render(scene, camera);
  },
  step(dt) { state.mixer.update(dt); },
  /** Ajuste fino do encaixe da arma, usado pelos scripts de calibragem. */
  setGun({ px = 0, py = 0, pz = 0, rx = 0, ry = 0, rz = 0, s = null } = {}) {
    if (!state.gun) return;
    state.gun.position.set(px, py, pz);
    state.gun.rotation.set(rx, ry, rz);
    if (s !== null) state.gun.scale.setScalar(s);
  },
  /** Foco na mão que segura a arma. */
  closeUp(dist = 1.1) {
    state.holder.updateWorldMatrix(true, false);
    const h = state.holder.getWorldPosition(new THREE.Vector3());
    camera.position.set(h.x - dist, h.y + dist * 0.45, h.z + dist);
    camera.lookAt(h);
    renderer.render(scene, camera);
    return h.toArray().map(v => +v.toFixed(3));
  },
  /** Congela a órbita automática: sem isso o loop sobrescreve a câmera. */
  freeze() { renderer.setAnimationLoop(null); },
  /** Esconde a interface da página para capturas limpas. */
  chrome(on) {
    document.getElementById('info').style.display = on ? '' : 'none';
    document.getElementById('anims').style.display = on ? '' : 'none';
  },
  /**
   * Modo "só a arma": tira o personagem da frente e mostra a pistola sozinha
   * na origem, com os eixos, para ler a orientação nativa dela.
   */
  soloWeapon(kind = 'pistol', dist = 1.2) {
    state.object.visible = false;
    if (!state.solo) {
      state.solo = assets.newWeapon(kind, 'view');
      state.solo.scale.setScalar(assets.charScale);
      scene.add(state.solo);
    }
    state.solo.visible = true;
    camera.position.set(dist, dist * 0.7, dist);
    camera.lookAt(0, 0, 0);
    renderer.render(scene, camera);
    const b = new THREE.Box3().setFromObject(state.solo).getSize(new THREE.Vector3());
    return b.toArray().map(v => +v.toFixed(3));
  },
  soloOff() {
    if (state.solo) state.solo.visible = false;
    state.object.visible = true;
  },
  /** Enquadra a câmera exatamente na arma, para ver o encaixe de perto. */
  frameGun(from = [1, 0.6, 1], pad = 2.4) {
    state.object.updateWorldMatrix(true, true);
    const b = new THREE.Box3().setFromObject(state.gun);
    const c = b.getCenter(new THREE.Vector3());
    const r = b.getSize(new THREE.Vector3()).length() * pad;
    const d = new THREE.Vector3(...from).normalize().multiplyScalar(r);
    camera.position.copy(c).add(d);
    camera.lookAt(c);
    renderer.render(scene, camera);
    const hand = state.holder.getWorldPosition(new THREE.Vector3());
    return {
      armaCentro: c.toArray().map(v => +v.toFixed(3)),
      armaTam: b.getSize(new THREE.Vector3()).toArray().map(v => +v.toFixed(3)),
      mao: hand.toArray().map(v => +v.toFixed(3)),
      distanciaCentroMao: +c.distanceTo(hand).toFixed(3),
    };
  },
  /**
   * Perfil da geometria da arma: fatia ao longo de X e mede a altura (Z) e a
   * espessura (Y) de cada fatia. O cano é a parte fina e comprida; o cabo é
   * onde a peça desce. Isso identifica frente e cabo sem chutar rotações.
   */
  gunProfile(kind = 'pistol') {
    const src = kind === 'shotgun' ? assets.shotgun : assets.pistol;
    const pos = src.hand.attributes.position;
    const bb = src.hand.boundingBox;
    const N = 11;
    const minX = bb.min.x, spanX = bb.max.x - minX;
    const slices = Array.from({ length: N }, () => ({ zmin: 1e9, zmax: -1e9, ymin: 1e9, ymax: -1e9, n: 0 }));
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
      const k = Math.min(N - 1, Math.floor(((x - minX) / spanX) * N));
      const s = slices[k];
      s.zmin = Math.min(s.zmin, z); s.zmax = Math.max(s.zmax, z);
      s.ymin = Math.min(s.ymin, y); s.ymax = Math.max(s.ymax, y);
      s.n++;
    }
    return {
      caixa: [bb.min.toArray().map(v => +v.toFixed(1)), bb.max.toArray().map(v => +v.toFixed(1))],
      fatias: slices.map((s, k) => ({
        x: +(minX + spanX * (k + 0.5) / N).toFixed(1),
        alturaZ: s.n ? +(s.zmax - s.zmin).toFixed(1) : 0,
        zmin: s.n ? +s.zmin.toFixed(1) : null,
        zmax: s.n ? +s.zmax.toFixed(1) : null,
        larguraY: s.n ? +(s.ymax - s.ymin).toFixed(1) : 0,
      })),
    };
  },
  gunInfo() {
    const s = new THREE.Vector3().setFromMatrixScale(state.gun.matrixWorld);
    const b = new THREE.Box3().setFromObject(state.gun).getSize(new THREE.Vector3());
    return { escalaMundo: +s.x.toFixed(5), tamanhoMundo: b.toArray().map(v => +v.toFixed(3)) };
  },
};

const clock = new THREE.Clock();
renderer.setAnimationLoop(() => {
  const dt = clock.getDelta();
  state.mixer.update(dt);
  camera.position.set(Math.sin(ang) * dist, elev, Math.cos(ang) * dist);
  camera.lookAt(0, 0.9, 0);
  renderer.render(scene, camera);
});
