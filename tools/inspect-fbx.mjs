// Descobre o que tem dentro dos FBX: escala, malhas, materiais, ossos, animações.
//   node tools/inspect-fbx.mjs
import puppeteer from 'puppeteer-core';
import { subirVite, matarVite, esperarVite } from './_servidor.mjs';
import { existsSync } from 'node:fs';

const exe = ['C:/Program Files/Google/Chrome/Application/chrome.exe',
             'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(existsSync);
const PORT = 5197;
const vite = subirVite(PORT);
await esperarVite(PORT);

const browser = await puppeteer.launch({
  executablePath: exe, headless: 'shell',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'],
});
const page = await browser.newPage();
page.on('pageerror', e => console.log('PAGEERROR:', e.message));
page.on('console', m => { if (m.type() === 'error') console.log('CONSOLE:', m.text()); });

await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'networkidle2' });

const info = await page.evaluate(async () => {
  const THREE = await import('/node_modules/three/build/three.module.js');
  const { FBXLoader } = await import('/node_modules/three/examples/jsm/loaders/FBXLoader.js');
  const loader = new FBXLoader();
  const out = {};
  for (const file of ['voxel-character', 'voxel-pistol', 'voxel-shotgun']) {
    try {
      const obj = await loader.loadAsync(`/models/${file}.fbx`);
      const bb = new THREE.Box3().setFromObject(obj);
      const size = bb.getSize(new THREE.Vector3());
      const meshes = [], bones = [], mats = new Set();
      obj.traverse(o => {
        if (o.isMesh || o.isSkinnedMesh) {
          meshes.push({
            name: o.name, skinned: !!o.isSkinnedMesh,
            verts: o.geometry.attributes.position.count,
            tris: (o.geometry.index ? o.geometry.index.count : o.geometry.attributes.position.count) / 3,
            uv: !!o.geometry.attributes.uv,
            groups: o.geometry.groups.length,
          });
          const ms = Array.isArray(o.material) ? o.material : [o.material];
          ms.forEach(mm => mats.add(`${mm.name}|${mm.type}|map:${mm.map ? mm.map.name || 'sim' : 'nao'}`));
        }
        if (o.isBone) bones.push(o.name);
      });
      out[file] = {
        scaleHint: obj.scale.toArray(),
        size: size.toArray().map(v => +v.toFixed(2)),
        min: bb.min.toArray().map(v => +v.toFixed(2)),
        max: bb.max.toArray().map(v => +v.toFixed(2)),
        meshes, boneCount: bones.length, bones: bones.slice(0, 40),
        materials: [...mats],
        animations: obj.animations.map(a => ({
          name: a.name, duration: +a.duration.toFixed(2), tracks: a.tracks.length,
        })),
        children: obj.children.map(c => `${c.name}:${c.type}`),
      };
    } catch (e) {
      out[file] = { erro: e.message };
    }
  }
  return out;
});

console.log(JSON.stringify(info, null, 2));
await browser.close();
matarVite(vite, PORT);
process.exit(0);
