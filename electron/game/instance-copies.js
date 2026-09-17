const path=require('node:path');
const io=require('./io');
const fs=io.fsp;
async function copyTree(from,to,missing=false){
 const stat=await fs.lstat(from).catch(e=>{if(e.code==='ENOENT')return null;throw e;});
 if(!stat||stat.isSymbolicLink())return;
 if(stat.isDirectory()){await fs.mkdir(to,{recursive:true});for(const name of await fs.readdir(from))await copyTree(path.join(from,name),path.join(to,name),missing);}
 else if(stat.isFile()){await fs.mkdir(path.dirname(to),{recursive:true});try{await fs.copyFile(from,to,missing?require('node:fs').constants.COPYFILE_EXCL:0);}catch(e){if(!missing||e.code!=='EEXIST')throw e;}}
}
async function prepareCopy(profile,activeDirectories){
 const source=path.resolve(profile.settings?.gameDir||io.instance(profile.id));
 const managed=path.resolve(io.instance(profile.id));
 await fs.mkdir(managed,{recursive:true});
 if((await fs.lstat(managed)).isSymbolicLink())throw Error('Managed instance folder is a link');
 const parent=path.resolve(managed,'sessions');await fs.mkdir(parent,{recursive:true});
 if((await fs.lstat(parent)).isSymbolicLink())throw Error('Sessions folder is a link');
 let number=2,dir;do{dir=path.join(parent,'Session '+number++);}while(activeDirectories.has(dir));
 if(path.dirname(dir)!==parent)throw Error('Invalid session folder');
 const st=await fs.lstat(dir).catch(e=>{if(e.code==='ENOENT')return null;throw e;});if(st?.isSymbolicLink())throw Error('Session folder is a link');
 const marker=path.join(dir,'monkey-session.json');
 if(st){const owner=JSON.parse(await fs.readFile(marker,'utf8'));if(owner.profileId!==profile.id)throw Error('Session folder belongs to another profile');}
 await fs.mkdir(dir,{recursive:true});
 // Worlds are deliberately independent; copying a world while it is being
 // written could corrupt it. Reusing this slot preserves its own worlds.
 for(const name of ['config','options.txt','optionsof.txt','optionsshaders.txt','servers.dat','resourcepacks','shaderpacks'])await copyTree(path.join(source,name),path.join(dir,name),true);
 const stage=path.join(dir,'.mods-next'),current=path.join(dir,'mods'),backup=path.join(dir,'.mods-previous');
 for(const owned of [stage,backup]){if(path.dirname(owned)!==dir)throw Error('Invalid staging path');await fs.rm(owned,{recursive:true,force:true});}
 await fs.mkdir(stage,{recursive:true});await copyTree(path.join(source,'mods'),stage);
 let moved=false;try{await fs.rename(current,backup);moved=true;}catch(e){if(e.code!=='ENOENT')throw e;}
 try{await fs.rename(stage,current);}catch(e){if(moved)await fs.rename(backup,current);throw e;}
 await fs.rm(backup,{recursive:true,force:true});
 await fs.writeFile(marker,JSON.stringify({profileId:profile.id,version:profile.version,loader:profile.loader}));
 return {...profile,settings:{...profile.settings,gameDir:dir},sessionName:path.basename(dir)};
}
module.exports={prepareCopy};
