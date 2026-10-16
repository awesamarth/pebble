import type {Model,Api,ModelThinkingLevel} from '@earendil-works/pi-ai';
import {getSupportedThinkingLevels} from '@earendil-works/pi-ai/models';
export type GenerationSettings={model:string;reasoning:ModelThinkingLevel};
export type ModelChoice={id:string;name:string;reasoningLevels:ModelThinkingLevel[];supportsImages:boolean};
export const defaultGeneration:GenerationSettings={model:'gpt-6-sol',reasoning:'off'};
/** Transport compatibility only. This is never an account-entitlement check. */
export function compatibleModels(models:readonly Model<Api>[]):ModelChoice[]{return models.filter(m=>m.provider==='openai'&&m.api==='openai-responses'&&m.input.includes('text')&&!/realtime|audio|transcri|tts|deep-research/i.test(m.id)&&!['gpt-4','gpt-4-turbo'].includes(m.id)).map(m=>({id:m.id,name:m.name,reasoningLevels:getSupportedThinkingLevels(m),supportsImages:m.input.includes('image')}));}
export function validateGeneration(value:unknown,choices:ModelChoice[]):GenerationSettings{if(!value||typeof value!=='object')throw new Error('Choose a model and reasoning level.');if('provider' in value&&(value as {provider:unknown}).provider!=='openai')throw new Error('Choose the connected OpenAI provider; other providers are not supported in this version.');const {model,reasoning}=value as GenerationSettings;const choice=choices.find(m=>m.id===model);if(!choice)throw new Error('Choose a model compatible with chat in pebble.');if(!choice.reasoningLevels.includes(reasoning))throw new Error('Choose a reasoning level supported by this model.');return {model,reasoning};}
