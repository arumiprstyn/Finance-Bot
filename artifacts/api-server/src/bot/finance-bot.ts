import { Telegraf, Context } from "telegraf";
import { db } from "@workspace/db";
import { transactionsTable, budgetsTable } from "@workspace/db";
import { eq, and, sql, desc } from "drizzle-orm";
import { logger } from "../lib/logger";

const BOT_TOKEN = process.env["TELEGRAM_BOT_TOKEN"];

if (!BOT_TOKEN) {
  throw new Error("TELEGRAM_BOT_TOKEN is required");
}

export const bot = new Telegraf(BOT_TOKEN);

const HELP_TEXT = `💰 *Finance Bot Commands*

*Adding transactions:*
/expense \`<amount> <category> [note]\`
/income \`<amount> [note]\`

*Viewing data:*
/balance — current balance
/summary — this month by category
/history — last 10 transactions

*Budgets:*
/budget \`<category> <amount>\` — set monthly budget
/budgets — view budget progress

*Other:*
/delete \`<id>\` — delete a transaction
/categories — list expense categories
/help — show this message

*Example:*
\`/expense 45000 food Lunch at cafe\`
\`/income 3000000 Salary\`
\`/budget food 500000\``;

const DEFAULT_CATEGORIES = [
  "food",
  "transport",
  "housing",
  "health",
  "entertainment",
  "shopping",
  "utilities",
  "education",
  "other",
];

