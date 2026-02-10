const { Telegraf, Markup } = require('telegraf');
const { readSave, writeSave } = require('./storage/save');
const { initGameState, createPerson } = require('./game/state');
const Engine = require('./game/engine');
const Render = require('./ui/render');
const config = require('./config'); // Wir holen uns die zentrale Config

const bot = new Telegraf(process.env.BOT_TOKEN);

const mainKeys = Markup.inlineKeyboard([
  [Markup.button.callback('➕ Ein Jahr älter', 'age_up')],
  [Markup.button.callback('📊 Status', 'status'), Markup.button.callback('🌳 Stammbaum', 'tree')],
  [Markup.button.callback('⚙️ Reset', 'reset')]
]);

bot.start(async (ctx) => {
  let state = await readSave(ctx.from.id);
  if (!state) {
    state = initGameState(ctx.from.id, ctx.from.first_name);
    await writeSave(ctx.from.id, state);
  }
  // NUTZT JETZT DIE VARIABLE AUS DER version.txt
  ctx.reply(`Willkommen bei ValueLifeSim v${config.version}, ${ctx.from.first_name}!`, mainKeys);
});

bot.action('age_up', async (ctx) => {
  try {
    await ctx.answerCbQuery(); // Stoppt die "Lade-Uhr" bei Telegram
    const state = await readSave(ctx.from.id);
    const result = Engine.nextYear(state);

    if (result.type === 'death') {
      const p = state.persons[state.current_id];
      await ctx.reply(`💀 ${p.name} ist im Alter von ${p.age} gestorben.`);
      return ctx.reply("Das Leben endet hier. /start für einen Neuanfang.");
    }

    const evt = result.data;
    const choices = evt.choices.map((c, i) => [Markup.button.callback(c.text, `choice_${evt.id}_${i}`)]);
    
    await ctx.editMessageText(`*Jahr ${state.persons[state.current_id].age}*\n\n${evt.text}`, {
      parse_mode: 'Markdown',
      ...Markup.inlineKeyboard(choices)
    });
    await writeSave(ctx.from.id, state);
  } catch (err) {
    console.error("Fehler in age_up:", err);
  }
});

bot.action(/^choice_(.*)_(.*)$/, async (ctx) => {
  const [_, eId, cIdx] = ctx.match;
  const state = await readSave(ctx.from.id);
  const events = require('../data/events.json');
  const event = events.find(e => e.id === eId);
  const choice = event.choices[cIdx];

  Engine.processChoice(state, choice);
  await writeSave(ctx.from.id, state);
  await ctx.answerCbQuery(choice.text);
  ctx.reply(choice.response, mainKeys);
});

bot.action('status', async (ctx) => {
  await ctx.answerCbQuery();
  const state = await readSave(ctx.from.id);
  const p = state.persons[state.current_id];
  ctx.replyWithMarkdown(Render.status(p), mainKeys);
});

bot.action('tree', async (ctx) => {
  await ctx.answerCbQuery();
  const state = await readSave(ctx.from.id);
  ctx.replyWithMarkdown(Render.tree(state), mainKeys);
});

bot.action('reset', async (ctx) => {
  await ctx.answerCbQuery("Spiel wird zurückgesetzt...");
  const state = initGameState(ctx.from.id, ctx.from.first_name);
  await writeSave(ctx.from.id, state);
  ctx.reply("Spiel zurückgesetzt.", mainKeys);
});

module.exports = bot;
