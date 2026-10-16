import {test,expect} from 'bun:test';
import {DiscordOnboarding} from './discord-onboarding';
import type {DiscordSocket} from './discord';
function fixture(){let now=1000,current=true,wrongGuild=false;const calls:Array<{url:string;method:string;body:any}>=[],configured:any[]=[];const sent:any[]=[];const sockets:DiscordSocket[]=[];
 const onboarding=new DiscordOnboarding(async value=>{configured.push(value);return {connected:true};},{fetch:(async(input,init)=>{const url=String(input);calls.push({url,method:init?.method??'GET',body:init?.body?JSON.parse(String(init.body)):null});const body=url.endsWith('/applications/@me')?{id:'100',name:'Synthetic pebble'}:url.endsWith('/users/@me')?{id:'100',username:'fixture',bot:true}:url.endsWith('/gateway/bot')?{url:'wss://gateway.discord.gg',session_start_limit:{remaining:10}}:url.endsWith('/channels/300')?{id:'300',guild_id:wrongGuild?'999':'200'}:url.endsWith('/members/400')?{user:{id:'400',bot:false}}:{id:'500'};return Response.json(body);}) as typeof fetch,socket:()=>{const socket:DiscordSocket={send:data=>sent.push(JSON.parse(data)),close:()=>{},onmessage:null,onclose:null,onerror:null};sockets.push(socket);return socket;},setTimer:()=>0,clearTimer:()=>{}},()=>now,()=>current);
 const packet=(d:any,t='INTERACTION_CREATE')=>sockets.at(-1)?.onmessage?.({data:JSON.stringify({op:0,t,d})});
 const interaction=(code:string)=>({id:'600',type:2,application_id:'100',token:'synthetic_interaction',guild_id:'200',channel_id:'300',member:{user:{id:'400',username:'synthetic-owner'}},data:{name:'pebble-pair',type:1,options:[{name:'code',type:3,value:code}]}});
 return {onboarding,calls,configured,sent,sockets,packet,interaction,wrongScope:()=>{wrongGuild=true;},advance:()=>{now+=600001;},change:()=>{current=false;}};
}
test('metadata discovery, pair-only gateway, immutable candidate and explicit local confirm',async()=>{const f=fixture();try{
 const discovered=await f.onboarding.discover('synthetic-bot-token');expect(f.calls.every(c=>c.method==='GET')).toBe(true);expect(JSON.stringify(discovered)).not.toContain('synthetic-bot-token');expect(discovered!.inviteUrl).toContain('applications.commands');expect(f.configured).toHaveLength(0);
 const started=await f.onboarding.start(discovered!.setupId);const code=started!.pairing.code!;expect(code).toHaveLength(32);expect(f.calls.find(c=>c.method==='POST')?.body.name).toBe('pebble-pair');
 f.sockets[0].onmessage?.({data:JSON.stringify({op:10,d:{heartbeat_interval:1000}})});expect(f.sent[0].d.intents).toBe(0);
 f.packet({id:'100',author:{id:'400'},content:'first-message'},'MESSAGE_CREATE');expect(f.onboarding.state()!.pairing.state).toBe('waiting');
 f.packet(f.interaction('wrong'));f.packet({...f.interaction(code),application_id:'999'});expect(f.onboarding.state()!.pairing.state).toBe('waiting');
 f.packet(f.interaction(code));const candidate=f.onboarding.state()!.pairing.candidate!;expect(candidate.userId).toBe('400');expect(f.configured).toHaveLength(0);
 f.packet({...f.interaction(code),id:'601',member:{user:{id:'999',username:'other'}}});expect(f.onboarding.state()!.pairing.candidate).toEqual(candidate);
 await Bun.sleep(0);const callback=f.calls.filter(c=>c.url.endsWith('/callback'));expect(callback).toHaveLength(1);expect(callback[0].body.data.flags).toBe(64);
 await expect(f.onboarding.confirm({setupId:discovered!.setupId,candidateId:'forged',rememberToken:false})).rejects.toThrow('Review');
 await f.onboarding.confirm({setupId:discovered!.setupId,candidateId:candidate.id,rememberToken:false});expect(f.configured).toHaveLength(1);expect(f.configured[0]).toMatchObject({ownerId:'400',guildIds:['200'],channelIds:['300'],rememberToken:false,autoReconnect:false,replyMode:'owner-mentions'});
 await expect(f.onboarding.confirm({setupId:discovered!.setupId,candidateId:candidate.id,rememberToken:false})).rejects.toThrow('no longer');
 }finally{f.onboarding.close();}});
test('expired, cancelled, and changed active connections never configure',async()=>{for(const mode of ['expired','cancelled','changed']){const f=fixture();try{const setup=await f.onboarding.discover('synthetic-bot-token');const started=await f.onboarding.start(setup!.setupId);if(mode==='expired')f.advance();else if(mode==='cancelled')f.onboarding.cancel(setup!.setupId);else f.change();f.packet(f.interaction(started!.pairing.code!));await expect(f.onboarding.confirm({setupId:setup!.setupId,candidateId:'none',rememberToken:true})).rejects.toThrow();expect(f.configured).toHaveLength(0);}finally{f.onboarding.close();}}});


test('confirmation revalidates the actual channel guild before replacing the existing setup',async()=>{const f=fixture();try{const setup=await f.onboarding.discover('synthetic-bot-token');const started=await f.onboarding.start(setup!.setupId);f.packet(f.interaction(started!.pairing.code!));const candidate=f.onboarding.state()!.pairing.candidate!;f.wrongScope();await expect(f.onboarding.confirm({setupId:setup!.setupId,candidateId:candidate.id,rememberToken:false})).rejects.toThrow('changed');expect(f.configured).toHaveLength(0);}finally{f.onboarding.close();}});
