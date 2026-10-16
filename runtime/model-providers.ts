import type {MutableModels} from '@earendil-works/pi-ai/models';
import {openaiProvider} from '@earendil-works/pi-ai/providers/openai';
import {anthropicProvider} from '@earendil-works/pi-ai/providers/anthropic';
import {googleProvider} from '@earendil-works/pi-ai/providers/google';
import {openrouterProvider} from '@earendil-works/pi-ai/providers/openrouter';
import {wrapBrowserProvider} from './browser/provider';
import {compatibleModels} from './model-settings';
export const API_PROVIDER_IDS=['openai','anthropic','google','openrouter'] as const;
export type ApiProvider=typeof API_PROVIDER_IDS[number];
export const CONNECTIONS=['chatgpt',...API_PROVIDER_IDS] as const;
export type ConnectionId=typeof CONNECTIONS[number];
export const providerDefinitions=[
 {id:'openai',name:'OpenAI',keyLabel:'OpenAI API key',description:'Use OpenAI models with your own API account.'},
 {id:'anthropic',name:'Anthropic',keyLabel:'Anthropic API key',description:'Use Claude with your own Anthropic account.'},
 {id:'google',name:'Google',keyLabel:'Google AI API key',description:'Use Gemini with your own Google AI account.'},
 {id:'openrouter',name:'OpenRouter',keyLabel:'OpenRouter API key',description:'Use supported Claude, GPT and Gemini chat models through OpenRouter.'},
] satisfies {id:ApiProvider;name:string;keyLabel:string;description:string}[];
/** Registers installed SDK adapters only; this neither reads credentials nor contacts providers. */
export function installSupportedProviders(models:MutableModels){models.setProvider(wrapBrowserProvider(openaiProvider()));models.setProvider(anthropicProvider());models.setProvider(googleProvider());models.setProvider(openrouterProvider());}
/** Transport capability catalog, not a claim of account access or provider availability. */
export function availableProviderCatalog(models:MutableModels){return providerDefinitions.map(provider=>({...provider,models:compatibleModels(models.getModels(provider.id),provider.id)}));}
