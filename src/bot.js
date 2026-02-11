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
  if (state.lastMessageId && currentMsgId !== state.lastMessageId) {
    await ctx.answerCbQuery("⚠️ Diese Nachricht ist veraltet.", { show_alert: true });
    return false;
  }
  return true;
}

/**
 * Löscht eine definierte Anzahl an Nachrichten rückwirkend ab einer ID
 */
async function bulkDelete(ctx, startId, count = 20) {
  const userId = ctx.from.id;
  for (let i = 0; i < count; i++) {
    try {
      await ctx.telegram.deleteMessage(userId, startId - i);
    } catch (err) {
      // Ignoriere Fehler (z.B. Nachricht zu alt oder bereits gelöscht)
    }
  }
}

async function clearChat(ctx, state) {
  if (state.lastMessageId) {
    try { await ctx.telegram.deleteMessage(ctx.from.id, state.lastMessageId); } catch (err) {}
  }
}

async function sendUpdate(ctx, state, text, keyboard) {
  await clearChat(ctx, state);
  const msg = await ctx.replyWithMarkdown(text, keyboard);
  state.lastMessageId = msg.message_id;
  await writeSave(ctx.from.id, state);
}

const getMainKeys = (state) => {
  if (state.isGameOver) return Markup.inlineKeyboard([[Markup.button.callback('⚙️ Neustart', 'reset')]]);
  const p = state.persons[state.current_id];
  const rows = [
    [Markup.button.callback('➕ Ein Jahr älter', 'age_up')],
    [Markup.button.callback('📊 Status', 'status'), Markup.button.callback('👥 Beziehungen', 'rel')]
  ];
  if (p.age >= 16) {
    rows.push([Markup.button.callback('🎡 Aktivitäten', 'activities'), Markup.button.callback('📖 Tagebuch', 'diary')]);
  } else {
    rows.push([Markup.button.callback('📖 Tagebuch', 'diary')]);
  }
  rows.push([Markup.button.callback('🌳 Stammbaum', 'tree'), Markup.button.callback('⚙️ Reset', 'reset')]);
  return Markup.inlineKeyboard(rows);
};

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
  
  // --- SETUP ABSCHLUSS: CHAT REINIGEN ---
  state.setupComplete = true;
  state.diary.push(`🌟 Du wurdest als ${p.name} in ${state.country} geboren.`);
  
  // Lösche die letzten 15 Nachrichten-IDs (Setup-Prozess)
  const currentMsgId = ctx.callbackQuery?.message?.message_id || state.lastMessageId;
  await bulkDelete(ctx, currentMsgId, 15);
  
  await sendUpdate(ctx, state, `✨ *Das Abenteuer beginnt!*\n\nDu wurdest in ${state.country} geboren.`, getMainKeys(state));
}

// --- COMMANDS ---

bot.start(async (ctx) => {
  const state = initGameState(ctx.from.id);
  await writeSave(ctx.from.id, state);
  return runSetup(ctx, state);
});

// --- TEXT HANDLER ---

bot.on('text', async (ctx) => {
  const userId = ctx.from.id;
  let state = await readSave(userId);
  if (!state) return;

  if (!state.setupComplete && state.setupStep === 'name') {
    const input = ctx.message.text.trim();
    if (input.split(' ').length < 2) return ctx.reply("❌ Bitte gib Vor- & Nachnamen an.");
    state.familyLastName = input.split(' ').pop();
    state.persons[state.current_id].name = input;
    state.setupStep = 'gender';
    state.lastMessageId = ctx.message.message_id; // Merken zum späteren Löschen
    await writeSave(userId, state);
    return runSetup(ctx, state);
  }
});

// --- GAMEPLAY ACTIONS ---

bot.action('age_up', async (ctx) => {
  const state = await readSave(ctx.from.id);
  if (!await isMessageValid(ctx, state)) return;
  await ctx.answerCbQuery();
  const result = Engine.nextYear(state);
  const p = state.persons[state.current_id];

  if (p.age === 16 && !p.hasSetSexuality) {
    state.setupStep = 'sexuality';
    await writeSave(ctx.from.id, state);
    return ctx.reply("✨ Du wirst erwachsen! Was ist deine Orientierung?", Markup.inlineKeyboard([
      [Markup.button.callback('👫 Hetero', 'set_sex_hetero')],
      [Markup.button.callback('👬 Homo', 'set_sex_homo')],
      [Markup.button.callback('🌍 Bi', 'set_sex_bi')]
    ]));
  }

  let msgText = `Du bist jetzt ${p.age} Jahre alt.`;
  let keys = getMainKeys(state);
  if (result.type === 'event') {
    msgText = `*Ereignis!*\n\n${result.data.text}`;
    keys = Markup.inlineKeyboard(result.data.choices.map((c, i) => [Markup.button.callback(c.text, `choice_${result.data.id}_${i}`)]));
  }
  await sendUpdate(ctx, state, msgText, keys);
});

