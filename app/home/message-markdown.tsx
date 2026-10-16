'use client';
import {memo} from 'react';
import {Streamdown,defaultRehypePlugins,type Components} from 'streamdown';
import {createCodePlugin} from '@streamdown/code';
import './message-markdown.css';
const code=createCodePlugin({themes:['github-light','github-light']});
const plugins={code};
// Exclude rehype-raw entirely. Markdown HTML is skipped rather than interpreted.
const rehypePlugins=[defaultRehypePlugins.sanitize];
export function safeMarkdownUrl(value:string){
 const url=value.trim();if(/[\u0000-\u0020\u007f]/.test(url))return undefined;
 if(/^#[\w:.-]+$/.test(url))return url;
 try{const parsed=new URL(url);return ['https:','http:','mailto:'].includes(parsed.protocol)?url:undefined;}catch{return undefined;}
}
const components:Components={
 strong:({children})=><strong>{children}</strong>,
 a:({href,children})=>{const safe=href?safeMarkdownUrl(href):undefined;return safe?<a href={safe} target={safe.startsWith('#')?undefined:'_blank'} rel="noopener noreferrer" title={safe}>{children}</a>:<span>{children}</span>;},
 img:({alt})=><span className="pebble-md-image">Image omitted{alt?`: ${alt}`:''}</span>,
};
/** One renderer for streaming, completed and restored messages; no transcript rewriting. */
export const MessageMarkdown=memo(function MessageMarkdown({text,streaming=false}:{text:string;streaming?:boolean}){
 return <Streamdown className="pebble-markdown" mode="streaming" isAnimating={streaming} parseIncompleteMarkdown plugins={plugins} rehypePlugins={rehypePlugins} skipHtml urlTransform={(url,key)=>key==='href'?safeMarkdownUrl(url):undefined} components={components} controls={{code:{copy:true,download:false},table:false,mermaid:false}} lineNumbers={false} animated={false} linkSafety={{enabled:false}} codeBlockMaxHeight={400}>{text}</Streamdown>;
});
