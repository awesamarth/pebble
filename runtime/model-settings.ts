import type {AnyModel,ModelThinkingLevel} from '@earendil-works/pi-ai';
import type {ApiProvider} from './model-providers';
import {getSupportedThinkingLevels,isModelType} from '@earendil-works/pi-ai/models';
export type GenerationSettings={provider?:ApiProvider;model:string;reasoning:ModelThinkingLevel};
export type ModelChoice={id:string;name:string;reasoningLevels:ModelThinkingLevel[];supportsImages:boolean};
export const defaultGeneration:GenerationSettings={model:'gpt-6-sol',reasoning:'off'};
/** Transport compatibility only. This is never an account-entitlement check. */
export function compatibleModels(models:readonly AnyModel[],provider:ApiProvider='openai'):ModelChoice[]{
 const apis={openai:['openai-responses'],anthropic:['anthropic-messages'],google:['google-generative-ai'],openrouter:['anthropic-messages','openai-completions']} as const;
 return models.filter(m=>isModelType(m,'chat')).filter(m=>m.provider===provider&&(apis[provider] as readonly string[]).includes(m.api)&&m.input.includes('text')&&!/realtime|(?:^|[-/])live(?:[-/]|$)|:batch$|gemma|audio|transcri|tts|deep[-_ ]?research|embedding|moderation|image|computer-use|computer_use/i.test(m.id)&&!['gpt-4','gpt-4-turbo'].includes(m.id)&&
 // OpenRouter does not expose per-model tool capability metadata in this SDK.
 // Keep its route to native families with supported function/tool calling.
 (provider!=='openrouter'||/^(?:anthropic\/claude-|openai\/(?:gpt-(?:4o|4\.1|5|6)|o[134])|google\/gemini-(?:1\.5|2|3))/i.test(m.id)))
 .map(m=>({id:m.id,name:m.name,reasoningLevels:getSupportedThinkingLevels(m),supportsImages:m.input.includes('image')}));
}
export function validateGeneration(value:unknown,choices:ModelChoice[],expectedProvider:ApiProvider='openai'):GenerationSettings{if(!value||typeof value!=='object')throw new Error('Choose a model and reasoning level.');if('provider' in value&&(value as {provider:unknown}).provider!==expectedProvider)throw new Error('Choose the currently connected model provider.');const {model,reasoning}=value as GenerationSettings;const choice=choices.find(m=>m.id===model);if(!choice)throw new Error('Choose a model compatible with chat in pebble.');if(!choice.reasoningLevels.includes(reasoning))throw new Error('Choose a reasoning level supported by this model.');return {model,reasoning};}
