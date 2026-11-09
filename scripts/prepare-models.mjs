import {fileURLToPath} from 'node:url';
import {NodeIO} from '@gltf-transform/core';
import {ALL_EXTENSIONS} from '@gltf-transform/extensions';
import {dedup, flatten, join, prune, weld, quantize, textureCompress, getBounds} from '@gltf-transform/functions';
import sharp from 'sharp';
import fs from 'node:fs';
import path from 'node:path';
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const sourceDir = fileURLToPath(new URL('../model-sources/',import.meta.url));
const outputDir = fileURLToPath(new URL('../dist/models/',import.meta.url));
fs.mkdirSync(outputDir,{recursive:true});
for (const name of ['amr','truck','conveyor']) {
  const doc = await io.read(path.join(sourceDir,`${name}.glb`));
  const root = doc.getRoot();
  const before = {meshes:root.listMeshes().length,bytes:fs.statSync(path.join(sourceDir,`${name}.glb`)).size};
  await doc.transform(dedup(), flatten(), join(), weld(), prune(), textureCompress({encoder:sharp,resize:[512,512],targetFormat:'webp'}), quantize());
  const out = path.join(outputDir,`${name}.glb`);
  await io.write(out,doc);
  console.log(JSON.stringify({name,before,after:{meshes:root.listMeshes().length,bytes:fs.statSync(out).size},bounds:getBounds(root.listScenes()[0]),animations:root.listAnimations().map(a=>a.getName())}));
}
