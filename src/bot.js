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

  if (state.setupStep === 'naming_baby' && state.pendingBabyId) {
    const babyName = ctx.message.text.trim();
    const baby = state.persons[state.pendingBabyId];
    baby.name = `${babyName} ${state.familyLastName}`;
    state.setupStep = 'done';
    state.pendingBabyId = null;
    await sendUpdate(ctx, state, `🍼 Das Baby heißt nun ${baby.name}!`, getMainKeys(state));
  }
});

// --- GAMEPLAY ACTIONS ---

bot.action('age_up', async (ctx) => {
  const state = await readSave(ctx.from.id);
  if (!await isMessageValid(ctx, state)) return;
  await ctx.answerCbQuery();
  
  const result = Engine.nextYear(state);
  const p = state.persons[state.current_id];

  if (result.type === 'death') {
    let deathMsg = `💀 Du bist gestorben.`;
    let keys = result.hasInheritor ? 
      Markup.inlineKeyboard([[Markup.button.callback(`🕹 Als ${result.inheritor.name} spielen`, `inherit_${result.inheritor.id}`)]]) :
      Markup.inlineKeyboard([[Markup.button.callback('⚙️ Reset', 'reset')]]);
    return sendUpdate(ctx, state, deathMsg, keys);
  }

  if (p.age === 16 && !p.hasSetSexuality) {
    state.setupStep = 'sexuality';
    await writeSave(ctx.from.id, state);
    return ctx.reply("✨ Du wirst erwachsen! Was ist deine Orientierung?", Markup.inlineKeyboard([
      [Markup.button.callback('👫 Hetero', 'set_sex_hetero')],
      [Markup.button.callback('👬 Homo', 'set_sex_homo')],
      [Markup.button.callback('🌍 Bi', 'set_sex_bi')]
    ]));
  }

  if (result.type === 'birth') {
    state.setupStep = 'naming_baby';
    state.pendingBabyId = result.babyId;
    await writeSave(ctx.from.id, state);
    return ctx.reply(`👶 Ein ${result.gender === 'W' ? 'Mädchen' : 'Junge'}! Name?`);
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

bot.action(/^choice_(.*)_(.*)$/, async (ctx) => {
  const [_, eventId, choiceIdx] = ctx.match;
  const state = await readSave(ctx.from.id);
  if (!await isMessageValid(ctx, state)) return;

  const events = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'data/events.json'), 'utf8'));
  const event = events.find(e => e.id === eventId);
  if (!event) return ctx.answerCbQuery("Ereignis nicht gefunden.");

  const choice = event.choices[parseInt(choiceIdx)];
  Engine.processChoice(state, choice);
  
  await ctx.answerCbQuery();
  await sendUpdate(ctx, state, `✅ ${choice.response}`, getMainKeys(state));
});

bot.action(/^set_sex_(.*)$/, async (ctx) => {
  const state = await readSave(ctx.from.id);
  if (!state) return;
  const p = state.persons[state.current_id];
  p.sexuality = ctx.match[1];
  p.hasSetSexuality = true;
  await ctx.answerCbQuery("Präferenz gespeichert!");
  await sendUpdate(ctx, state, Render.status(p, state), getMainKeys(state));
});

// --- AKTIVITÄTEN-HANDLER ---
bot.action('activities', async (ctx) => {
  const state = await readSave(ctx.from.id);
  if (!await isMessageValid(ctx, state)) return;
  await ctx.answerCbQuery();
  
  const text = "🎡 *Was möchtest du unternehmen?*";
  const keyboard = Markup.inlineKeyboard([
    [Markup.button.callback('💃 Disco (100€)', 'act_disco'), Markup.button.callback('📱 Finder', 'act_finder')],
    [Markup.button.callback('⬅️ Zurück', 'main_menu')]
  ]);
  await sendUpdate(ctx, state, text, keyboard);
});

bot.action('act_disco', async (ctx) => {
  const state = await readSave(ctx.from.id);
  const p = state.persons[state.current_id];
  if (p.money < 100) return ctx.answerCbQuery("Zu wenig Geld! (100€ benötigt)", { show_alert: true });
  
  p.money -= 100;
  const encounter = Engine.generateEncounter(state); 
  state.persons[encounter.id] = encounter;
  
  const text = `💃 *Im Club:* Du triffst ${encounter.name} auf der Tanzfläche!`;
  const keyboard = Markup.inlineKeyboard([
    [Markup.button.callback('💘 Anflirten', `interact_${encounter.id}`)],
    [Markup.button.callback('⬅️ Zurück', 'activities')]
  ]);
  await ctx.answerCbQuery();
  await sendUpdate(ctx, state, text, keyboard);
});

