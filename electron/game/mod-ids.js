const yauzl=require('yauzl');
function readIds(file){return new Promise(resolve=>{
 const ids=new Set();yauzl.open(file,{lazyEntries:true},(error,zip)=>{
  if(error)return resolve(ids);let ended=false;
  const done=()=>{if(ended)return;ended=true;clearTimeout(timer);zip.close();resolve(ids);};const timer=setTimeout(done,3000);
  zip.on('error',done);zip.on('end',done);
  zip.on('entry',entry=>{
   if(!['fabric.mod.json','META-INF/mods.toml','META-INF/neoforge.mods.toml'].includes(entry.fileName)||entry.uncompressedSize>256*1024){zip.readEntry();return;}
   zip.openReadStream(entry,(err,stream)=>{if(err){done();return;}const chunks=[];let size=0;stream.on('error',done);stream.on('data',data=>{size+=data.length;if(size>256*1024){stream.destroy();done();}else chunks.push(data);});stream.on('end',()=>{try{const text=Buffer.concat(chunks).toString('utf8');if(entry.fileName==='fabric.mod.json'){const j=JSON.parse(text);if(j.id)ids.add(j.id);for(const id of j.provides||[])if(typeof id==='string')ids.add(id);}else for(const block of text.split(/\[\[mods\]\]/).slice(1)){const id=block.split(/\[\[/)[0].match(/^\s*modId\s*=\s*["']([^"']+)["']/m)?.[1];if(id)ids.add(id);}}catch{}done();});});
  });zip.readEntry();
 });
});}
module.exports={readIds};
