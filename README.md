# title-TODO

Magic TODO lists powered by LLMs. A Next.js app with a SQLite backend (Drizzle ORM) where Claude helps you capture, triage, and reorganize tasks:

- **Magic input** — dump free-form text and let the model turn it into structured todos
- **Ask** — ask questions about a list ("what should I do first?")
- **Refactor** — have the model reorganize/merge/split lists, with undo
- **Obsidian sync** — triage items from an Obsidian vault into lists
- Manual priority sorting, inline editing, auto-refresh

## Access

The app runs as an always-on service on the MacBook and is reachable from any device on the Tailscale network:

- **Mac:** http://localhost:3000
- **Any Tailscale device:** https://adams-macbook-pro-3.tail18d97e.ts.net/ (served over HTTPS by `tailscale serve`, tailnet only)
- Plain HTTP also still works at http://adams-macbook-pro-3:3000 or http://100.72.197.109:3000

The HTTPS address is what to use on the phone: it has a real certificate, so Chrome and Safari offer "Add to Home Screen" and the app launches full-screen with its own icon. The proxy was set up once with `tailscale serve --bg --https=443 http://127.0.0.1:3000` and persists across reboots; `tailscale serve status` shows it.

## Always-on service (launchd)

A LaunchAgent at `~/Library/LaunchAgents/com.adamkaufman.title-todo.plist` starts the app at login and restarts it if it crashes — same setup as `skrypt2` and `names-and-faces`. Logs go to `~/Library/Logs/title-todo.log`.

Useful commands:

```bash
# restart the service (e.g. after pulling changes)
launchctl kickstart -k gui/$(id -u)/com.adamkaufman.title-todo

# stop / start
launchctl bootout gui/$(id -u)/com.adamkaufman.title-todo
launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/com.adamkaufman.title-todo.plist

# tail logs
tail -f ~/Library/Logs/title-todo.log
```

The service runs `npm start`, which is the Next.js dev server bound to `0.0.0.0:3000` — so code changes hot-reload without a rebuild.

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

**Where the data actually lives:** the SQLite database is stored in iCloud for automatic backup — `~/Library/Mobile Documents/com~apple~CloudDocs/title-TODO/todos.db`. The repo's `data/todos.db` is only a fallback used when the iCloud directory doesn't exist (see `src/db/index.ts`).

Schema changes: new tables/columns are created idempotently at startup in `src/db/index.ts`. Avoid `npm run db:push` (drizzle-kit) against the live database — it has proposed destructive rebuilds.
