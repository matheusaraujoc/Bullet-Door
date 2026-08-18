import * as THREE from 'three';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';
import { clone as skeletonClone } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { asset } from '../core/assets-url.js';

export const CHAR_HEIGHT = 1.8;      // altura desejada do personagem, em metros

// 1x1 transparente
const PIXEL_VAZIO = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAf' +
  'FcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

/**
 * Os arquivos FBX carregam dentro deles os nomes das texturas que o autor
 * usava (pistol.png, outsider.png…), que não vêm no pacote — as paletas certas
 * são aplicadas à mão logo depois de carregar. Sem isto o loader sai pedindo
 * cada um desses nomes e o console do jogador enche de 404 sem consequência.
 */
function gerenciadorSilencioso() {
  const m = new THREE.LoadingManager();
  m.setURLModifier(url =>
    (/\.(png|jpe?g|tga|bmp|tif?f)$/i.test(url) && !url.startsWith('data:')) ? PIXEL_VAZIO : url);
  return m;
}

/**
 * As texturas são paletas de 256x1 (Endesga 32). Filtro Nearest e sem mipmap
 * são obrigatórios: qualquer interpolação mistura cores vizinhas da paleta e
 * o modelo aparece listrado com cores que não existem nele.
 */
function loadPalette(url) {
  const t = new THREE.TextureLoader().load(url);
  t.magFilter = THREE.NearestFilter;
  t.minFilter = THREE.NearestFilter;
  t.generateMipmaps = false;
  t.colorSpace = THREE.SRGBColorSpace;
  t.flipY = false;                   // FBX já vem com UV no sentido do glTF
  return t;
}

/** Troca o Phong do FBX por Lambert e força a textura certa. */
function applyMaterial(root, texture) {
  root.traverse(o => {
    if (!o.isMesh && !o.isSkinnedMesh) return;
    const old = Array.isArray(o.material) ? o.material : [o.material];
    const m = new THREE.MeshLambertMaterial({ map: texture, color: 0xffffff });
    old.forEach(x => x.dispose?.());
    o.material = m;
    o.frustumCulled = false;
  });
}

export class Assets {
  constructor() {
    this.character = null;
    this.pistol = null;
    this.shotgun = null;
    this.charScale = 1;
    this.ready = false;
  }

  async load(onProgress = () => {}) {
    const loader = new FBXLoader(gerenciadorSilencioso());
    let done = 0;
    const tick = o => { onProgress(++done / 3); return o; };

    const [char, pistol, shotgun] = await Promise.all([
      loader.loadAsync(asset('models/voxel-character.fbx')).then(tick),
      loader.loadAsync(asset('models/voxel-pistol.fbx')).then(tick),
      loader.loadAsync(asset('models/voxel-shotgun.fbx')).then(tick),
    ]);

    applyMaterial(char, loadPalette(asset('models/voxel-character-texture.png')));
    for (const clip of char.animations) clip.name = clip.name.replace(/^.*\|/, '');
    this.character = { object: char, animations: char.animations };

    // A escala do FBX vem embutida nos nós, então medir é mais confiável que
    // supor: mede-se um clone de verdade e dali sai o fator para 1,8 m.
    const probe = skeletonClone(char);
    probe.updateWorldMatrix(true, true);
    const h = new THREE.Box3().setFromObject(probe).getSize(new THREE.Vector3()).y;
    this.charScale = h > 0 ? CHAR_HEIGHT / h : 1;
    this.charRawHeight = h;

    this.pistol = this._prepWeapon(pistol, loadPalette(asset('models/pistol-texture.png')));
    this.shotgun = this._prepWeapon(shotgun, loadPalette(asset('models/shotgun-texture.png')));

    this.ready = true;
    return this;
  }

