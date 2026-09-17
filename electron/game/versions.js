// Official release availability verified against Mojang and Forge, 2026-09-16.
const releases=[
 {id:'26.3',java:25,forge:null},
 {id:'26.2',java:25,forge:'65.1.0'},
 {id:'26.1.2',java:25,forge:'64.1.0'},
 {id:'26.1.1',java:25,forge:'63.0.2'},
 {id:'26.1',java:25,forge:'62.0.9'},
 {id:'1.21.11',java:21,forge:'61.2.0'},
 {id:'1.21.10',java:21,forge:'60.1.0'},
 {id:'1.21.9',java:21,forge:'59.0.5'}
];
function assertSupported(version,loader){const release=releases.find(r=>r.id===version);if(!release)throw Error('Unsupported Minecraft version: '+version);if(!['vanilla','fabric','forge'].includes(loader))throw Error('Unsupported mod loader');if(loader==='forge'&&!release.forge)throw Error('Forge has not released a build for Minecraft '+version);return release;}
module.exports={releases,assertSupported};
