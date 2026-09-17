/* Isolated Linux/virtual-display release check. Never uses a player's data. */
const fs=require('node:fs'),fsp=require('node:fs/promises'),path=require('node:path'),cp=require('node:child_process');
const root=path.resolve('build/runtime'),version=process.argv[2],loader=process.argv[3];
require.cache[require.resolve('electron')]={exports:{app:{getPath:()=>root}}};
const game=require('../electron/game/launch'),clientmod=require('../electron/game/clientmod');
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function main(){
 if(!version||!['fabric','forge'].includes(loader))throw Error('Expected Minecraft version and loader');
 const id=version+'-'+loader,dir=path.join(root,'instances',id);await fsp.mkdir(dir,{recursive:true});
 const profile={id,name:'Release verification',version,loader,mods:[],settings:{ram:2048,width:854,height:480,performance:'maximum'}};
 await fsp.writeFile(path.join(dir,'options.txt'),'soundCategory_music:0.0\nmaxFps:30\nrenderDistance:4\nsimulationDistance:5\n');
 let last='';const progress=p=>{if(last!==p.stage){last=p.stage;console.log(p.stage,p.detail);}};
 await clientmod.ensure(profile,progress);
 await require('../electron/game/performance').sync(profile,progress);
 await fsp.copyFile(path.resolve(`tools/qa/qa-${version}-${loader}.jar`),path.join(dir,'mods','monkeyqa.jar'));
 const prepared=await game.prepare(profile,{name:'ReleaseCheck',uuid:'00000000000000000000000000000001',accessToken:'offline'},progress);
 const argsFile=path.join(dir,'check.args');await fsp.writeFile(argsFile,prepared.args.map(game.quoteJavaArgument).join('\n'),{mode:0o600});
 const output=fs.createWriteStream(path.join(dir,'check.log'));let text='',exited=false;
 const child=cp.spawn(prepared.javaBin,['@'+argsFile],{cwd:dir,stdio:['ignore','pipe','pipe']});
 const collect=data=>{output.write(data);text=(text+data).slice(-100000);};child.stdout.on('data',collect);child.stderr.on('data',collect);child.on('exit',()=>exited=true);
 let screenshot=null,resourcesReadyAt=0;
 try{
  for(let i=0;i<180;i++){
   await wait(2000);if(exited)throw Error('Game exited before the screenshot check:\n'+text.slice(-16000));
   if(i===25||i===80)cp.spawnSync('import',['-window','root',path.join(dir,`display-${i}.png`)],{timeout:10000});
   if(!resourcesReadyAt&&/Created:.*(?:gui|items)\.png/.test(text))resourcesReadyAt=Date.now();
   if(text.includes('MONKEY_QA_WORLD_PASS')&&i%5===0){
    // SDL's Vulkan fallback can leave the window title empty. Match our child
    // process, so the check still delivers a real key event to that window.
    const search=cp.spawnSync('xdotool',['search','--onlyvisible','--pid',String(child.pid)],{encoding:'utf8'});
    const window=search.stdout.trim().split('\n').filter(Boolean).at(-1);
    if(window){cp.spawnSync('xdotool',['windowfocus','--sync',window],{timeout:5000});cp.spawnSync('xdotool',['key','--clearmodifiers','F2'],{timeout:5000});}
   }
   const files=await fsp.readdir(path.join(dir,'screenshots')).catch(()=>[]);
   for(const name of files.filter(n=>n.endsWith('.png'))){
    const candidate=path.join(dir,'screenshots',name),png=await fsp.readFile(candidate);
    // Minecraft creates the file before the async PNG encoder finishes.
    if(png.length>33&&png.subarray(-8,-4).toString('ascii')==='IEND'){screenshot=candidate;break;}
   }
   if(screenshot)break;
  }
  if(!screenshot)throw Error('No F2 screenshot was produced:\n'+text.slice(-16000));
  await wait(1000);const png=await fsp.readFile(screenshot),width=png.readUInt32BE(16),height=png.readUInt32BE(20);
  if(width!==3840||height!==2160)throw Error(`Expected 4K, received ${width}x${height}`);
  if(!text.includes('Monkey Client ready'))throw Error('Client initialization message was missing');
  for(const marker of ['RESOURCES_OK','WORLD_JOINED','PAUSE_MENU','MENU_OPEN','MODULE_GRID','INPUT_PASS','FLIGHT_PASS','NATIVE_FRIENDS','NATIVE_GALLERY','NATIVE_SKINS','SCREENSHOT_CHAT_PASS','WORLD_PASS'])if(!text.includes('MONKEY_QA_'+marker))throw Error('Missing world check: '+marker);
  if(process.env.MONKEY_UI_URL&&!text.includes('MONKEY_QA_BRIDGE_PASS'))throw Error('Native shared data screens did not load');
  await wait(3000);if(exited)throw Error('Game exited after capture:\n'+text.slice(-16000));
  cp.spawnSync('import',['-window','root',path.join(dir,'display-world.png')],{timeout:10000});
  console.log(`PASS ${version} ${loader}: fresh world joined, all modules enabled, resources resolved, pause and Monkey menus opened; F2 saved ${width}x${height}; game remained alive`);
 }finally{child.kill('SIGTERM');output.end();await fsp.unlink(argsFile).catch(()=>{});}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
