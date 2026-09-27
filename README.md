# title-TODO

Magic TODO lists powered by LLMs. A Next.js app with a SQLite backend (Drizzle ORM) where Claude helps you capture, triage, and reorganize tasks:

- **Magic input** — dump free-form text and let the model turn it into structured todos
- **Ask** — ask questions about a list ("what should I do first?")
- **Refactor** — have the model reorganize/merge/split lists, with undo
- **Obsidian sync** — triage items from an Obsidian vault into lists
- Manual priority sorting, inline editing, auto-refresh

## Access and hosting

Runs on the home server `perihelion` in Docker as a production build (`next build` + `next start`):
**https://perihelion.tail18d97e.ts.net/** (tailnet only, published with `tailscale serve --https=443 http://127.0.0.1:3000`).

- Data (`todos.db` + the JSON state files) lives in `/srv/data/title-todo`, snapshotted hourly; a pre-backup hook takes a consistent SQLite copy.
- `ANTHROPIC_API_KEY` is in `/srv/secrets/title-todo.env` on perihelion (source of truth: 1Password).
- Obsidian import only works where the vault exists (`OBSIDIAN_NOTES_DIR`, default `~/Documents/Adam's Notes` on the Mac); on perihelion those routes return 503.
- Deploy: `rsync -a --delete --exclude-from=.dockerignore ./ perihelion:/srv/apps/title-todo/ && ssh perihelion 'cd /srv/apps/title-todo && docker compose up -d --build'`
- Logs: `ssh perihelion 'docker logs title-todo-title-todo-1'`

The old Mac LaunchAgent (`com.adamkaufman.title-todo`) is disabled.

## Development

```bash
npm install
npm run dev        # same as npm start: next dev -H 0.0.0.0 (port 3000)
```

Requires a `.env` in the project root:

```
ANTHROPIC_API_KEY=sk-ant-...
```

(If the launchd service is running, stop it first or the port will be taken.)

## Layout

```
src/app/          Next.js app router (pages + API routes)
src/app/api/      ask, inbox-filter, lists, magic, obsidian, refactor, todos
src/components/   UI: Sidebar, TodoCard, TodoEditor, MagicInput, AskAboutList, ...
src/db/           Drizzle schema + SQLite connection
src/lib/          Anthropic client, prompt loading, priority logic, types
src/prompts/      Prompt templates (.txt) for each LLM feature
scripts/          obsidian-triage.ts
data/todos.db     SQLite fallback location (see below)
```

**Where the data lives:** `$TITLE_TODO_DATA_DIR` if set (perihelion: `/srv/data/title-todo`), else the iCloud folder `~/Library/Mobile Documents/com~apple~CloudDocs/title-TODO/` (the old Mac location, now a stale copy), else `data/` in the repo (see `src/lib/paths.ts`).

Schema changes: new tables/columns are created idempotently at startup in `src/db/index.ts`. Avoid `npm run db:push` (drizzle-kit) against the live database — it has proposed destructive rebuilds.
