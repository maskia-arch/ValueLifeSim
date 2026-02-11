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
  if (!state || !state.setupComplete) return true; 
  const currentMsgId = ctx.callbackQuery?.message?.message_id;
  if (state.pinMessageId && currentMsgId && currentMsgId !== state.pinMessageId) {
    await ctx.answerCbQuery("⚠️ Bitte nutze das angeheftete Menü oben.", { show_alert: true });
    return false;
  }
  return true;
}

async function clearTemporary(ctx, state) {
  if (state.lastTempId) {
    try {
      await ctx.telegram.deleteMessage(ctx.from.id, state.lastTempId);
    } catch (err) {}
    state.lastTempId = null;
  }
}

async function sendTemporary(ctx, state, text) {
  await clearTemporary(ctx, state); 
  const msg = await ctx.replyWithMarkdown(text);
  state.lastTempId = msg.message_id;
  await writeSave(ctx.from.id, state);
}

async function bulkDelete(ctx, startId, count = 25) {
  const userId = ctx.from.id;
  for (let i = 0; i < count; i++) {
    try {
      await ctx.telegram.deleteMessage(userId, startId - i);
    } catch (err) {}
  }
}

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
      state.pinMessageId = null; 
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
  
  const rows = [[Markup.button.callback('➕ Ein Jahr älter', 'age_up')]];

  const socialRow = [Markup.button.callback('👥 Beziehungen', 'rel')];
  if (p.age >= 16) socialRow.push(Markup.button.callback('🎡 Aktivitäten', 'activities'));
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
    return ctx.reply("In welchem Land wirst du geboren?", Markup.inlineKeyboard(countries.map(c => [Markup.button.callback(c, `set_country_${c}`)])));
  }
  
  state.setupComplete = true;
  state.diary.push(`🌟 Du wurdest als ${p.name} in ${state.country} geboren.`);
  await bulkDelete(ctx, ctx.callbackQuery?.message?.message_id || state.lastMessageId, 15);
  await sendUpdate(ctx, state, Render.status(p, state), getMainKeys(state));
}

// --- GAMEPLAY & SOCIAL ---

bot.action('age_up', async (ctx) => {
  const state = await readSave(ctx.from.id);
  if (!await isMessageValid(ctx, state)) return;
  
  await ctx.answerCbQuery();
  await clearTemporary(ctx, state); 

  const result = Engine.nextYear(state);
  const p = state.persons[state.current_id];

  if (p.age === 16 && !p.hasSetSexuality) {
    const keys = Markup.inlineKeyboard([
      [Markup.button.callback('👫 Hetero', 'set_sex_hetero')],
      [Markup.button.callback('👬 Homo', 'set_sex_homo')],
      [Markup.button.callback('🌍 Bi', 'set_sex_bi')]
    ]);
    return sendUpdate(ctx, state, "✨ Du wirst erwachsen! Was ist deine Orientierung?", keys);
  }

  let text = Render.status(p, state);
  let keys = getMainKeys(state);
  if (result.type === 'event') {
    text = `*Ereignis!*\n\n${result.data.text}`;
    keys = Markup.inlineKeyboard(result.data.choices.map((c, i) => [Markup.button.callback(c.text, `choice_${result.data.id}_${i}`)]));
  }
  await sendUpdate(ctx, state, text, keys);
});

// --- FIX: EVENT CHOICE HANDLER ---
bot.action(/^choice_(.*)_(.*)$/, async (ctx) => {
  const [_, eventId, choiceIdx] = ctx.match;
  const state = await readSave(ctx.from.id);
  if (!await isMessageValid(ctx, state)) return;

  const events = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'data/events.json'), 'utf8'));
  const event = events.find(e => e.id === eventId);
  const choice = event.choices[parseInt(choiceIdx)];
  
  Engine.processChoice(state, choice);
  
  await ctx.answerCbQuery();
  // Feedback unter den Pin senden
  await sendTemporary(ctx, state, `✅ ${choice.response}`);
  
  // Pin auf Hauptmenü zurücksetzen
  const p = state.persons[state.current_id];
  await sendUpdate(ctx, state, Render.status(p, state), getMainKeys(state));
});

bot.action(/^set_sex_(.*)$/, async (ctx) => {
  const state = await readSave(ctx.from.id);
  if (!state || !await isMessageValid(ctx, state)) return;
  const p = state.persons[state.current_id];
  p.sexuality = ctx.match[1];
  p.hasSetSexuality = true;
  await ctx.answerCbQuery();
  await sendUpdate(ctx, state, Render.status(p, state), getMainKeys(state));
});

