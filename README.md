# title-TODO

Magic TODO lists powered by LLMs. A Next.js app with a SQLite backend (Drizzle ORM) where Claude helps you capture, triage, and reorganize tasks:

- **Magic input** — dump free-form text and the model turns it into todos in the right lists, with reminders (undo with one tap)
- **Reminders** — Web Push to the home-screen app when a todo's reminder time arrives (once per reminder or snooze; tapping opens that todo), an app-icon badge counting due items, and a "Due now" section in the Inbox
- **Repeating todos** — completing a todo with a cadence ("weekly", "every 3 days", "monthly"...) schedules its next occurrence instead of closing it
- **Snooze** to sensible times (this evening, tomorrow morning, the weekend, next week); deleted todos go to the trash (status `archived`) with Undo and are purged after 30 days
- **Ask** — questions about a list ("what should I do first?")
- **Refactor** — chat with Sonnet about reorganizing lists, then Implement: the server extracts the agreed changes as typed actions (structured outputs) and applies each in a transaction
- **Quick add from anywhere on the phone** — an iOS Shortcut posts text to `/api/quick-add` (see below)
- **List editing** — rename, describe, recategorize, mark timeless or delete a list from its header (the sidebar also supports double-click rename and drag on desktop)
- Priority voting, search (⌘K), inbox filter, copy a view as Markdown/JSON

## Access and hosting

Runs on the home server `perihelion` in Docker as a production build (`next build` + `next start`):
**https://perihelion.tail18d97e.ts.net/** (tailnet only, published with `tailscale serve --https=443 http://127.0.0.1:3000`).

- Data (`todos.db` + the JSON state files) lives in `/srv/data/title-todo`, snapshotted hourly; a pre-backup hook takes a consistent SQLite copy.
- `ANTHROPIC_API_KEY` and the Web Push keys (`VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`) are in `/srv/secrets/title-todo.env` on perihelion (source of truth: 1Password). Without the VAPID keys, notifications are simply off.
- Background work: `src/instrumentation.ts` starts a once-a-minute loop in the server process that sends reminder pushes (`src/lib/reminders.ts`) and empties the trash (`src/lib/trash.ts`); `public/sw.js` shows pushes. Enable per device from the sidebar (iOS: only inside the installed home-screen app).
- Deploy: `rsync -a --delete --exclude-from=.dockerignore ./ perihelion:/srv/apps/title-todo/ && ssh perihelion 'cd /srv/apps/title-todo && docker compose up -d --build'`
- Logs: `ssh perihelion 'docker logs title-todo-title-todo-1'`

The old Mac LaunchAgent (`com.adamkaufman.title-todo`) is disabled.

## Quick add from iOS (Shortcuts)

`POST /api/quick-add` takes `{"text": "..."}` (or a plain-text body), runs it through magic input, and replies with one plain-text line per todo created, e.g. `Pick up dry cleaning → Errands (tomorrow 6:00 PM)`. It's tailnet-only like the rest of the app, so the phone needs Tailscale connected.

To set it up in the Shortcuts app: new shortcut named "Add to TODO" →
1. In its settings (the ⓘ button), turn on **Show in Share Sheet** and accept Text and URLs.
2. **Receive** Text and URLs from Share Sheet; **if there's no input: Ask For** Text (so it also works from Siri, the home screen or the Action button).
3. **Get Contents of URL** `https://perihelion.tail18d97e.ts.net/api/quick-add`, Method POST, Request Body JSON with key `text` = Shortcut Input.
4. **Show Notification** with Contents of URL.

Then "Hey Siri, add to TODO", the share sheet in Safari/Notes/Messages, or the Action button (Settings → Action Button → Shortcut) all add todos.

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
src/app/api/      ask, categories, inbox-filter, lists, magic, push, quick-add, refactor, todos
src/components/   UI: Sidebar, TodoCard, TodoEditor, MagicInput, AskAboutList, ...
src/db/           Drizzle schema + SQLite connection
src/lib/          Server: Anthropic client (structured outputs), magic input, refactor actions, cadence, push, reminders, trash.
                  Client: use-todos (state + mutations), api, export, snooze, push-client
src/prompts/      Prompt templates (.txt) for each LLM feature
data/todos.db     SQLite fallback location (see below)
```

**Where the data lives:** `$TITLE_TODO_DATA_DIR` if set (perihelion: `/srv/data/title-todo`), else the iCloud folder `~/Library/Mobile Documents/com~apple~CloudDocs/title-TODO/` (the old Mac location, now a stale copy), else `data/` in the repo (see `src/lib/paths.ts`).

Schema changes: new tables/columns are created idempotently at startup in `src/db/index.ts`. Avoid `npm run db:push` (drizzle-kit) against the live database — it has proposed destructive rebuilds.
