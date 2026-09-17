const test=require('node:test'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
test('all inline renderer scripts parse',()=>{
 const html=fs.readFileSync(path.join(__dirname,'../renderer/index.html'),'utf8');
 for(const [index,script]of [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)].entries())new vm.Script(script[1],{filename:'renderer-inline-'+index});
});