bot.action(/^act_talk_(.*)$/, async (ctx) => {
  const state = await readSave(ctx.from.id);
  const npc = state.persons[ctx.match[1]];
  npc.relationship = Math.min(100, (npc.relationship || 0) + 5);
  
  await ctx.answerCbQuery();
  await sendTemporary(ctx, state, `💬 Du hast dich mit ${npc.name} unterhalten.`);
  
  const { text, keyboard } = Render.relationships(state);
  await sendUpdate(ctx, state, text, keyboard);
});

bot.action(/^act_gift_(.*)$/, async (ctx) => {
  const state = await readSave(ctx.from.id);
  const p = state.persons[state.current_id];
  const npc = state.persons[ctx.match[1]];
  
  if (p.money < 20) return ctx.answerCbQuery("⚠️ Zu wenig Geld!", { show_alert: true });
  
  p.money -= 20;
  npc.relationship = Math.min(100, (npc.relationship || 0) + 15);
  
  await ctx.answerCbQuery("🎁 Geschenk übergeben.");
  await sendTemporary(ctx, state, `🎁 Du hast ${npc.name} ein Geschenk gekauft.`);
  
  const { text, keyboard } = Render.relationships(state);
  await sendUpdate(ctx, state, text, keyboard);
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
  if (p.age >= 16 && !isParent) {
    if (isPartner) buttons.push([Markup.button.callback('💋 Küssen', `act_kiss_${npcId}`)]);
    else if (npc.relationship >= 80) buttons.push([Markup.button.callback('❤️ Antrag', `act_ask_rel_${npcId}`)]);
  }
  buttons.push([Markup.button.callback('⬅️ Zurück', 'rel')]);
  
  await clearTemporary(ctx, state); 
  await sendUpdate(ctx, state, text, Markup.inlineKeyboard(buttons));
});

// --- NAVIGATION ---

bot.action('rel', async (ctx) => {
  const state = await readSave(ctx.from.id);
  if (!await isMessageValid(ctx, state)) return;
  const { text, keyboard } = Render.relationships(state);
  await clearTemporary(ctx, state);
  await sendUpdate(ctx, state, text, keyboard);
});

bot.action('activities', async (ctx) => {
  const state = await readSave(ctx.from.id);
  if (!await isMessageValid(ctx, state)) return;
  await clearTemporary(ctx, state);
  await sendUpdate(ctx, state, "🎡 *Aktivitäten*", Markup.inlineKeyboard([
    [Markup.button.callback('💃 Disco (100€)', 'act_disco'), Markup.button.callback('📱 Finder', 'act_finder')],
    [Markup.button.callback('⬅️ Zurück', 'main_menu')]
  ]));
});

bot.action('main_menu', async (ctx) => {
  const state = await readSave(ctx.from.id);
  await clearTemporary(ctx, state);
  await sendUpdate(ctx, state, Render.status(state.persons[state.current_id], state), getMainKeys(state));
});

bot.action('reset', async (ctx) => {
  const userId = ctx.from.id;
  const state = await readSave(userId);
  await clearTemporary(ctx, state);
  if (state?.pinMessageId) {
    try {
      await ctx.telegram.unpinChatMessage(userId, { message_id: state.pinMessageId });
      await ctx.telegram.deleteMessage(userId, state.pinMessageId);
    } catch (e) {}
  }
  await bulkDelete(ctx, ctx.callbackQuery?.message?.message_id, 35);
  const newState = initGameState(userId);
  await writeSave(userId, newState);
  return runSetup(ctx, newState);
});

// --- SYSTEM ---

bot.on('text', async (ctx) => {
  const state = await readSave(ctx.from.id);
  if (!state || state.setupComplete) return;
  if (state.setupStep === 'name') {
    const input = ctx.message.text.trim();
    if (input.split(' ').length < 2) return ctx.reply("❌ Bitte Vor- & Nachname.");
    state.familyLastName = input.split(' ').pop();
    state.persons[state.current_id].name = input;
    state.setupStep = 'gender';
    await writeSave(ctx.from.id, state);
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

bot.on('callback_query', (ctx) => ctx.answerCbQuery());

bot.launch().then(() => console.log("ValueLifeSim v0.0.3 online!"));