function formatAmount(amount: string | number): string {
  return Number(amount).toLocaleString("id-ID", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

function formatDate(date: Date): string {
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function getCurrentMonthRange() {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
  return { start, end };
}

function buildProgressBar(pct: number, length = 10): string {
  const filled = Math.min(Math.round((pct / 100) * length), length);
  return "█".repeat(filled) + "░".repeat(length - filled);
}

function getMessageText(ctx: Context): string {
  if (ctx.message && "text" in ctx.message) return ctx.message.text;
  return "";
}

bot.command("start", async (ctx: Context) => {
  const name = ctx.from?.first_name ?? "there";
  await ctx.replyWithMarkdown(
    `👋 Hello, *${name}*! I'm your personal finance tracker.\n\n${HELP_TEXT}`
  );
});

bot.command("help", async (ctx: Context) => {
  await ctx.replyWithMarkdown(HELP_TEXT);
});

bot.command("expense", async (ctx: Context) => {
  const chatId = ctx.chat?.id;
  if (!chatId) return;

  const args = getMessageText(ctx).replace(/^\/expense\s*/i, "").trim();
  const parts = args.split(/\s+/);
  const rawAmount = parts[0];
  const category = parts[1]?.toLowerCase();
  const description = parts.slice(2).join(" ") || undefined;

  if (!rawAmount || !category) {
    await ctx.reply("Usage: /expense <amount> <category> [note]\nExample: /expense 45.50 food Lunch");
    return;
  }

  const amount = parseFloat(rawAmount);
  if (isNaN(amount) || amount <= 0) {
    await ctx.reply("❌ Invalid amount. Please enter a positive number.");
    return;
  }

  try {
    const [tx] = await db.insert(transactionsTable).values({
      chatId,
      amount: amount.toFixed(2),
      type: "expense",
      category,
      description: description ?? null,
    }).returning();

    await ctx.replyWithMarkdown(
      `✅ *Expense recorded* (ID: ${tx!.id})\n` +
      `💸 -Rp ${formatAmount(amount)} · ${category}` +
      (description ? `\n📝 ${description}` : "")
    );
  } catch (err) {
    logger.error({ err }, "Failed to record expense");
    await ctx.reply("❌ Failed to record expense. Please try again.");
  }
});

bot.command("income", async (ctx: Context) => {
  const chatId = ctx.chat?.id;
  if (!chatId) return;

  const args = getMessageText(ctx).replace(/^\/income\s*/i, "").trim();
  const parts = args.split(/\s+/);
  const rawAmount = parts[0];
  const description = parts.slice(1).join(" ") || undefined;

  if (!rawAmount) {
    await ctx.reply("Usage: /income <amount> [note]\nExample: /income 3000 Monthly salary");
    return;
  }

  const amount = parseFloat(rawAmount);
  if (isNaN(amount) || amount <= 0) {
    await ctx.reply("❌ Invalid amount. Please enter a positive number.");
    return;
  }

  try {
    const [tx] = await db.insert(transactionsTable).values({
      chatId,
      amount: amount.toFixed(2),
      type: "income",
      category: "income",
      description: description ?? null,
    }).returning();

    await ctx.replyWithMarkdown(
      `✅ *Income recorded* (ID: ${tx!.id})\n` +
      `💚 +Rp ${formatAmount(amount)}` +
      (description ? `\n📝 ${description}` : "")
    );
  } catch (err) {
    logger.error({ err }, "Failed to record income");
    await ctx.reply("❌ Failed to record income. Please try again.");
  }
});

bot.command("balance", async (ctx: Context) => {
  const chatId = ctx.chat?.id;
  if (!chatId) return;

  try {
    const result = await db
      .select({
        type: transactionsTable.type,
        total: sql<string>`SUM(${transactionsTable.amount})`,
      })
      .from(transactionsTable)
      .where(eq(transactionsTable.chatId, chatId))
      .groupBy(transactionsTable.type);

    let totalIncome = 0;
    let totalExpenses = 0;

    for (const row of result) {
      if (row.type === "income") totalIncome = parseFloat(row.total ?? "0");
      if (row.type === "expense") totalExpenses = parseFloat(row.total ?? "0");
    }

    const balance = totalIncome - totalExpenses;
    const emoji = balance >= 0 ? "🟢" : "🔴";

    await ctx.replyWithMarkdown(
      `*📊 Your Balance*\n\n` +
      `💚 Total Income: *Rp ${formatAmount(totalIncome)}*\n` +
      `💸 Total Expenses: *Rp ${formatAmount(totalExpenses)}*\n` +
      `${emoji} Balance: *Rp ${formatAmount(balance)}*`
    );
  } catch (err) {
    logger.error({ err }, "Failed to get balance");
    await ctx.reply("❌ Failed to retrieve balance.");
  }
});

bot.command("summary", async (ctx: Context) => {
  const chatId = ctx.chat?.id;
  if (!chatId) return;

  const { start, end } = getCurrentMonthRange();

  try {
    const rows = await db
      .select({
        category: transactionsTable.category,
        type: transactionsTable.type,
        total: sql<string>`SUM(${transactionsTable.amount})`,
      })
      .from(transactionsTable)
      .where(
        and(
          eq(transactionsTable.chatId, chatId),
          sql`${transactionsTable.createdAt} >= ${start}`,
          sql`${transactionsTable.createdAt} <= ${end}`
        )
      )
      .groupBy(transactionsTable.category, transactionsTable.type);

    if (rows.length === 0) {
      await ctx.reply("📭 No transactions this month yet. Start tracking with /expense or /income!");
      return;
    }

    const monthName = start.toLocaleDateString("en-US", { month: "long", year: "numeric" });
    let incomeTotal = 0;
    let expenseTotal = 0;
    const expenseByCategory: Record<string, number> = {};

    for (const row of rows) {
      const total = parseFloat(row.total ?? "0");
      if (row.type === "income") {
        incomeTotal += total;
      } else {
        expenseTotal += total;
        expenseByCategory[row.category] = (expenseByCategory[row.category] ?? 0) + total;
      }
    }

    const lines: string[] = [`*📅 ${monthName} Summary*\n`];
    lines.push(`💚 Income: *Rp ${formatAmount(incomeTotal)}*`);
    lines.push(`💸 Expenses: *Rp ${formatAmount(expenseTotal)}*`);
    lines.push(`${incomeTotal - expenseTotal >= 0 ? "🟢" : "🔴"} Net: *Rp ${formatAmount(incomeTotal - expenseTotal)}*`);

    if (Object.keys(expenseByCategory).length > 0) {
      lines.push(`\n*Expenses by Category:*`);
      const sorted = Object.entries(expenseByCategory).sort((a, b) => b[1] - a[1]);
      for (const [cat, total] of sorted) {
        const pct = expenseTotal > 0 ? ((total / expenseTotal) * 100).toFixed(0) : "0";
        lines.push(`  · ${cat}: Rp ${formatAmount(total)} (${pct}%)`);
      }
    }

    await ctx.replyWithMarkdown(lines.join("\n"));
  } catch (err) {
    logger.error({ err }, "Failed to get summary");
    await ctx.reply("❌ Failed to retrieve summary.");
  }
});

bot.command("history", async (ctx: Context) => {
  const chatId = ctx.chat?.id;
  if (!chatId) return;

  try {
    const rows = await db
      .select()
      .from(transactionsTable)
      .where(eq(transactionsTable.chatId, chatId))
      .orderBy(desc(transactionsTable.createdAt))
      .limit(10);

    if (rows.length === 0) {
      await ctx.reply("📭 No transactions yet. Start with /expense or /income!");
      return;
    }

    const lines: string[] = [`*🕐 Last ${rows.length} Transactions*\n`];
    for (const tx of rows) {
      const sign = tx.type === "income" ? "+" : "-";
      const emoji = tx.type === "income" ? "💚" : "💸";
      const note = tx.description ? ` · ${tx.description}` : "";
      lines.push(
        `${emoji} \`#${tx.id}\` ${sign}Rp ${formatAmount(tx.amount)} [${tx.category}]${note}\n` +
        `   _${formatDate(tx.createdAt)}_`
      );
    }

    await ctx.replyWithMarkdown(lines.join("\n"));
  } catch (err) {
    logger.error({ err }, "Failed to get history");
    await ctx.reply("❌ Failed to retrieve history.");
  }
});

bot.command("delete", async (ctx: Context) => {
  const chatId = ctx.chat?.id;
  if (!chatId) return;

  const args = getMessageText(ctx).replace(/^\/delete\s*/i, "").trim();
  const id = parseInt(args, 10);

  if (isNaN(id)) {
    await ctx.reply("Usage: /delete <id>\nExample: /delete 42\n\nFind IDs with /history");
    return;
  }

  try {
    const deleted = await db
      .delete(transactionsTable)
      .where(and(eq(transactionsTable.id, id), eq(transactionsTable.chatId, chatId)))
      .returning();

    if (deleted.length === 0) {
      await ctx.reply("❌ Transaction not found or it doesn't belong to you.");
      return;
    }

    const tx = deleted[0]!;
    await ctx.replyWithMarkdown(
      `🗑️ *Deleted transaction #${tx.id}*\n` +
      `${tx.type === "income" ? "💚 +" : "💸 -"}Rp ${formatAmount(tx.amount)} [${tx.category}]`
    );
  } catch (err) {
    logger.error({ err }, "Failed to delete transaction");
    await ctx.reply("❌ Failed to delete transaction.");
  }
});

bot.command("budget", async (ctx: Context) => {
  const chatId = ctx.chat?.id;
  if (!chatId) return;

  const args = getMessageText(ctx).replace(/^\/budget\s*/i, "").trim();
  const parts = args.split(/\s+/);
  const category = parts[0]?.toLowerCase();
  const rawAmount = parts[1];

  if (!category || !rawAmount) {
    await ctx.reply("Usage: /budget <category> <amount>\nExample: /budget food 500");
    return;
  }

  const amount = parseFloat(rawAmount);
  if (isNaN(amount) || amount <= 0) {
    await ctx.reply("❌ Invalid amount. Please enter a positive number.");
    return;
  }

  try {
    const existing = await db
      .select()
      .from(budgetsTable)
      .where(and(eq(budgetsTable.chatId, chatId), eq(budgetsTable.category, category)))
      .limit(1);

    if (existing.length > 0) {
      await db
        .update(budgetsTable)
        .set({ amount: amount.toFixed(2) })
        .where(and(eq(budgetsTable.chatId, chatId), eq(budgetsTable.category, category)));
      await ctx.replyWithMarkdown(`✅ *Budget updated*\n📦 ${category}: *Rp ${formatAmount(amount)}/month*`);
    } else {
      await db.insert(budgetsTable).values({
        chatId,
        category,
        amount: amount.toFixed(2),
      });
      await ctx.replyWithMarkdown(`✅ *Budget set*\n📦 ${category}: *Rp ${formatAmount(amount)}/month*`);
    }
  } catch (err) {
    logger.error({ err }, "Failed to set budget");
    await ctx.reply("❌ Failed to set budget.");
  }
});

bot.command("budgets", async (ctx: Context) => {
  const chatId = ctx.chat?.id;
  if (!chatId) return;

  const { start, end } = getCurrentMonthRange();

  try {
    const budgets = await db
      .select()
      .from(budgetsTable)
      .where(eq(budgetsTable.chatId, chatId));

    if (budgets.length === 0) {
      await ctx.reply("📭 No budgets set yet. Use /budget <category> <amount> to create one.");
      return;
    }

    const spentRows = await db
      .select({
        category: transactionsTable.category,
        total: sql<string>`SUM(${transactionsTable.amount})`,
      })
      .from(transactionsTable)
      .where(
        and(
          eq(transactionsTable.chatId, chatId),
          eq(transactionsTable.type, "expense"),
          sql`${transactionsTable.createdAt} >= ${start}`,
          sql`${transactionsTable.createdAt} <= ${end}`
        )
      )
      .groupBy(transactionsTable.category);

    const spentMap: Record<string, number> = {};
    for (const row of spentRows) {
      spentMap[row.category] = parseFloat(row.total ?? "0");
    }

    const monthName = start.toLocaleDateString("en-US", { month: "long", year: "numeric" });
    const lines: string[] = [`*📦 Budget Progress — ${monthName}*\n`];

    for (const b of budgets) {
      const limit = parseFloat(b.amount);
      const spent = spentMap[b.category] ?? 0;
      const pct = limit > 0 ? (spent / limit) * 100 : 0;
      const remaining = limit - spent;
      const bar = buildProgressBar(pct);
      const status = pct >= 100 ? "🔴" : pct >= 80 ? "🟡" : "🟢";

      lines.push(
        `${status} *${b.category}*\n` +
        `${bar} ${pct.toFixed(0)}%\n` +
        `  Rp ${formatAmount(spent)} / Rp ${formatAmount(limit)} · ${remaining >= 0 ? `Rp ${formatAmount(remaining)} left` : `Rp ${formatAmount(-remaining)} over`}`
      );
    }

    await ctx.replyWithMarkdown(lines.join("\n\n"));
  } catch (err) {
    logger.error({ err }, "Failed to get budgets");
    await ctx.reply("❌ Failed to retrieve budgets.");
  }
});

bot.command("categories", async (ctx: Context) => {
  const lines = [
    "*📋 Default Expense Categories*\n",
    ...DEFAULT_CATEGORIES.map((c) => `· ${c}`),
    "\nYou can use any category name with /expense",
  ];
  await ctx.replyWithMarkdown(lines.join("\n"));
});

bot.on("text", async (ctx: Context) => {
  if (ctx.message && "text" in ctx.message && !ctx.message.text.startsWith("/")) {
    await ctx.replyWithMarkdown("Use /help to see available commands. 💡");
  }
});

export function startBot(): void {
  bot.launch().then(() => {
    logger.info("Telegram bot started (polling)");
  }).catch((err: unknown) => {
    logger.error({ err }, "Telegram bot failed to start");
  });

  process.once("SIGINT", () => bot.stop("SIGINT"));
  process.once("SIGTERM", () => bot.stop("SIGTERM"));
}
