/** Render only recognizable source references; never rewrite code or ordinary links. */
export const validSourceId=(id:string)=>/^(?:(?:discord|gmail):[a-f0-9]{64}|discord-reply:\d{1,25}|\d+:\d+:\d+)$/.test(id);
export function sourceHref(id:string){return `#pebble-source-${btoa(id).replaceAll('+','-').replaceAll('/','_').replaceAll('=','')}`;}
export function sourceIdFromHref(href:string){if(!href.startsWith('#pebble-source-'))return undefined;try{const id=atob(href.slice('#pebble-source-'.length).replaceAll('-','+').replaceAll('_','/'));return validSourceId(id)?id:undefined;}catch{return undefined;}}
type Node={type:string;value?:string;url?:string;children?:Node[]};
const source='(?:discord|gmail):[a-f0-9]{64}|discord-reply:\\d{1,25}|\\d+:\\d+:\\d+';
export function sourceCitationPlugin(){return(tree:Node)=>{
 const visit=(node:Node)=>{if(!node.children||['code','inlineCode','link','linkReference','image','imageReference','html'].includes(node.type))return;const children:Node[]=[];
  for(const child of node.children){if(child.type!=='text'||!child.value){visit(child);children.push(child);continue;}const pattern=new RegExp(`\\[(?:Source:\\s*)?(${source})\\]|\\bSource:\\s*(${source})(?=\\s|$)`,'g');let cursor=0;for(const match of child.value.matchAll(pattern)){const index=match.index!;if(index>cursor)children.push({type:'text',value:child.value.slice(cursor,index)});children.push({type:'link',url:sourceHref(match[1]??match[2]),children:[{type:'text',value:'Source'}]});cursor=index+match[0].length;}if(cursor<child.value.length)children.push({type:'text',value:child.value.slice(cursor)});}
  node.children=children;
 };visit(tree);
};}
