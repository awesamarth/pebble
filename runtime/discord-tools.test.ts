import {test,expect} from 'bun:test';
import {BACKGROUND_CONTEXT as ctx} from '@earendil-works/chord/context';
import {createDiscordTools} from './discord-tools';

test('Discord tools enforce active conversation scope and strip private work output',async()=>{
 const controller=createDiscordTools();let saved='';let privateRuns=0;
 const invoke=(name:string,args:unknown,id='channel-one')=>controller.extension.tools!.find(tool=>tool.name===name)!.execute(args as never,{conversationId:id} as never,ctx);
 const signal=new AbortController();
 controller.bind('channel-one',{signal:signal.signal,searchMemory:async query=>({query,scope:'only-this-channel'}),remember:async text=>{saved=text;return {saved:true,sourceId:'current-owner-source'};},history:async()=>[{role:'user',text:'channel history'}],privateTask:async()=>{privateRuns++;return {id:'private-job',state:'queued',secret:'PRIVATE_RESULT'};}});
 expect((await invoke('pebble_channel_memory_search',{query:'tea'},'another-channel')).isError).toBe(true);
 expect(JSON.stringify(await invoke('pebble_channel_memory_search',{query:'tea'}))).toContain('only-this-channel');
 await invoke('pebble_channel_memory_remember',{text:'I prefer tea'});expect(saved).toBe('I prefer tea');
 const receipt=JSON.stringify(await invoke('pebble_private_task',{}));expect(receipt).toContain('private-job');expect(receipt).not.toContain('PRIVATE_RESULT');expect(privateRuns).toBe(1);
 signal.abort();expect((await invoke('pebble_channel_history',{})).isError).toBe(true);
 controller.release('channel-one');expect((await invoke('pebble_channel_memory_remember',{text:'wrong'})).isError).toBe(true);expect(saved).toBe('I prefer tea');
});
