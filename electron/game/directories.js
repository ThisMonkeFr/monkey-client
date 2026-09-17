const path=require('node:path');
const io=require('./io');
const fs=io.fsp;
let isRunning=()=>false;
function configure(check){isRunning=check;}
function safeName(name){
 let value=String(name||'Profile').normalize('NFC').replace(/[<>:"/\\|?*\x00-\x1f]/g,'_').replace(/[. ]+$/g,'').trim().slice(0,64)||'Profile';
 if(/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(value))value='_'+value;
 return value;
}
function child(parent,name){if(!name||path.basename(name)!==name||name==='.'||name==='..'||/[\\/:]/.test(name))throw Error('Invalid instance folder');const target=path.resolve(parent,name);if(path.dirname(target)!==parent)throw Error('Instance folder is outside the managed directory');return target;}
async function reconcile(data,previous){
 if(!Array.isArray(data?.profiles))return {data,rollback:async()=>{}};
 const parent=path.resolve(io.root(),'instances'),moves=[];
 await fs.mkdir(parent,{recursive:true});
 const old=new Map((previous?.profiles||[]).map(p=>[p.id,p]));
 const occupied=new Set((await fs.readdir(parent)).map(n=>n.toLowerCase()));
 const chosen=new Set();
 const rollback=async()=>{for(const [from,to]of moves.reverse())await fs.rename(to,from);io.setProfiles(previous?.profiles||[]);};
 try{
  for(const p of data.profiles){
   if(!/^[a-zA-Z0-9_-]{1,100}$/.test(p.id))throw Error('Invalid profile ID');
   const before=old.get(p.id),original=before?.directoryName||p.directoryName||p.id;
   let name=original;const from=child(parent,original);
   // A live process must keep its current path. Renaming is retried on save.
   if(!p.settings?.gameDir&&!isRunning(p.id)){
    const base=safeName(p.name);name=base;let suffix=2;
    while(chosen.has(name.toLowerCase())||(occupied.has(name.toLowerCase())&&name.toLowerCase()!==original.toLowerCase()))name=base+' ('+(suffix++)+')';
    if(name!==original){
     const stat=await fs.lstat(from).catch(e=>{if(e.code==='ENOENT')return null;throw e;});
     if(stat?.isSymbolicLink())throw Error('Cannot rename a linked instance folder.');
     if(stat){const to=child(parent,name);await fs.rename(from,to);moves.push([from,to]);occupied.delete(original.toLowerCase());occupied.add(name.toLowerCase());}
    }
   }
   child(parent,name);p.directoryName=name;chosen.add(name.toLowerCase());
  }
  return {data,rollback};
 }catch(error){await rollback();throw error;}
}
module.exports={safeName,reconcile,configure};
