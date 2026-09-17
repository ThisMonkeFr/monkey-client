/* Isolated Linux/virtual-display release check. Never uses a player's data. */
const fs=require('node:fs'),fsp=require('node:fs/promises'),path=require('node:path'),cp=require('node:child_process');
const root=path.resolve('build/runtime'),version=process.argv[2],loader=process.argv[3];
require.cache[require.resolve('electron')]={exports:{app:{getPath:()=>root}}};
const game=require('../electron/game/launch'),clientmod=require('../electron/game/clientmod');
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function main(){
 if(!version||!['fabric','forge'].includes(loader))throw Error('Expected Minecraft version and loader');
 const id=version+'-'+loader,dir=path.join(root,'instances',id);await fsp.mkdir(dir,{recursive:true});
 const profile={id,name:'Release verification',version,loader,mods:[],settings:{ram:2048,width:854,height:480}};
 await fsp.writeFile(path.join(dir,'options.txt'),'soundCategory_music:0.0\nmaxFps:30\nrenderDistance:4\nsimulationDistance:5\n');
 let last='';const progress=p=>{if(last!==p.stage){last=p.stage;console.log(p.stage,p.detail);}};
 await clientmod.ensure(profile,progress);
 const prepared=await game.prepare(profile,{name:'ReleaseCheck',uuid:'00000000000000000000000000000001',accessToken:'offline'},progress);
 const argsFile=path.join(dir,'check.args');await fsp.writeFile(argsFile,prepared.args.map(game.quoteJavaArgument).join('\n'),{mode:0o600});
 const output=fs.createWriteStream(path.join(dir,'check.log'));let text='',exited=false;
 const child=cp.spawn(prepared.javaBin,['@'+argsFile],{cwd:dir,stdio:['ignore','pipe','pipe']});
 const collect=data=>{output.write(data);text=(text+data).slice(-100000);};child.stdout.on('data',collect);child.stderr.on('data',collect);child.on('exit',()=>exited=true);
 let screenshot=null;
 try{
  for(let i=0;i<90;i++){
   await wait(2000);if(exited)throw Error('Game exited before the screenshot check:\n'+text.slice(-16000));
   if(i>8&&i%5===0){const search=cp.spawnSync('xdotool',['search','--onlyvisible','--name','Minecraft'],{encoding:'utf8'});const window=search.stdout.trim().split('\n').filter(Boolean).at(-1);if(window)cp.spawnSync('xdotool',['key','--window',window,'F2']);}
   const files=await fsp.readdir(path.join(dir,'screenshots')).catch(()=>[]);
   if(files.some(n=>n.endsWith('.png'))){screenshot=path.join(dir,'screenshots',files.find(n=>n.endsWith('.png')));break;}
  }
  if(!screenshot)throw Error('No F2 screenshot was produced:\n'+text.slice(-16000));
  await wait(1000);const png=await fsp.readFile(screenshot),width=png.readUInt32BE(16),height=png.readUInt32BE(20);
  if(width!==3840||height!==2160)throw Error(`Expected 4K, received ${width}x${height}`);
  if(!text.includes('Monkey Client ready'))throw Error('Client initialization message was missing');
  await wait(3000);if(exited)throw Error('Game exited after capture:\n'+text.slice(-16000));
  console.log(`PASS ${version} ${loader}: client initialized; F2 saved ${width}x${height}; game remained alive`);
 }finally{child.kill('SIGTERM');output.end();await fsp.unlink(argsFile).catch(()=>{});}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
