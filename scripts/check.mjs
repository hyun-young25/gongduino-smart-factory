import fs from 'node:fs/promises';
import path from 'node:path';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../dist/',import.meta.url));
for(const name of ['index.html','conveyor.html','factory.html']){
 const html=await fs.readFile(path.join(root,name),'utf8');
 for(const match of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)){
  if(!/\bsrc=/.test(match[1]))new vm.Script(match[2],{filename:name});
 }
 const markup=html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,tag=>tag.slice(0,tag.indexOf('>')+1));
 for(const match of markup.matchAll(/(?:src|href)="([^"#]+)"/g)){
  if(/^(https?:|data:|mailto:)/.test(match[1]))continue;
  await fs.access(path.resolve(root,match[1].split('?')[0]));
 }
}
for(const file of await fs.readdir(root))if(file.endsWith('.js'))new vm.Script(await fs.readFile(path.join(root,file),'utf8'),{filename:file});
const main=await fs.readFile(path.join(root,'index.html'),'utf8');
const conveyor=await fs.readFile(path.join(root,'conveyor.html'),'utf8');
assert.match(main,/<title>공두이노 스마트 팩토리<\/title>/);
assert.match(main,/url: 'conveyor.html'/);
assert.match(conveyor,/class="factory-link" href="\.\/"/);
console.log('Entry pages, local asset references and JavaScript syntax passed.');
