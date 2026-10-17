import {test,expect} from 'bun:test';
import {BACKGROUND_CONTEXT as ctx} from '@earendil-works/chord/context';
import {BrowserController} from './controller';import {browserExtension} from './tools';
test('browser tools require the live private owner request before browser access or vision lookup',async()=>{
 let authorized=false,calls=0;const browser={startResearch:async()=>{calls++;return {untrusted:true};},navigatePublic:async()=>{calls++;return {untrusted:true};},observe:async()=>{calls++;return {};},tabs:()=>{calls++;return [];},scroll:async()=>{calls++;return {};},propose:async()=>{calls++;return {id:'fixture'};}} as unknown as BrowserController;
 const extension=browserExtension(browser,()=>authorized);const invoke=(name:string,args:unknown={})=>extension.tools!.find(tool=>tool.name===name)!.execute(args as never,{} as never,ctx);
 for(const name of ['pebble_browser_start_research','pebble_browser_navigate_public','pebble_browser_observe','pebble_browser_tabs','pebble_browser_scroll','pebble_browser_action','pebble_browser_screenshot'])expect((await invoke(name,{url:'https://publicsite.com'})).isError).toBe(true);expect(calls).toBe(0);
 authorized=true;expect((await invoke('pebble_browser_start_research',{url:'https://publicsite.com'})).isError).not.toBe(true);expect(calls).toBe(1);authorized=false;expect((await invoke('pebble_browser_navigate_public',{url:'https://publicsite.com'})).isError).toBe(true);expect(calls).toBe(1);
});
