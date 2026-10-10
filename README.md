# title-TODO

Magic TODO lists powered by LLMs. A Next.js app with a SQLite backend (Drizzle ORM) where Claude helps you capture, triage, and reorganize tasks:

- **Magic input** — dump free-form text and the model turns it into todos in the right lists, with reminders (undo with one tap)
- **Reminders** — Web Push to the home-screen app when a todo's reminder time arrives (once per reminder or snooze; tapping opens that todo), an app-icon badge counting due items, and a "Due now" section in the Inbox
- **Repeating todos** — completing a todo with a cadence ("weekly", "every 3 days", "monthly"...) schedules its next occurrence instead of closing it
- **Snooze** to sensible times (this evening, tomorrow morning, the weekend, next week); deleted todos go to the trash (status `archived`) with Undo
- **Ask** — questions about a list ("what should I do first?")
- **Refactor** — chat with Sonnet about reorganizing lists, then Implement: the server extracts the agreed changes as typed actions (structured outputs) and applies each in a transaction
- **Obsidian import** — triage notes with Haiku, plan with Sonnet, apply the plan (needs the vault; unavailable on perihelion)
- Priority voting, search (⌘K), inbox filter, copy a view as Markdown/JSON

## Access and hosting

Runs on the home server `perihelion` in Docker as a production build (`next build` + `next start`):
**https://perihelion.tail18d97e.ts.net/** (tailnet only, published with `tailscale serve --https=443 http://127.0.0.1:3000`).

- Data (`todos.db` + the JSON state files) lives in `/srv/data/title-todo`, snapshotted hourly; a pre-backup hook takes a consistent SQLite copy.
- `ANTHROPIC_API_KEY` and the Web Push keys (`VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`) are in `/srv/secrets/title-todo.env` on perihelion (source of truth: 1Password). Without the VAPID keys, notifications are simply off.
- Notifications: `src/instrumentation.ts` starts a once-a-minute loop (`src/lib/reminders.ts`) in the server process; `public/sw.js` shows pushes. Enable per device from the sidebar (iOS: only inside the installed home-screen app).
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
src/lib/          Server: Anthropic client (structured outputs), todo import, refactor actions, cadence, push, reminders, Obsidian.
                  Client: use-todos (state + mutations), api, export, snooze, push-client
src/prompts/      Prompt templates (.txt) for each LLM feature
data/todos.db     SQLite fallback location (see below)
```

**Where the data lives:** `$TITLE_TODO_DATA_DIR` if set (perihelion: `/srv/data/title-todo`), else the iCloud folder `~/Library/Mobile Documents/com~apple~CloudDocs/title-TODO/` (the old Mac location, now a stale copy), else `data/` in the repo (see `src/lib/paths.ts`).

Schema changes: new tables/columns are created idempotently at startup in `src/db/index.ts`. Avoid `npm run db:push` (drizzle-kit) against the live database — it has proposed destructive rebuilds.
