# Chat Markdown

Chat uses Streamdown2.7.0 with its Shiki code plugin. Streaming fragments, completed messages and restored history share the same renderer with incomplete Markdown repair. Scoped CSS preserves pebble's existing bubbles, padding, timestamps, composer and scrollbar styling; Tailwind is not added.

Implemented: semantic bold/emphasis/headings, lists, safe links, quotes, inline and fenced code, highlighted tokens, native code-copy control and internally scrolling tables/code. Raw HTML is never parsed/executed; HTML-looking text may remain visible. URL transforms allow only explicit HTTP/HTTPS/mailto or simple fragments. Remote Markdown images are replaced with an omitted-image notice; existing explicitly attached chat images retain their separate path. No Mermaid execution, remote image fetch or raw HTML plugin is enabled.

Actual renderer tests and intercepted Chrome desktop/mobile checks cover incomplete emphasis/lists/fences, completion/history, malicious HTML/URLs/images, actual token colors, clipboard text, table/code overflow containment and composer focus/spacing. TypeScript and isolated production build pass. References: https://streamdown.ai/docs/configuration, https://streamdown.ai/docs/security, https://streamdown.ai/docs/plugins/code and https://streamdown.ai/docs/styling.
