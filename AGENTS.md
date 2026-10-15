<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## pebble development workflow

- Product branding is lowercase pebble; the character name is a separate user choice. Follow [UI copy guidance](docs/ui-copy.md). Keep implementation notes in documentation, and explain permissions, missing fields and connection states in plain product language.
- Use Bun. Keep verification proportional to this hackathon: a focused core-flow smoke check plus important regressions. Reuse existing tests; do not grow exhaustive suites or repeat viewport/build matrices for small changes.
- Preserve live tmux services and connected accounts. Isolate build/test output from the running preview's .next directory. Do not restart the owner, change grants, inspect secrets or make model calls/sends without the applicable user authorization.
- Make a local checkpoint commit after a meaningful milestone or roughly four hours of active development with substantive uncommitted work, whichever comes first. Do not make empty or per-edit micro commits. Review the staged diff and secret exclusions before committing. Use the existing Git identity; ask if it is absent. Do not push, create a remote or rewrite history unless separately authorized.
- Never commit .env files, authentication/session state, .pebble, browser profiles, runtime databases, imported messages, logs, node_modules or build output. Generated screenshots stay local by default. Stage explicit project files rather than broad unreviewed directories.
