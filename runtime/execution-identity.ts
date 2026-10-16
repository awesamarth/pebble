import {defineExtension,section} from '@earendil-works/pi-durable';
import type {Agent} from '@earendil-works/pi-durable';
import type {Models} from '@earendil-works/pi-ai';
import {clampThinkingLevel} from '@earendil-works/pi-ai/models';
/** Uses the same resolved agent as Pi's request preparation, never frontend state. */
export function executionIdentityExtension(models:Pick<Models,'getModel'>){
 return defineExtension({name:'pebble_execution_identity',sections:[section('runtime_execution',({agent})=>executionIdentity(agent,models))]});
}
export function executionIdentity(agent:Pick<Agent,'model'>&{thinkingLevel?:Agent['thinkingLevel']},models:Pick<Models,'getModel'>){
 const ref=agent.model;const model=ref?models.getModel(ref.provider,ref.modelId):undefined;
 const requested=agent.thinkingLevel??'not_reported';
 const support=model?model.reasoning?'supported':'unsupported':'not_reported';
 const effective=model&&model.reasoning&&requested!=='not_reported'?(requested==='off'?'off':clampThinkingLevel(model,requested)):support==='unsupported'?'unsupported':'not_reported';
 // Mirror only the installed OpenAI Responses adapter's declared request mapping.
 // The provider's internal routing and actual internal reasoning are not observable.
 let effort:string='not_reported';
 if(model?.api==='openai-responses'&&model.provider==='openai'){
  if(!model.reasoning)effort='not_sent';
  else if(effective==='off')effort=model.thinkingLevelMap?.off===null?'not_sent':model.thinkingLevelMap?.off??'none';
  else if(effective!=='not_reported'&&effective!=='unsupported')effort=model.thinkingLevelMap?.[effective]??effective;
 }
 return JSON.stringify({provider:ref?.provider??'not_reported',modelId:ref?.modelId??'not_reported',requestedReasoning:requested,reasoningSupport:support,effectiveClientReasoning:effective,adapterReasoningEffort:effort,scope:'Current request execution configuration. Historical responses may use different settings. These are application/provider request identifiers, not knowledge of hidden routing, internal reasoning or chain-of-thought. Text here does not enable reasoning; the runtime configures API parameters separately.'});
}
