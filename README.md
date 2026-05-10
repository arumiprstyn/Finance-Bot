# 💸 Finance Telegram Bot

A Telegram bot for personal finance management — helping users track income, expenses, and financial activities directly from Telegram.

## ✨ Features

- 📥 Add income records
- 📤 Add expense records
- 📊 Financial summary report
- 📅 Daily / Monthly recap
- 🔔 Smart reminders
- 💾 Database integration
- 🤖 Telegram bot automation
- 🔐 Secure environment configuration using `.env`

## 🛠️ Tech Stack

- TypeScript
- Node.js
- pnpm Workspace
- PostgreSQL
- Prisma ORM
- Telegram Bot API

## 📂 Project Structure

```bash
finance-telegram-bot/
│── apps/
│── packages/
│── .env
│── .gitignore
│── package.json
│── pnpm-workspace.yaml
│── tsconfig.json
```

## ⚙️ Installation

Clone repository:

```bash
git clone <your-repo-url>
cd finance-telegram-bot
```

Install dependencies:

```bash
pnpm install
```

Create `.env` file:

```env
DATABASE_URL=your_database_url
TELEGRAM_BOT_TOKEN=your_telegram_bot_token
```

Push schema:

```bash
pnpm --filter @workspace/db run push
```

Run bot:

```bash
pnpm --filter @workspace/api-server run dev
```

## 🔒 Environment Variables

| Variable | Description |
|---------|-------------|
| DATABASE_URL | PostgreSQL connection string |
| TELEGRAM_BOT_TOKEN | Telegram bot token |

## 🚀 Usage

Open Telegram → search your bot → start chatting:

```bash
/start
```

Example:

```bash
/addincome 500000
/addexpense 120000
/report
```

## 📸 Preview

_Add your bot screenshot here_

## 🤝 Contributing

Pull requests are welcome. For major changes, please open an issue first.

## 📜 License

MIT License

---

### Built with ❤️ using TypeScript & Telegram API
