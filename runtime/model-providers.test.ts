import {test,expect} from 'bun:test';
import {createModels} from '@earendil-works/pi-ai';
import {API_PROVIDER_IDS,CONNECTIONS,installSupportedProviders,availableProviderCatalog} from './model-providers';
import {compatibleModels,validateGeneration} from './model-settings';
test('installed API adapters expose only supported scoped chat catalogs without credential lookup',()=>{
 const models=createModels({authContext:{env:async()=>{throw new Error('No auth during catalog lookup');},fileExists:async()=>false}});installSupportedProviders(models);
 const catalog=availableProviderCatalog(models);expect(catalog.map(p=>p.id)).toEqual([...API_PROVIDER_IDS]);expect(CONNECTIONS).toEqual(['chatgpt','openai','anthropic','google','openrouter']);
 for(const provider of catalog){expect(provider.models.length).toBeGreaterThan(0);for(const choice of provider.models){const actual=models.getModels(provider.id).find(m=>m.id===choice.id)!;expect(actual.provider).toBe(provider.id);expect(choice.supportsImages).toBe(actual.input.includes('image'));expect(choice.reasoningLevels.length).toBeGreaterThan(0);}}
 const google=catalog.find(p=>p.id==='google')!;expect(google.models.some(m=>/gemma|live|research|image/i.test(m.id))).toBe(false);
 const router=catalog.find(p=>p.id==='openrouter')!;expect(router.models.some(m=>/:batch$/.test(m.id))).toBe(false);expect(router.models.every(m=>/^(anthropic|openai|google)\//.test(m.id))).toBe(true);
 const claude=catalog.find(p=>p.id==='anthropic')!.models[0];expect(validateGeneration({provider:'anthropic',model:claude.id,reasoning:claude.reasoningLevels[0]},[claude],'anthropic')).toEqual({model:claude.id,reasoning:claude.reasoningLevels[0]});expect(()=>validateGeneration({provider:'openai',model:claude.id,reasoning:claude.reasoningLevels[0]},[claude],'anthropic')).toThrow('provider');
 const base=models.getModels('openai')[0];expect(compatibleModels([{...base,type:'classifier'} as never,{...base,type:'image'} as never])).toEqual([]);expect(compatibleModels(models.getModels('anthropic'),'openai')).toEqual([]);
});