  /**
   * Normaliza a arma. O FBX guarda a peça deitada e deslocada, do jeito que
   * ficava no rig do autor: cano para -X, topo para +Z, cabo em +X descendo.
   * Aqui a origem vai para o CABO (o ponto onde a mão segura) e a orientação
   * é assada na geometria, em duas versões:
   *   - "hand": cano em +Y local, que é a direção para onde o osso da mão
   *     aponta, então encaixa no esqueleto com rotação zero.
   *   - "view": cano em -Z, para a arma em primeira pessoa presa à câmera.
   */
  _prepWeapon(root, texture) {
    applyMaterial(root, texture);
    root.updateWorldMatrix(true, true);
    let mesh = null;
    root.traverse(o => { if (o.isMesh && !mesh) mesh = o; });

    const base = mesh.geometry.clone();
    base.applyMatrix4(mesh.matrixWorld);       // congela a escala do arquivo
    base.computeBoundingBox();

    // o cabo é a parte que desce abaixo do corpo: centroide do terço inferior
    const bb = base.boundingBox;
    const zCut = bb.min.z + (bb.max.z - bb.min.z) * 0.35;
    const pos = base.attributes.position;
    let sx = 0, sz = 0, n = 0;
    for (let i = 0; i < pos.count; i++) {
      const z = pos.getZ(i);
      if (z > zCut) continue;
      sx += pos.getX(i); sz += z; n++;
    }
    const grip = n
      ? { x: sx / n, z: sz / n }
      : { x: bb.getCenter(new THREE.Vector3()).x, z: 0 };
    // O cabo define a origem em X e Z. Y é a espessura da peça e não tem nada
    // a ver com o cabo, então é centrada — sem isso a arma nasce deslocada
    // meio metro para o lado e some da tela.
    const meioY = (bb.min.y + bb.max.y) / 2;
    base.translate(-grip.x, -meioY, -grip.z);

    const size = new THREE.Vector3();
    base.computeBoundingBox();
    base.boundingBox.getSize(size);

    const rot = (xAxis, yAxis, zAxis) => {
      const g = base.clone();
      g.applyMatrix4(new THREE.Matrix4().makeBasis(xAxis, yAxis, zAxis));
      g.computeBoundingBox();
      return g;
    };
    const V = (x, y, z) => new THREE.Vector3(x, y, z);

    return {
      // -X -> +Y (cano na direção do osso), +Z -> +Y do mundo pelo próprio osso
      hand: rot(V(0, -1, 0), V(1, 0, 0), V(0, 0, 1)),
      // -X -> -Z (cano para onde a câmera olha), +Z -> +Y (topo em pé)
      view: rot(V(0, 0, 1), V(1, 0, 0), V(0, 1, 0)),
      material: mesh.material,
      size,
      comprimento: +size.x.toFixed(3),
    };
  }

  /**
   * Encaixa a arma no osso da mão. Os ossos do FBX carregam a escala do
   * arquivo (na casa das centenas), então a escala local da arma tem que
   * desfazer essa acumulação — senão ela aparece do tamanho de um prédio.
   */
  attachWeapon(bone, kind = 'pistol') {
    const gun = this.newWeapon(kind, 'hand');
    bone.updateWorldMatrix(true, false);
    const s = new THREE.Vector3().setFromMatrixScale(bone.matrixWorld);
    gun.scale.setScalar(this.charScale / (s.x || 1));
    bone.add(gun);
    return gun;
  }

  /** @param {'hand'|'view'} fit em que referencial a arma deve vir */
  newWeapon(kind = 'pistol', fit = 'hand') {
    const src = kind === 'shotgun' ? this.shotgun : this.pistol;
    const m = new THREE.Mesh(src[fit], src.material);
    m.frustumCulled = false;
    return m;
  }

  /** Cópia com esqueleto próprio, já na escala do jogo. */
  newCharacter() {
    const object = skeletonClone(this.character.object);
    object.scale.setScalar(this.charScale);
    return { object, animations: this.character.animations };
  }
}