bot.action('act_finder', async (ctx) => {
  const state = await readSave(ctx.from.id);
  const match = Engine.generateEncounter(state, true); 
  state.persons[match.id] = match;
  
  await ctx.answerCbQuery();
  await sendUpdate(ctx, state, Render.finderProfile(match), Markup.inlineKeyboard([
    [Markup.button.callback('✅ Like', `interact_${match.id}`), Markup.button.callback('❌ Skip', 'act_finder')],
    [Markup.button.callback('⬅️ Zurück', 'activities')]
  ]));
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
  const text = `👥 *Interaktion mit ${npc.name}*\nBeziehung: ${npc.relationship}%`;
  
  const buttons = [
    [Markup.button.callback('💬 Reden', `act_talk_${npcId}`), Markup.button.callback('🎁 Geschenk', `act_gift_${npcId}`)]
  ];

  if (isParent) {
    buttons.push([Markup.button.callback('💰 Nach Geld fragen', `act_askmoney_${npcId}`)]);
  }

  buttons.push([Markup.button.callback('⬅️ Zurück', 'rel')]);
  await sendUpdate(ctx, state, text, Markup.inlineKeyboard(buttons));
});

bot.action(/^act_talk_(.*)$/, async (ctx) => {
  const state = await readSave(ctx.from.id);
  const npc = state.persons[ctx.match[1]];
  npc.relationship = Math.min(100, (npc.relationship || 0) + 5);
  await ctx.answerCbQuery("Gutes Gespräch!");
  await sendUpdate(ctx, state, `💬 Du hast mit ${npc.name} geredet.`, getMainKeys(state));
});

bot.action(/^act_askmoney_(.*)$/, async (ctx) => {
  const state = await readSave(ctx.from.id);
  const npc = state.persons[ctx.match[1]];
  const p = state.persons[state.current_id];
  const success = Math.random() * 100 < (npc.relationship - 10);
  
  if (success) {
    const amount = Math.floor(Math.random() * 40) + 10;
    p.money += amount;
    npc.relationship = Math.max(0, npc.relationship - 2);
    await ctx.answerCbQuery(`Erfolg! +${amount}€`);
    await sendUpdate(ctx, state, `💰 ${npc.name} hat dir ${amount}€ gegeben.`, getMainKeys(state));
  } else {
    npc.relationship = Math.max(0, npc.relationship - 10);
    await ctx.answerCbQuery("Abgelehnt!");
    await sendUpdate(ctx, state, `❌ ${npc.name} wollte dir kein Geld geben.`, getMainKeys(state));
  }
});

// --- NAVIGATION HANDLER ---
bot.action('status', async (ctx) => {
  const state = await readSave(ctx.from.id);
  if (!await isMessageValid(ctx, state)) return;
  await ctx.answerCbQuery();
  await sendUpdate(ctx, state, Render.status(state.persons[state.current_id], state), getMainKeys(state));
});

bot.action('rel', async (ctx) => {
  const state = await readSave(ctx.from.id);
  if (!await isMessageValid(ctx, state)) return;
  await ctx.answerCbQuery();
  const { text, keyboard } = Render.relationships(state);
  await sendUpdate(ctx, state, text, keyboard);
});

bot.action('diary', async (ctx) => {
  const state = await readSave(ctx.from.id);
  if (!await isMessageValid(ctx, state)) return;
  await ctx.answerCbQuery();
  await sendUpdate(ctx, state, Render.diary(state), getMainKeys(state));
});

bot.action('tree', async (ctx) => {
  const state = await readSave(ctx.from.id);
  if (!await isMessageValid(ctx, state)) return;
  await ctx.answerCbQuery();
  await sendUpdate(ctx, state, Render.tree(state), getMainKeys(state));
});

bot.action('main_menu', async (ctx) => {
  const state = await readSave(ctx.from.id);
  await ctx.answerCbQuery();
  await sendUpdate(ctx, state, Render.status(state.persons[state.current_id], state), getMainKeys(state));
});

// --- SETUP & SETTINGS ---
bot.action(/set_country_(.*)/, async (ctx) => {
  const state = await readSave(ctx.from.id);
  state.country = ctx.match[1];
  finalizeParentsCulture(state, state.country);
  await ctx.answerCbQuery();
  return runSetup(ctx, state);
});

bot.action(/set_gender_(.*)/, async (ctx) => {
  const state = await readSave(ctx.from.id);
  state.persons[state.current_id].gender = ctx.match[1];
  await ctx.answerCbQuery();
  return runSetup(ctx, state);
});

bot.action('reset', async (ctx) => {
  const state = initGameState(ctx.from.id);
  await writeSave(ctx.from.id, state);
  await ctx.answerCbQuery("Reset...");
  return runSetup(ctx, state);
});

bot.on('callback_query', async (ctx) => { await ctx.answerCbQuery(); });

module.exports = bot;
