const { Telegraf, Markup } = require('telegraf');
const fs = require('fs');
const path = require('path');
const { readSave, writeSave } = require('./storage/save');
const { initGameState, getRandomName, finalizeParentsCulture, createPerson } = require('./game/state');
const Engine = require('./game/engine');
const Render = require('./ui/render');
const config = require('./config');

const bot = new Telegraf(process.env.BOT_TOKEN);

// --- HILFSFUNKTIONEN ---

async function isMessageValid(ctx, state) {
  if (!state.setupComplete) return true; 
  const currentMsgId = ctx.callbackQuery?.message?.message_id;
  // Validierung gegen die gepinnte Nachricht
  if (state.pinMessageId && currentMsgId !== state.pinMessageId) {
    await ctx.answerCbQuery("⚠️ Bitte nutze das angeheftete Menü oben.", { show_alert: true });
    return false;
  }
  return true;
}

async function bulkDelete(ctx, startId, count = 20) {
  const userId = ctx.from.id;
  for (let i = 0; i < count; i++) {
    try {
      await ctx.telegram.deleteMessage(userId, startId - i);
    } catch (err) {}
  }
}

/**
 * Kernfunktion für das UI: Aktualisiert die gepinnte Nachricht
 */
async function sendUpdate(ctx, state, text, keyboard) {
  const userId = ctx.from.id;

  if (state.pinMessageId) {
    try {
      await ctx.telegram.editMessageText(userId, state.pinMessageId, null, text, {
        parse_mode: 'Markdown',
        reply_markup: keyboard.reply_markup
      });
      await writeSave(userId, state);
      return;
    } catch (err) {
      // Falls Edit fehlschlägt (z.B. Nachricht gelöscht)
    }
  }

  const msg = await ctx.replyWithMarkdown(text, keyboard);
  state.lastMessageId = msg.message_id;

  if (state.setupComplete && !state.pinMessageId) {
    state.pinMessageId = msg.message_id;
    try {
      await ctx.telegram.pinChatMessage(userId, msg.message_id);
    } catch (e) {}
  }
  
  await writeSave(userId, state);
}

const getMainKeys = (state) => {
  if (state.isGameOver) return Markup.inlineKeyboard([[Markup.button.callback('⚙️ Neustart', 'reset')]]);
  const p = state.persons[state.current_id];
  
  const rows = [
    [Markup.button.callback('➕ Ein Jahr älter', 'age_up')]
  ];

  // Dynamische Zeile: Aktivitäten erst ab 16 Jahren
  const socialRow = [Markup.button.callback('👥 Beziehungen', 'rel')];
  if (p.age >= 16) {
    socialRow.push(Markup.button.callback('🎡 Aktivitäten', 'activities'));
  }
  rows.push(socialRow);

  rows.push([Markup.button.callback('📖 Tagebuch', 'diary'), Markup.button.callback('🌳 Stammbaum', 'tree')]);
  rows.push([Markup.button.callback('⚙️ Reset', 'reset')]);
  
  return Markup.inlineKeyboard(rows);
};

// --- HANDLERS ---

bot.start(async (ctx) => {
  const state = initGameState(ctx.from.id);
  await writeSave(ctx.from.id, state);
  return runSetup(ctx, state);
});

async function runSetup(ctx, state) {
  if (!state || !state.persons || !state.current_id) return ctx.reply("Fehler. /start nutzen.");
  const p = state.persons[state.current_id];
  
  if (!p.name) {
    state.setupStep = 'name';
    await writeSave(ctx.from.id, state);
    return ctx.reply("Willkommen! Wie lautet dein Name (Vor- & Nachname)?");
  }
  
  if (!p.gender) {
    state.setupStep = 'gender';
    await writeSave(ctx.from.id, state);
    return ctx.reply(`Hallo ${p.name}! Wähle dein Geschlecht:`, Markup.inlineKeyboard([
      [Markup.button.callback('♂ Männlich', 'set_gender_M'), Markup.button.callback('♀ Weiblich', 'set_gender_W')]
    ]));
  }

  if (!state.country) {
    state.setupStep = 'country';
    await writeSave(ctx.from.id, state);
    const countries = ["Germany", "USA", "Turkey", "Japan"];
    const countryButtons = countries.map(c => [Markup.button.callback(c, `set_country_${c}`)]);
    return ctx.reply("In welchem Land wirst du geboren?", Markup.inlineKeyboard(countryButtons));
  }
  
  state.setupComplete = true;
  state.diary.push(`🌟 Du wurdest als ${p.name} in ${state.country} geboren.`);
  
  const currentMsgId = ctx.callbackQuery?.message?.message_id || state.lastMessageId;
  await bulkDelete(ctx, currentMsgId, 15);
  
  await sendUpdate(ctx, state, Render.status(p, state), getMainKeys(state));
}

