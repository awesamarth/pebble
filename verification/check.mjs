import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
const browser = await chromium.launch({headless:true,executablePath:"/Users/awesamarth/Library/Caches/ms-playwright/chromium-1243/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing"});
const page = await browser.newPage({viewport:{width:1440,height:1000},deviceScaleFactor:1});
const errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error') errors.push(m.text());});
await page.goto('http://127.0.0.1:7341',{waitUntil:'networkidle'});
await page.locator('.reset').click();
await page.screenshot({path:'verification/desktop.png',fullPage:true});
await page.getByLabel('What should we call them?').fill('Mochi');
assert.equal(await page.locator('.name-tag').innerText(),'Mochi\none of a kind, just like you');
for(const color of ['River','Butter','Lilac','Moss','Peach','Rose','Black','White']){const control=page.getByRole('button',{name:`${color} color`,exact:true});await control.click();assert.equal(await control.getAttribute('aria-pressed'),'true');assert.equal(await page.locator('.color-caption').innerText(),`${color} a softer sort of color`);}
for(const [label,options] of [['A look in the eyes',['Dot','Oval','Sleepy','Sparkle']],['A little extra character',['None','Round','Square','Shades']],['How’s the little one feeling?',['Content','Happy','Curious']]]){let last='';for(const option of options){const control=page.getByRole('group',{name:label}).getByRole('button',{name:option,exact:true});await control.click();assert.equal(await control.getAttribute('aria-pressed'),'true');const shape=await page.locator('.preview-art svg').innerHTML();assert.notEqual(shape,last);last=shape;const labels=await page.locator('svg.pebble').evaluateAll(nodes=>nodes.map(n=>n.getAttribute('aria-label')));assert(labels.every(l=>l.includes(option.toLowerCase())));}}
await page.getByRole('button',{name:'Rose color',exact:true}).click();
await page.reload({waitUntil:'networkidle'});assert.equal(await page.getByLabel('What should we call them?').inputValue(),'Mochi');assert.equal(await page.getByRole('button',{name:'Rose color'}).getAttribute('aria-pressed'),'true');
await page.getByRole('tab',{name:'A little headspace'}).click();assert.match(await page.locator('.user-bubble').innerText(),/creative project/);
await page.locator('.reset').click();assert.equal(await page.getByLabel('What should we call them?').inputValue(),'bunty');

for(const shade of ['Black','White']){
 await page.getByRole('button',{name:`${shade} color`,exact:true}).click();
 for(const eye of ['Dot','Oval','Sleepy','Sparkle']){
  await page.getByRole('group',{name:'A look in the eyes'}).getByRole('button',{name:eye,exact:true}).click();
  for(const glasses of ['None','Round','Square','Shades']){
   await page.getByRole('group',{name:'A little extra character'}).getByRole('button',{name:glasses,exact:true}).click();
   for(const expression of ['Content','Happy','Curious']){
    await page.getByRole('group',{name:'How’s the little one feeling?'}).getByRole('button',{name:expression,exact:true}).click();
    const ink=await page.locator('.preview-art .face').getAttribute('fill');
    assert.equal(ink,shade==='Black'?'#f7f4e9':'#292b36');
    assert.equal(await page.locator('.preview-art .face').getAttribute('stroke'),ink);
    if(glasses!=='None')assert.equal(await page.locator('.preview-art .glasses').evaluate(e=>getComputedStyle(e).stroke),shade==='Black'?'rgb(247, 244, 233)':'rgb(41, 43, 54)');
   }
  }
 }
 await page.getByRole('group',{name:'A look in the eyes'}).getByRole('button',{name:'Dot',exact:true}).click();
 await page.getByRole('group',{name:'A little extra character'}).getByRole('button',{name:'Round',exact:true}).click();
 await page.getByRole('group',{name:'How’s the little one feeling?'}).getByRole('button',{name:'Content',exact:true}).click();
 await page.locator('.customizer').screenshot({path:`verification/${shade.toLowerCase()}-customizer.png`});
}
await page.locator('.reset').click();
for(const width of [1440,1024,768,390,360]){await page.setViewportSize({width,height:900});await page.waitForTimeout(100);assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`overflow at ${width}`);}
await page.setViewportSize({width:390,height:844});await page.screenshot({path:'verification/mobile.png',fullPage:true});
await page.locator('#studio').scrollIntoViewIfNeeded();await page.screenshot({path:'verification/mobile-customizer.png'});
await page.emulateMedia({reducedMotion:'reduce'});assert.equal(await page.locator('.pebble-body').first().evaluate(e=>getComputedStyle(e).animationName),'none');
assert.deepEqual(errors,[]);console.log('PASS: all 8 colors (including 96 black/white face combinations), 4 eye styles, 4 glasses, 3 expressions, name, synchronized previews, persistence, reset, conversation tabs, 5 responsive widths, reduced motion, and no page errors.');
await browser.close();