// --- INTERAKTIONS-HANDLER ---

bot.action(/^act_talk_(.*)$/, async (ctx) => {
  const state = await readSave(ctx.from.id);
  const npc = state.persons[ctx.match[1]];
  npc.relationship = Math.min(100, (npc.relationship || 0) + 5);
  await ctx.answerCbQuery("💬 Gutes Gespräch!");
  await sendUpdate(ctx, state, `Du hast dich gut mit ${npc.name} unterhalten.`, getMainKeys(state));
});

bot.action(/^act_gift_(.*)$/, async (ctx) => {
  const state = await readSave(ctx.from.id);
  const p = state.persons[state.current_id];
  const npc = state.persons[ctx.match[1]];
  if (p.money < 20) return ctx.answerCbQuery("⚠️ Zu wenig Geld!", { show_alert: true });
  p.money -= 20;
  npc.relationship = Math.min(100, (npc.relationship || 0) + 15);
  await sendUpdate(ctx, state, `Du hast ${npc.name} ein Geschenk gekauft (+15% Beziehung).`, getMainKeys(state));
});

bot.action(/^act_askmoney_(.*)$/, async (ctx) => {
  const state = await readSave(ctx.from.id);
  const npc = state.persons[ctx.match[1]];
  const p = state.persons[state.current_id];
  if (Math.random() < (npc.relationship / 100)) {
    const amount = Math.floor(Math.random() * 30) + 10;
    p.money += amount;
    npc.relationship = Math.max(0, npc.relationship - 5);
    await ctx.answerCbQuery(`✅ Erfolg! +${amount}€`);
    await sendUpdate(ctx, state, `${npc.name} hat dir ${amount}€ gegeben.`, getMainKeys(state));
  } else {
    npc.relationship = Math.max(0, npc.relationship - 10);
    await ctx.answerCbQuery("❌ Abgelehnt.", { show_alert: true });
    await sendUpdate(ctx, state, `${npc.name} wollte dir kein Geld geben.`, getMainKeys(state));
  }
});

bot.action(/^interact_(.*)$/, async (ctx) => {
  const state = await readSave(ctx.from.id);
  const npcId = ctx.match[1];
  const npc = state.persons[npcId];
  const p = state.persons[state.current_id];
  const isParent = (npcId === p.motherId || npcId === p.fatherId);
  const isPartner = (npcId === p.partnerId);
  let text = `👥 *Interaktion mit ${npc.name}*\nBeziehung: ${npc.relationship}%`;
  const buttons = [[Markup.button.callback('💬 Reden', `act_talk_${npcId}`), Markup.button.callback('🎁 Geschenk', `act_gift_${npcId}`)]];
  if (isParent) buttons.push([Markup.button.callback('💰 Nach Geld fragen', `act_askmoney_${npcId}`)]);
  buttons.push([Markup.button.callback('⬅️ Zurück', 'rel')]);
  await sendUpdate(ctx, state, text, Markup.inlineKeyboard(buttons));
});

// --- NAVIGATION & SYSTEM ---

bot.action('reset', async (ctx) => {
  const userId = ctx.from.id;
  const state = await readSave(userId);
  const lastId = ctx.callbackQuery?.message?.message_id || state?.lastMessageId;
  if (lastId) await bulkDelete(ctx, lastId, 35);
  const newState = initGameState(userId);
  await writeSave(userId, newState);
  await ctx.answerCbQuery("Reset...");
  return runSetup(ctx, newState);
});

bot.action('status', async (ctx) => {
  const state = await readSave(ctx.from.id);
  await sendUpdate(ctx, state, Render.status(state.persons[state.current_id], state), getMainKeys(state));
});

bot.action('rel', async (ctx) => {
  const state = await readSave(ctx.from.id);
  const { text, keyboard } = Render.relationships(state);
  await sendUpdate(ctx, state, text, keyboard);
});

bot.action(/set_country_(.*)/, async (ctx) => {
  const state = await readSave(ctx.from.id);
  state.country = ctx.match[1];
  finalizeParentsCulture(state, state.country);
  await ctx.answerCbQuery();
  return runSetup(ctx, state);
});

bot.action(/set_gender_(.*)/, async (ctx) => {
  const state = await readSave(ctx.from.id);
  state.persons[state.current_id].gender = ctx.match[1].includes('M') ? 'M' : 'W';
  await ctx.answerCbQuery();
  return runSetup(ctx, state);
});

// Verbleibende Standard-Navigation
bot.action('main_menu', async (ctx) => {
  const state = await readSave(ctx.from.id);
  await sendUpdate(ctx, state, Render.status(state.persons[state.current_id], state), getMainKeys(state));
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

bot.launch();
module.exports = bot;
