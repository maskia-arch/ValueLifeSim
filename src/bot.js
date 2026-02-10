const { Telegraf, Markup } = require('telegraf');
const fs = require('fs');
const path = require('path');
const { readSave, writeSave } = require('./storage/save');
const { initGameState } = require('./game/state');
const Engine = require('./game/engine');
const Render = require('./ui/render');
const config = require('./config');

const bot = new Telegraf(process.env.BOT_TOKEN);

const mainKeys = Markup.inlineKeyboard([
  [Markup.button.callback('➕ Ein Jahr älter', 'age_up')],
  [Markup.button.callback('📊 Status', 'status'), Markup.button.callback('👥 Beziehungen', 'rel')],
  [Markup.button.callback('🌳 Stammbaum', 'tree'), Markup.button.callback('⚙️ Reset', 'reset')]
]);

async function runSetup(ctx, state) {
  const p = state.persons[state.current_id];
  if (!p) return ctx.reply("Fehler beim Laden des Charakters. Nutze /start.");
  
  if (!p.name) return ctx.reply("Wie soll dein Charakter heißen?");
  if (!p.gender) {
    return ctx.reply(`Wähle dein Geschlecht für ${p.name}:`, Markup.inlineKeyboard([
      [Markup.button.callback('♂ Männlich', 'set_gender_M'), Markup.button.callback('♀ Weiblich', 'set_gender_W')]
    ]));
  }
  state.setupComplete = true;
  await writeSave(ctx.from.id, state);
  return ctx.reply(`Das Abenteuer beginnt, ${p.name}!`, mainKeys);
}

bot.start(async (ctx) => {
  try {
    let state = await readSave(ctx.from.id);
    if (!state) {
      state = initGameState(ctx.from.id);
      await writeSave(ctx.from.id, state);
    }
    if (!state.setupComplete) return runSetup(ctx, state);
    ctx.reply(`Willkommen zurück v${config.version}!`, mainKeys);
  } catch (e) { console.error(e); }
});

bot.on('text', async (ctx) => {
  let state = await readSave(ctx.from.id);
  if (state && !state.setupComplete) {
    const p = state.persons[state.current_id];
    if (p && !p.name) {
      p.name = ctx.message.text.trim();
      await writeSave(ctx.from.id, state);
      return runSetup(ctx, state);
    }
  }
});

bot.action(/set_gender_(.*)/, async (ctx) => {
  await ctx.answerCbQuery();
  let state = await readSave(ctx.from.id);
  if (state && !state.setupComplete) {
    state.persons[state.current_id].gender = ctx.match[1];
    await writeSave(ctx.from.id, state);
    return runSetup(ctx, state);
  }
});

bot.action('age_up', async (ctx) => {
  await ctx.answerCbQuery();
  const state = await readSave(ctx.from.id);
  const result = Engine.nextYear(state);
  const p = state.persons[state.current_id];

  if (result.type === 'death') {
    return ctx.reply(`💀 Gestorben mit ${p.age}. /start für Neuanfang.`);
  }

  if (result.type === 'event') {
    const choices = result.data.choices.map((c, i) => [Markup.button.callback(c.text, `choice_${result.data.id}_${i}`)]);
    await ctx.reply(`*Jahr ${p.age}*\n\n${result.data.text}`, { parse_mode: 'Markdown', ...Markup.inlineKeyboard(choices) });
  } else {
    await ctx.reply(`Du bist jetzt ${p.age} Jahre alt.`, mainKeys);
  }
  await writeSave(ctx.from.id, state);
});

bot.action('rel', async (ctx) => {
  await ctx.answerCbQuery();
  const state = await readSave(ctx.from.id);
  ctx.replyWithMarkdown(Render.relationships(state), mainKeys);
});

bot.action('status', async (ctx) => {
  await ctx.answerCbQuery();
  const state = await readSave(ctx.from.id);
  ctx.replyWithMarkdown(Render.status(state.persons[state.current_id]), mainKeys);
});

bot.action('tree', async (ctx) => {
  await ctx.answerCbQuery();
  const state = await readSave(ctx.from.id);
  ctx.replyWithMarkdown(Render.tree(state), mainKeys);
});

bot.action('reset', async (ctx) => {
  await ctx.answerCbQuery();
  const state = initGameState(ctx.from.id);
  await writeSave(ctx.from.id, state);
  ctx.reply("Spiel zurückgesetzt.");
  return runSetup(ctx, state);
});

module.exports = bot;
