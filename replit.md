# Finance Telegram Bot

A Telegram bot that lets users track personal finances — log income and expenses, view monthly summaries, and manage category budgets — all from chat.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server + Telegram bot (port 5000)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string
- Required env: `TELEGRAM_BOT_TOKEN` — Telegram bot token from @BotFather

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- Bot: Telegraf (Telegram Bot API, long-polling mode)
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- Build: esbuild (CJS bundle)

## Where things live

- `artifacts/api-server/src/bot/finance-bot.ts` — all Telegram bot commands and logic
- `lib/db/src/schema/transactions.ts` — transactions table
- `lib/db/src/schema/budgets.ts` — monthly budgets table
- `lib/db/src/schema/index.ts` — schema barrel

## Bot Commands

| Command | Description |
|---|---|
| `/expense <amount> <category> [note]` | Log an expense |
| `/income <amount> [note]` | Log income |
| `/balance` | View all-time balance |
| `/summary` | Monthly income/expense breakdown by category |
| `/history` | Last 10 transactions |
| `/delete <id>` | Remove a transaction |
| `/budget <category> <amount>` | Set monthly budget for a category |
| `/budgets` | View budget progress with progress bars |
| `/categories` | List built-in expense categories |
| `/help` | Show help |

## Architecture decisions

- Bot uses long-polling (no webhook) for simplicity in development. Switch to webhooks for production using `bot.createWebhook()`.
- Each user is isolated by `chat_id` — data is per-conversation.
- Budgets are monthly and reset automatically (filtered by current month range).
- Amount stored as `numeric(12,2)` for precision; income is a regular transaction with `category = "income"`.

## User preferences

_Populate as you build — explicit user instructions worth remembering across sessions._

## Gotchas

- `TELEGRAM_BOT_TOKEN` must be set before starting the server or it will throw.
- For production deployment, consider switching to webhook mode to avoid long-polling conflicts.
- Always run `pnpm run typecheck:libs` after changing `lib/db` schema before typechecking the api-server.
