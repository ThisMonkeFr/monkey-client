const {chromium}=require('@playwright/test');
const path=require('node:path'),fs=require('node:fs/promises'),{pathToFileURL}=require('node:url');
(async()=>{
 const browser=await chromium.launch({headless:true}),page=await browser.newPage({viewport:{width:1240,height:800}}),errors=[];
 page.on('pageerror',error=>errors.push(error.message));
 await page.goto(pathToFileURL(path.resolve('renderer/index.html')).href,{waitUntil:'domcontentloaded'});await page.waitForSelector('body.boot-ready');
 await fs.mkdir('build/ui-check',{recursive:true});await page.screenshot({path:'build/ui-check/play.png'});
 await page.getByRole('button',{name:'Screenshots',exact:true}).click();await page.getByRole('heading',{name:'Screenshots',exact:true}).waitFor();await page.screenshot({path:'build/ui-check/screenshots.png'});
 await page.getByRole('button',{name:'Launcher settings',exact:true}).click();await page.screenshot({path:'build/ui-check/settings.png'});
 await page.evaluate(()=>{closeModal();Object.assign(S.theme,{accent:'#ff7900',bg:'#311409',panel:'#662814'});applyTheme();go('play');});await page.screenshot({path:'build/ui-check/orange.png'});
 await page.setViewportSize({width:1000,height:680});await page.screenshot({path:'build/ui-check/minimum.png'});
 const result=await page.evaluate(()=>({style:document.documentElement.dataset.menuStyle,overflow:document.documentElement.scrollWidth>innerWidth,booting:document.body.classList.contains('booting'),profileClipped:(()=>{const hero=document.querySelector('.hero').getBoundingClientRect(),profile=document.querySelector('.prow-sel').getBoundingClientRect();return profile.bottom>hero.bottom+1;})()}));
 if(result.style!=='monkey'||result.overflow||result.booting||result.profileClipped||errors.length)throw Error(JSON.stringify({result,errors}));
 await browser.close();console.log('PASS renderer startup, screenshots, settings, orange theme and minimum window size');
})().catch(error=>{console.error(error);process.exit(1);});
