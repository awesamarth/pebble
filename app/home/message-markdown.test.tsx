import {test,expect} from 'bun:test';
import {renderToStaticMarkup} from 'react-dom/server';
import {MessageMarkdown,safeMarkdownUrl} from './message-markdown';
test('actual Markdown renderer formats text without executing HTML, unsafe links or remote images',()=>{
 const html=renderToStaticMarkup(<MessageMarkdown text={'## A heading\n\n**Bold** and *emphasis*.\n\n- First\n- Second\n\n[Safe](https://example.com) [Unsafe](javascript:alert(1))\n\n![Tracker](https://tracker.invalid/pixel.png)\n\n<script>alert(1)</script>\n<img src="https://tracker.invalid/raw.png" onerror="alert(1)">'}/>);
 expect(html).toContain('<strong>Bold</strong>');expect(html).toContain('<em>emphasis</em>');expect(html).toContain('data-streamdown="heading-2"');expect(html).toContain('<li');expect(html).toContain('href="https://example.com"');expect(html).toContain('rel="noopener noreferrer"');expect(html).not.toMatch(/<script|<img|href="javascript:/);expect(html).toContain('Image omitted');
});
test('incomplete emphasis is repaired and URL policy permits only explicit safe protocols or local fragments',()=>{
 expect(renderToStaticMarkup(<MessageMarkdown text="A **streaming thought" streaming/>)).toContain('<strong>streaming thought</strong>');
 for(const url of ['https://example.com/a','http://example.com','mailto:friend@example.com','#source-one'])expect(safeMarkdownUrl(url)).toBe(url);
 for(const url of ['javascript:alert(1)','data:text/html,test','file:///etc/passwd','vbscript:msgbox(1)','//tracker.invalid/pixel','/api/runtime/status','java\nscript:alert(1)'])expect(safeMarkdownUrl(url)).toBeUndefined();
});

test('recognized source citations render inspectable buttons while code and links stay literal',()=>{
 const id=`discord:${'a'.repeat(64)}`;
 const html=renderToStaticMarkup(<MessageMarkdown text={`A grounded claim [${id}] and another [Source: 1:7:0].\n\n\`${id}\`\n\n[Ordinary](https://example.com)\n\n\`[Source: 1:8:0]\`\n\nSource: gmail:${'b'.repeat(64)}`}/>);
 expect((html.match(/aria-label="Open saved source"/g)??[])).toHaveLength(3);expect(html).toContain('href="https://example.com"');expect(html).toContain('[Source: 1:8:0]');expect(html).toContain(`<code`);expect(html).not.toContain(`[${id}]`);
});

test('source references tolerate sentence punctuation and lowercase labels',()=>{
 const html=renderToStaticMarkup(<MessageMarkdown text="Evidence Source: 1:7:0. Another [source: 1:8:0]. Literal `Source: 1:9:0.`"/>);
 expect((html.match(/aria-label="Open saved source"/g)??[])).toHaveLength(2);expect(html).toContain('Literal');expect(html).toContain('Source: 1:9:0.');
});
