import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
const sources=JSON.parse(await fs.readFile(new URL('./model-sources.json',import.meta.url),'utf8'));
const root=new URL('../model-sources/',import.meta.url);
await fs.mkdir(root,{recursive:true});
for(const {name,url,sha256} of sources){
 const response=await fetch(url);
 if(!response.ok)throw Error(`${name}: HTTP ${response.status}`);
 const data=Buffer.from(await response.arrayBuffer());
 if(createHash('sha256').update(data).digest('hex')!==sha256)throw Error(`${name}: source checksum mismatch`);
 await fs.writeFile(new URL(`${name}.glb`,root),data);
 console.log(`Downloaded ${name}.glb (${data.length} bytes)`);
}