// --- SEXUALITÄT HANDLER (NEU/FIXED) ---
bot.action(/^set_sex_(.*)$/, async (ctx) => {
  const state = await readSave(ctx.from.id);
  if (!state || !await isMessageValid(ctx, state)) return;
  const p = state.persons[state.current_id];
  
  p.sexuality = ctx.match[1];
  p.hasSetSexuality = true;
  state.setupStep = 'done';

  await ctx.answerCbQuery(`Orientierung: ${ctx.match[1]}`);
  // Kehre zum Hauptmenü zurück
  await sendUpdate(ctx, state, Render.status(p, state), getMainKeys(state));
});

bot.action('age_up', async (ctx) => {
  const state = await readSave(ctx.from.id);
  if (!await isMessageValid(ctx, state)) return;
  await ctx.answerCbQuery();
  
  const result = Engine.nextYear(state);
  const p = state.persons[state.current_id];

  // Spezialfall 16 Jahre: Sexualitätsabfrage im gepinnten Menü
  if (p.age === 16 && !p.hasSetSexuality) {
    const text = "✨ Du wirst erwachsen! Was ist deine Orientierung?";
    const keys = Markup.inlineKeyboard([
      [Markup.button.callback('👫 Hetero', 'set_sex_hetero')],
      [Markup.button.callback('👬 Homo', 'set_sex_homo')],
      [Markup.button.callback('🌍 Bi', 'set_sex_bi')]
    ]);
    return sendUpdate(ctx, state, text, keys);
  }

  let msgText = Render.status(p, state);
  if (result.type === 'event') {
    msgText = `*Ereignis!*\n\n${result.data.text}`;
    const keys = Markup.inlineKeyboard(result.data.choices.map((c, i) => [
      Markup.button.callback(c.text, `choice_${result.data.id}_${i}`)
    ]));
    return sendUpdate(ctx, state, msgText, keys);
  }
  
  await sendUpdate(ctx, state, msgText, getMainKeys(state));
});

// --- NAVIGATION ---

bot.action('main_menu', async (ctx) => {
  const state = await readSave(ctx.from.id);
  if (!await isMessageValid(ctx, state)) return;
  await sendUpdate(ctx, state, Render.status(state.persons[state.current_id], state), getMainKeys(state));
});

bot.action('activities', async (ctx) => {
  const state = await readSave(ctx.from.id);
  if (!await isMessageValid(ctx, state)) return;
  const text = "🎡 *Was möchtest du unternehmen?*";
  const keyboard = Markup.inlineKeyboard([
    [Markup.button.callback('💃 Disco (100€)', 'act_disco'), Markup.button.callback('📱 Finder', 'act_finder')],
    [Markup.button.callback('⬅️ Zurück', 'main_menu')]
  ]);
  await sendUpdate(ctx, state, text, keyboard);
});

bot.action('rel', async (ctx) => {
  const state = await readSave(ctx.from.id);
  if (!await isMessageValid(ctx, state)) return;
  const { text, keyboard } = Render.relationships(state);
  await sendUpdate(ctx, state, text, keyboard);
});

// ... Restliche Handler (Reset, Country, Gender etc.) bleiben gleich

bot.action('reset', async (ctx) => {
  const userId = ctx.from.id;
  const state = await readSave(userId);
  if (state && state.pinMessageId) {
    try {
      await ctx.telegram.unpinChatMessage(userId, { message_id: state.pinMessageId });
      await ctx.telegram.deleteMessage(userId, state.pinMessageId);
    } catch (e) {}
  }
  await bulkDelete(ctx, ctx.callbackQuery.message.message_id, 35);
  const newState = initGameState(userId);
  await writeSave(userId, newState);
  await ctx.answerCbQuery("Reset...");
  return runSetup(ctx, newState);
});

bot.on('text', async (ctx) => {
  const userId = ctx.from.id;
  let state = await readSave(userId);
  if (!state) return;
  if (!state.setupComplete && state.setupStep === 'name') {
    const input = ctx.message.text.trim();
    if (input.split(' ').length < 2) return ctx.reply("❌ Vor- & Nachnamen!");
    state.familyLastName = input.split(' ').pop();
    state.persons[state.current_id].name = input;
    state.setupStep = 'gender';
    await writeSave(userId, state);
    return runSetup(ctx, state);
  }
});

bot.action(/set_country_(.*)/, async (ctx) => {
  const state = await readSave(ctx.from.id);
  state.country = ctx.match[1];
  finalizeParentsCulture(state, state.country);
  return runSetup(ctx, state);
});

bot.action(/set_gender_(.*)/, async (ctx) => {
  const state = await readSave(ctx.from.id);
  state.persons[state.current_id].gender = ctx.match[1].includes('M') ? 'M' : 'W';
  return runSetup(ctx, state);
});

bot.action('tree', async (ctx) => {
  const state = await readSave(ctx.from.id);
  await sendUpdate(ctx, state, Render.tree(state), getMainKeys(state));
});

bot.action('diary', async (ctx) => {
  const state = await readSave(ctx.from.id);
  await sendUpdate(ctx, state, Render.diary(state), getMainKeys(state));
});

bot.on('callback_query', async (ctx) => { await ctx.answerCbQuery(); });

bot.launch
