const fs=require('fs/promises');
const path=require('path');
async function sync(gameDir,state,uuid,normalizePng=b=>b){
 const dir=path.join(gameDir,'config','monkeyclient');
 await fs.mkdir(dir,{recursive:true});
 const selected=(state?.capes||[]).find(c=>c.id===state.activeCape);
 let cape=null;
 if(selected?.data?.startsWith('data:image/png;base64,')){
  let png=Buffer.from(selected.data.slice('data:image/png;base64,'.length),'base64');
  if(png.length>4*1024*1024||png.length<24||png.subarray(0,8).toString('hex')!=='89504e470d0a1a0a')throw new Error('Selected cape is not a valid PNG');
  png=normalizePng(png);
  await fs.writeFile(path.join(dir,'launcher-cape.png'),png);
  cape='launcher-cape.png';
 }
 const safeTheme={};
 for(const k of ['accent','bg','panel','text','textDim'])if(/^#[0-9a-f]{6}$/i.test(state?.theme?.[k]||''))safeTheme[k]=state.theme[k];
 await fs.writeFile(path.join(dir,'launcher.json'),JSON.stringify({uuid,cape,theme:safeTheme},null,2));
}
module.exports={sync};

