const API='https://api.modrinth.com/v2';
async function resolve(profile,root,fetchImpl=fetch){
 const json=async url=>{const r=await fetchImpl(url);if(!r.ok)throw Error('Could not resolve mod dependencies');return r.json();};
 const known=new Map((profile.mods||[]).map(m=>[m.projectId,m])),result=[],visited=new Map();
 const managed=new Set(profile.loader==='fabric'?['P7dR8mSH',...(profile.settings?.clientMod===false?[]:['AANobbMI'])]:[]);
 const managedVersions=new Map();for(const row of require('./performance').selection(profile)){managed.add(row.projectId);managedVersions.set(row.projectId,row.versionId);}
 async function visit(release){
  if(visited.has(release.project_id)){if(visited.get(release.project_id)!==release.id)throw Error('Conflicting dependency versions');return;}
  if(visited.size>=100)throw Error('Too many dependencies');visited.set(release.project_id,release.id);
  for(const dep of release.dependencies||[]){if(dep.dependency_type!=='required')continue;
   if(dep.project_id&&managed.has(dep.project_id)&&!dep.version_id)continue;
   let v;if(dep.version_id)v=await json(API+'/version/'+encodeURIComponent(dep.version_id));
   else if(dep.project_id){const rows=await json(API+'/project/'+encodeURIComponent(dep.project_id)+'/version?loaders='+encodeURIComponent(JSON.stringify([profile.loader]))+'&game_versions='+encodeURIComponent(JSON.stringify([profile.version])));v=rows.find(r=>r.version_type==='release')||rows[0];}
   if(!v||!v.game_versions.includes(profile.version)||!v.loaders.includes(profile.loader))throw Error('A required dependency has no compatible build for '+profile.version);
   if(managed.has(v.project_id)){
    if(dep.version_id){let current=managedVersions.get(v.project_id);if(v.project_id==='P7dR8mSH'){const available=await json(API+'/project/P7dR8mSH/version?loaders='+encodeURIComponent(JSON.stringify([profile.loader]))+'&game_versions='+encodeURIComponent(JSON.stringify([profile.version])));current=(available.find(r=>r.version_type==='release')||available[0])?.id;}
     if(current!==v.id)throw Error('This mod requires a specific version of an included mod that cannot be substituted safely. Choose another release.');}
    continue;
   }
   const have=known.get(v.project_id);if(have&&have.enabled!==false){if(dep.version_id&&have.versionId&&have.versionId!==dep.version_id)throw Error('Installed dependency version conflicts with '+release.name);continue;}
   if(visited.has(v.project_id)){if(visited.get(v.project_id)!==v.id)throw Error('Conflicting dependency versions');continue;}
   await visit(v);const project=await json(API+'/project/'+encodeURIComponent(v.project_id)),file=v.files.find(f=>f.primary)||v.files[0];if(!file?.hashes?.sha1)throw Error('Dependency file has no checksum');
   result.push({id:have?.id||require('node:crypto').randomUUID(),projectId:v.project_id,title:project.title,icon:project.icon_url,enabled:true,versionId:v.id,version:v.version_number,fileName:file.filename,url:file.url,sha1:file.hashes.sha1});
  }
 }
 await visit(root);return result;
}
module.exports={resolve};
