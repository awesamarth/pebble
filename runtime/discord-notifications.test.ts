import {test,expect} from 'bun:test';
import {Database} from 'bun:sqlite';
import {DiscordNotifications,NotificationUnavailable,reminderFromOwnerText,completionNotificationRequested} from './discord-notifications';
const destination={botId:'111111',ownerId:'222222',guildId:'333333',channelId:'444444'};
const input=(sourceId:string,dueAt:number)=>({sourceId,dueAt,message:'Reminder: synthetic fixture',destination});
test('opt-in, due time, immutable destination, exact durable consume, dedup and cancellation',async()=>{
 const db=new Database(':memory:');let now=100000,sends=0;const queue=new DiscordNotifications(db,async(job,_signal,consume)=>{expect(Object.isFrozen(job.destination)).toBe(true);expect(await consume()).toBe(true);expect(await consume()).toBe(false);sends++;},()=>now);
 expect(queue.status().enabled).toBe(false);expect(()=>queue.schedule(input('off',now))).toThrow('Enable');queue.setEnabled(true);
 const job=queue.schedule(input('one',now+1000));expect(queue.schedule({...input('one',now+1000),message:'replacement'}).message).toBe(job.message);
 await queue.tick();expect(sends).toBe(0);now+=1000;await Promise.all([queue.tick(),queue.tick()]);expect(sends).toBe(1);expect(queue.status().items[0].state).toBe('sent');queue.schedule(input('one',now));await queue.tick();expect(sends).toBe(1);
 const cancelled=queue.schedule(input('cancel',now));queue.cancel(cancelled.id);await queue.tick();expect(sends).toBe(1);
 queue.schedule(input('disable',now));queue.setEnabled(false);queue.setEnabled(true);await queue.tick();expect(sends).toBe(1);await queue.close();db.close();
});
test('restart preserves pending, never retries sending or ambiguous transport; scope denial fails safely',async()=>{
 const db=new Database(':memory:');let calls=0;const first=new DiscordNotifications(db,async()=>{},()=>100000);first.setEnabled(true);const pending=first.schedule(input('pending',100000));const uncertain=first.schedule(input('interrupted',100000));db.query("UPDATE discord_notifications SET state='sending' WHERE id=?").run(uncertain.id);await first.close();
 const queue=new DiscordNotifications(db,async(_item,_signal,consume)=>{calls++;expect(await consume()).toBe(true);throw new Error('secret transport failure');},()=>100000);
 expect(queue.status().items.find(x=>x.id===uncertain.id)?.state).toBe('unknown');await queue.tick();expect(calls).toBe(1);expect(queue.status().items.find(x=>x.id===pending.id)?.state).toBe('unknown');expect(JSON.stringify(queue.status())).not.toContain('secret');await queue.tick();expect(calls).toBe(1);await queue.close();
 const denied=new DiscordNotifications(db,async()=>{throw new NotificationUnavailable('private token never echoed');},()=>100000);denied.schedule(input('denied',100000));await denied.tick();expect(denied.status().items.find(x=>x.sourceId==='denied')?.state).toBe('failed');await denied.close();db.close();
});
test('cancellation before transport authorization blocks the POST; relative requests use original human text',async()=>{
 const db=new Database(':memory:');let enter!:()=>void,resume!:()=>void,consumed=true;const entered=new Promise<void>(resolve=>enter=resolve),gate=new Promise<void>(resolve=>resume=resolve);
 const queue=new DiscordNotifications(db,async(_item,_signal,consume)=>{enter();await gate;consumed=await consume();if(!consumed)throw new NotificationUnavailable('cancelled');},()=>100000);queue.setEnabled(true);const job=queue.schedule(input('cancel-active',100000));const tick=queue.tick();await entered;queue.cancel(job.id);resume();await tick;expect(consumed).toBe(false);await queue.close();db.close();
 expect(reminderFromOwnerText('<@12345> remind me in 2 minutes to drink water',1000)).toEqual({dueAt:121000,message:'Reminder: drink water'});expect(reminderFromOwnerText('remind me on Discord in 1 hour to stand',1000).dueAt).toBe(3601000);
 expect(()=>reminderFromOwnerText('somebody said remind me in 2 minutes to leak',1000)).toThrow();expect(()=>reminderFromOwnerText('remind me tomorrow to walk',1000)).toThrow();expect(()=>reminderFromOwnerText('remind me in 0 minutes to walk',1000)).toThrow();
 expect(completionNotificationRequested('Check my inbox and ping me when done')).toBe(true);expect(completionNotificationRequested('Let me know when the task is finished')).toBe(true);expect(completionNotificationRequested('> ping me when done')).toBe(false);expect(completionNotificationRequested('Someone said “ping me when done”')).toBe(false);expect(completionNotificationRequested('Check my inbox')).toBe(false);
});
