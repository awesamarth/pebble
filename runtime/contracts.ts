export type PebbleLook={name:string;color:string;eyes:string;glasses:string;expression:string};
export const defaultLook:PebbleLook={name:'bunty',color:'#a9b4c8',eyes:'Dot',glasses:'None',expression:'Content'};
export type ChatMessage={id:string;role:'user'|'assistant';text:string;failed?:boolean};
export type RuntimeView={messages:ChatMessage[];partial:string;busy:boolean;error?:string};
export type RuntimeStatus={profile:PebbleLook|null;provider:{state:'setup_required'|'configured'|'verified';method:'api_key'|'oauth'|null;model:string;reasoning?:import('@earendil-works/pi-ai').ModelThinkingLevel};memory:{state:'setup_required'|'configured'|'connected'|'unavailable';detail:string};runtime:{version:string;storage:string};ready:boolean};
export type OAuthView={state:'idle'|'waiting'|'connected'|'error';url?:string;message?:string;manual?:boolean};
export const integrationRoadmap=[{id:'gmail',name:'Gmail',status:'setup',description:'Connect OAuth and authenticated INBOX push with explicit intake consent.'},{id:'discord',name:'Discord',status:'setup',description:'Connect a bot with exact guild/channel scopes and review-gated sends.'}] as const;
