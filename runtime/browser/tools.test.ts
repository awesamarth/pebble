import {test,expect} from 'bun:test';
import {BACKGROUND_CONTEXT as ctx} from '@earendil-works/chord/context';
import {BrowserController} from './controller';import {browserExtension} from './tools';
test('browser tools require the live private owner request before browser access or vision lookup',async()=>{
 let authorized=false,calls=0;const browser={startBrowsing:async()=>{calls++;return {untrusted:true};},navigatePublic:async()=>{calls++;return {untrusted:true};},observe:async()=>{calls++;return {};},tabs:()=>{calls++;return [];},scroll:async()=>{calls++;return {};},propose:async()=>{calls++;return {id:'fixture'};}} as unknown as BrowserController;
 const extension=browserExtension(browser,()=>authorized);const invoke=(name:string,args:unknown={})=>extension.tools!.find(tool=>tool.name===name)!.execute(args as never,{} as never,ctx);
 for(const name of ['pebble_browser_start','pebble_browser_navigate','pebble_browser_observe','pebble_browser_tabs','pebble_browser_scroll','pebble_browser_action','pebble_browser_screenshot'])expect((await invoke(name,{url:'https://publicsite.com'})).isError).toBe(true);expect(calls).toBe(0);
 authorized=true;expect((await invoke('pebble_browser_start',{url:'https://publicsite.com'})).isError).not.toBe(true);expect(calls).toBe(1);authorized=false;expect((await invoke('pebble_browser_navigate',{url:'https://publicsite.com'})).isError).toBe(true);expect(calls).toBe(1);
});

test('browser read failures hide transport details and explain ownership',async()=>{
 let failure='Browser control is paused, stopped, or owned by the user. Reobserve after resuming.';
 const browser={observe:async()=>{throw Error(failure);}} as unknown as BrowserController;const extension=browserExtension(browser,()=>true);const observe=extension.tools!.find(t=>t.name==='pebble_browser_observe')!;
 let result=await observe.execute({} as never,{} as never,ctx);expect(JSON.stringify(result)).toContain('Resume');failure='synthetic private transport details';result=await observe.execute({} as never,{} as never,ctx);expect(JSON.stringify(result)).not.toContain(failure);expect(result.isError).toBe(true);
});
