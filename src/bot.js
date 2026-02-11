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

const checkGameOver = (state) => state.isGameOver || !state.persons[state.current_id].isAlive;

async function isMessageValid(ctx, state) {
  if (!state.setupComplete) return true; 
  const currentMsgId = ctx.callbackQuery?.message?.message_id;
  if (state.lastMessageId && currentMsgId !== state.lastMessageId) {
    await ctx.answerCbQuery("⚠️ Diese Nachricht ist veraltet. Bitte nutze das aktuelle Menü.", { show_alert: true });
    return false;
  }
  return true;
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
  if (state.isGameOver) {
    return Markup.inlineKeyboard([[Markup.button.callback('⚙️ Neustart', 'reset')]]);
  }

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
  
  state.setupComplete = true;
  state.diary.push(`🌟 Du wurdest als ${p.name} in ${state.country} geboren.`);
  await sendUpdate(ctx, state, `Das Abenteuer beginnt!`, getMainKeys(state));
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
    keys = Markup.inlineKeyboard(result.data.choices.map((c, i) => [
      Markup.button.callback(c.text, `choice_${result.data.id}_${i}`)
    ]));
  }
  
  await sendUpdate(ctx, state, msgText, keys);
});

// --- ROMANTIK & SOCIAL HANDLER (v0.0.2g) ---

bot.action(/^act_ask_rel_(.*)$/, async (ctx) => {
  const state = await readSave(ctx.from.id);
  const npcId = ctx.match[1];
  const npc = state.persons[npcId];
  
  const result = Engine.attemptRelationship(state, npcId);
  await ctx.answerCbQuery();
  
  if (result.success) {
    await sendUpdate(ctx, state, `❤️ *Erfolg!* Du und ${npc.name} seid jetzt ein Paar.`, getMainKeys(state));
  } else {
    await sendUpdate(ctx, state, `💔 *Ablehnung.* ${npc.name} möchte momentan keine Beziehung mit dir. (Beziehung gesunken)`, getMainKeys(state));
  }
});

bot.action(/^act_ons_(.*)$/, async (ctx) => {
  const state = await readSave(ctx.from.id);
  const npcId = ctx.match[1];
  const npc = state.persons[npcId];
  
  const result = Engine.attemptOneNightStand(state, npcId);
  await ctx.answerCbQuery();
  
  if (result.success) {
    await sendUpdate(ctx, state, `🔥 *Heiß!* Du hattest ein aufregendes Abenteuer mit ${npc.name}. Dein Glück ist gestiegen!`, getMainKeys(state));
  } else {
    await sendUpdate(ctx, state, `❌ *Korb.* ${npc.name} hatte kein Interesse an einer schnellen Nummer.`, getMainKeys(state));
  }
});

// --- INTERAKTIONS-HANDLER ---

bot.action(/^interact_(.*)$/, async (ctx) => {
  const state = await readSave(ctx.from.id);
  if (!await isMessageValid(ctx, state)) return;
  
  const npcId = ctx.match[1];
  const npc = state.persons[npcId];
  const p = state.persons[state.current_id];
  if (!npc) return ctx.answerCbQuery("Person nicht gefunden.");
  
  await ctx.answerCbQuery();
  const isParent = (npcId === p.motherId || npcId === p.fatherId);
  const isPartner = (npcId === p.partnerId);
  const isFriend = (p.friendsIds || []).includes(npcId);
  
  let text = `👥 *Interaktion mit ${npc.name}*\nBeziehung: ${npc.relationship}%`;
  if (isPartner) text += `\nStatus: ❤️ Partner(in)`;
  
  const buttons = [
    [Markup.button.callback('💬 Reden', `act_talk_${npcId}`), Markup.button.callback('🎁 Geschenk', `act_gift_${npcId}`)]
  ];

  // Spezial-Aktionen
  if (isParent) {
    buttons.push([Markup.button.callback('💰 Nach Geld fragen', `act_askmoney_${npcId}`)]);
  } else if (p.age >= 16) {
    // Romantische Optionen
    if (isPartner) {
      buttons.push([Markup.button.callback('💋 Küssen', `act_kiss_${npcId}`), Markup.button.callback('🔞 Sex haben', `act_sex_${npcId}`)]);
    } else if (npc.relationship >= 80) {
      buttons.push([Markup.button.callback('❤️ Nach Beziehung fragen', `act_ask_rel_${npcId}`)]);
    }
    
    // One Night Stand (Nur bei Nicht-Verwandten/Nicht-Partnern möglich)
    if (!isPartner && !isParent) {
       buttons.push([Markup.button.callback('🔥 One Night Stand vorschlagen', `act_ons_${npcId}`)]);
    }
  }

  buttons.push([Markup.button.callback('⬅️ Zurück', 'rel')]);
  await sendUpdate(ctx, state, text, Markup.inlineKeyboard(buttons));
});

// --- STANDARD HANDLER ---

bot.action('status', async (ctx) => {
  const state = await readSave(ctx.from.id);
  await sendUpdate(ctx, state, Render.status(state.persons[state.current_id], state), getMainKeys(state));
});

bot.action('rel', async (ctx) => {
  const state = await readSave(ctx.from.id);
  const { text, keyboard } = Render.relationships(state);
  await sendUpdate(ctx, state, text, keyboard);
});

bot.action('activities', async (ctx) => {
  const state = await readSave(ctx.from.id);
  await sendUpdate(ctx, state, "🎡 *Aktivitäten*", Markup.inlineKeyboard([
    [Markup.button.callback('💃 Disco (100€)', 'act_disco'), Markup.button.callback('📱 Finder', 'act_finder')],
    [Markup.button.callback('⬅️ Zurück', 'main_menu')]
  ]));
});

bot.action('act_disco', async (ctx) => {
  const state = await readSave(ctx.from.id);
  const p = state.persons[state.current_id];
  if (p.money < 100) return ctx.answerCbQuery("Zu wenig Geld!", { show_alert: true });
  p.money -= 100;
  const encounter = Engine.generateEncounter(state);
  state.persons[encounter.id] = encounter;
  await sendUpdate(ctx, state, `💃 *Club:* Du triffst ${encounter.name}!`, Markup.inlineKeyboard([
    [Markup.button.callback('💘 Anflirten', `interact_${encounter.id}`)],
    [Markup.button.callback('⬅️ Zurück', 'activities')]
  ]));
});

bot.action('act_finder', async (ctx) => {
  const state = await readSave(ctx.from.id);
  const match = Engine.generateEncounter(state, true);
  state.persons[match.id] = match;
  await sendUpdate(ctx, state, Render.finderProfile(match), Markup.inlineKeyboard([
    [Markup.button.callback('✅ Like', `interact_${match.id}`), Markup.button.callback('❌ Skip', 'act_finder')],
    [Markup.button.callback('⬅️ Zurück', 'activities')]
  ]));
});

bot.action('reset', async (ctx) => {
  const state = initGameState(ctx.from.id);
  await writeSave(ctx.from.id, state);
  return runSetup(ctx, state);
});

bot.on('callback_query', async (ctx) => { await ctx.answerCbQuery(); });

module.exports = bot;
