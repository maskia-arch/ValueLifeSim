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
    // Veraltetes Menü löschen, um Spam zu vermeiden
    try { await ctx.telegram.deleteMessage(ctx.from.id, currentMsgId); } catch (e) {}
    await ctx.answerCbQuery("⚠️ Bitte nutze das aktuelle Menü oben.", { show_alert: true });
    return false;
  }
  return true;
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
    try { await ctx.telegram.pinChatMessage(userId, msg.message_id); } catch (e) {}
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

async function triggerInteractMenu(ctx, state, npcId) {
  const npc = state.persons[npcId];
  const p = state.persons[state.current_id];
  const isParent = (npcId === p.motherId || npcId === p.fatherId);
  const isPartner = (npcId === p.partnerId);
  
  let text = `👥 *Interaktion mit ${npc.name}*\nBeziehung: ${npc.relationship}%`;
  const buttons = [[Markup.button.callback('💬 Reden', `act_talk_${npcId}`), Markup.button.callback('🎁 Geschenk', `act_gift_${npcId}`)]];
  
  if (isParent) {
    buttons.push([Markup.button.callback('💰 Nach Geld fragen', `act_askmoney_${npcId}`)]);
  } else if (p.age >= 16) {
    if (isPartner) {
        if (npc.relationship === 100) buttons.push([Markup.button.callback('💍 Heiraten', `act_marry_${npcId}`)]);
        buttons.push([Markup.button.callback('🔞 Sex haben', `act_sex_${npcId}`)]);
    } else if (npc.relationship >= 80) {
        buttons.push([Markup.button.callback('❤️ Beziehungsantrag', `act_ask_rel_${npcId}`)]);
    }
  }
  buttons.push([Markup.button.callback('⬅️ Zurück', 'rel')]);
  await sendUpdate(ctx, state, text, Markup.inlineKeyboard(buttons));
}

function finalizeMarriage(state, newLastName) {
  const player = state.persons[state.current_id];
  const partner = state.persons[state.pendingPartnerId];
  state.familyLastName = newLastName;
  player.name = player.name.split(' ')[0] + " " + newLastName;
  partner.name = partner.name.split(' ')[0] + " " + newLastName;
  player.maritalStatus = `💍 Verheiratet mit ${partner.name}`;
  partner.maritalStatus = `💍 Verheiratet mit ${player.name}`;
  player.partnerId = partner.id;
  partner.partnerId = player.id;
  state.diary.push(`💍 Hochzeit! Neuer Familienname: ${newLastName}.`);
  state.setupStep = 'done';
  state.pendingPartnerId = null;
}

// --- COMMANDS ---

bot.start(async (ctx) => {
  let state = await readSave(ctx.from.id);
  
  // Wenn Spielstand existiert: Altes Menü bereinigen und fortfahren
  if (state && state.setupComplete) {
    if (state.pinMessageId) {
      try { await ctx.telegram.unpinChatMessage(ctx.from.id, { message_id: state.pinMessageId }); } catch(e) {}
      try { await ctx.telegram.deleteMessage(ctx.from.id, state.pinMessageId); } catch(e) {}
      state.pinMessageId = null;
    }
    const p = state.persons[state.current_id];
    return sendUpdate(ctx, state, Render.status(p, state), getMainKeys(state));
  }
  
  // Falls kein Spielstand existiert: Initialisieren
  state = initGameState(ctx.from.id);
  await writeSave(ctx.from.id, state);
  return runSetup(ctx, state);
});

bot.command('reset', async (ctx) => {
  const newState = initGameState(ctx.from.id);
  await writeSave(ctx.from.id, newState);
  await ctx.reply("♻️ Spiel wurde vollständig zurückgesetzt.");
  return runSetup(ctx, newState);
});

async function runSetup(ctx, state) {
  const p = state.persons[state.current_id];
  if (!p.name) {
    state.setupStep = 'name';
    await writeSave(ctx.from.id, state);
    return ctx.reply("Willkommen! Wie lautet dein Name (Vor- & Nachname)?");
  }
  if (!p.gender) {
    state.setupStep = 'gender';
    await writeSave(ctx.from.id, state);
    return ctx.reply(`Hallo ${p.name}! Wähle dein Geschlecht:`, Markup.inlineKeyboard([[Markup.button.callback('♂ Männlich', 'set_gender_M'), Markup.button.callback('♀ Weiblich', 'set_gender_W')]]));
  }
  if (!state.country) {
    state.setupStep = 'country';
    await writeSave(ctx.from.id, state);
    const countries = ["Germany", "USA", "Turkey", "Japan"];
    return ctx.reply("In welchem Land wirst du geboren?", Markup.inlineKeyboard(countries.map(c => [Markup.button.callback(c, `set_country_${c}`)])));
  }
  state.setupComplete = true;
  state.diary.push(`🌟 Du wurdest als ${p.name} in ${state.country} geboren.`);
  state.currentView = 'status';
  await sendUpdate(ctx, state, Render.status(p, state), getMainKeys(state));
  const currentMsgId = ctx.callbackQuery?.message?.message_id || state.lastMessageId;
  await bulkDelete(ctx, currentMsgId, 15);
}

bot.action(/set_gender_(.*)/, async (ctx) => {
  const state = await readSave(ctx.from.id);
  state.persons[state.current_id].gender = ctx.match[1] === 'M' ? 'M' : 'W';
  state.setupStep = 'country';
  await writeSave(ctx.from.id, state);
  await ctx.answerCbQuery();
  return runSetup(ctx, state);
});

bot.action(/set_country_(.*)/, async (ctx) => {
  const state = await readSave(ctx.from.id);
  state.country = ctx.match[1];
  finalizeParentsCulture(state, state.country);
  state.setupStep = 'done';
  await writeSave(ctx.from.id, state);
  await ctx.answerCbQuery();
  return runSetup(ctx, state);
});

// --- GAMEPLAY ACTIONS ---

bot.action('age_up', async (ctx) => {
  const state = await readSave(ctx.from.id);
  if (!await isMessageValid(ctx, state)) return;
  await ctx.answerCbQuery();
  
  const result = Engine.nextYear(state);
  const p = state.persons[state.current_id];

  if (result.type === 'birth') {
    state.setupStep = 'naming_baby';
    state.pendingBabyId = result.babyId;
    await writeSave(ctx.from.id, state);
    return ctx.reply(`👶 Ein ${result.gender === 'W' ? 'Mädchen' : 'Junge'} wurde geboren! Name?`);
  }

  if (p.age === 16 && !p.hasSetSexuality) {
    return sendUpdate(ctx, state, "✨ Wähle deine Orientierung:", Markup.inlineKeyboard([[Markup.button.callback('👫 Hetero', 'set_sex_hetero')],[Markup.button.callback('👬 Homo', 'set_sex_homo')],[Markup.button.callback('🌍 Bi', 'set_sex_bi')]]));
  }

  if (result.type === 'event') {
    const event = result.data;
    const eventKeys = Markup.inlineKeyboard(event.choices.map((choice, index) => [
      Markup.button.callback(choice.text, `choice_${event.id}_${index}`)
    ]));
    return sendUpdate(ctx, state, `⚡️ *Ereignis!*\n\n${event.text}`, eventKeys);
  }

  await sendUpdate(ctx, state, Render.status(p, state), getMainKeys(state));
});

bot.action(/^choice_(.*)_(.*)$/, async (ctx) => {
  const [_, eventId, choiceIndex] = ctx.match;
  const state = await readSave(ctx.from.id);
  if (!await isMessageValid(ctx, state)) return;

  const events = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'data/events.json'), 'utf8'));
  const event = events.find(e => e.id === eventId);
  const choice = event.choices[choiceIndex];

  Engine.processChoice(state, choice);
  await ctx.answerCbQuery();
  await sendUpdate(ctx, state, Render.status(state.persons[state.current_id], state), getMainKeys(state));
});

// --- SOCIAL & INTERACTION ---

bot.action(/^act_talk_(.*)$/, async (ctx) => {
  const state = await readSave(ctx.from.id);
  if (!await isMessageValid(ctx, state)) return;
  const npcId = ctx.match[1];
  const npc = state.persons[npcId];

  // FIX: Sperre bei 100% Beziehung
  if (npc.relationship >= 100) {
    return ctx.answerCbQuery("✅ Du hast bereits 100%!", { show_alert: true });
  }

  npc.relationship = Math.min(100, (npc.relationship || 0) + 5);
  await ctx.answerCbQuery("💬 Gutes Gespräch!");
  return triggerInteractMenu(ctx, state, npcId);
});

bot.action(/^act_gift_(.*)$/, async (ctx) => {
  const state = await readSave(ctx.from.id);
  if (!await isMessageValid(ctx, state)) return;
  const npcId = ctx.match[1];
  const npc = state.persons[npcId];

  // FIX: Sperre bei 100% Beziehung
  if (npc.relationship >= 100) {
    return ctx.answerCbQuery("🎁 Ihr seid bereits bei 100%!", { show_alert: true });
  }

  const p = state.persons[state.current_id];
  if (p.money < 20) return ctx.answerCbQuery("⚠️ Zu wenig Geld!");
  
  p.money -= 20;
  npc.relationship = Math.min(100, (npc.relationship || 0) + 15);
  await ctx.answerCbQuery("🎁 Geschenk übergeben.");
  return triggerInteractMenu(ctx, state, npcId);
});

bot.action(/^act_askmoney_(.*)$/, async (ctx) => {
  const state = await readSave(ctx.from.id);
  const npc = state.persons[ctx.match[1]];
  const p = state.persons[state.current_id];
  if (Math.random() < (npc.relationship / 100)) {
    const amount = Math.floor(Math.random() * 50) + 10;
    p.money += amount;
    npc.relationship = Math.max(0, npc.relationship - 5);
    await ctx.answerCbQuery(`💰 Erfolg! +${amount}€`, { show_alert: true });
  } else {
    npc.relationship = Math.max(0, npc.relationship - 10);
    await ctx.answerCbQuery("❌ Abgelehnt.", { show_alert: true });
  }
  return triggerInteractMenu(ctx, state, ctx.match[1]);
});

bot.action(/^act_marry_(.*)$/, async (ctx) => {
  const state = await readSave(ctx.from.id);
  const result = Engine.attemptMarriage(state, ctx.match[1]);
  if (result.success) {
    state.setupStep = 'choosing_family_name';
    state.pendingPartnerId = ctx.match[1];
    await writeSave(ctx.from.id, state);
    const keys = Markup.inlineKeyboard([[Markup.button.callback(`🏠 ${state.familyLastName}`, `set_famname_player`)],[Markup.button.callback(`🏡 ${state.persons[ctx.match[1]].name.split(' ').pop()}`, `set_famname_npc`)],[Markup.button.callback('⌨️ Custom', 'set_famname_custom')]]);
    await ctx.answerCbQuery("💍 Ja!");
    return sendUpdate(ctx, state, "🥂 Welchen Familiennamen wählt ihr?", keys);
  }
  await ctx.answerCbQuery("💔 Vielleicht später...", { show_alert: true });
});

bot.action(/^set_famname_(.*)$/, async (ctx) => {
  const state = await readSave(ctx.from.id);
  if (ctx.match[1] === 'custom') {
    state.setupStep = 'typing_custom_famname';
    await writeSave(ctx.from.id, state);
    return ctx.reply("Wie soll der neue Familienname lauten?");
  }
  finalizeMarriage(state, ctx.match[1] === 'player' ? state.familyLastName : state.persons[state.pendingPartnerId].name.split(' ').pop());
  return sendUpdate(ctx, state, Render.status(state.persons[state.current_id], state), getMainKeys(state));
});

bot.action(/^set_sex_(.*)$/, async (ctx) => {
  const state = await readSave(ctx.from.id);
  state.persons[state.current_id].sexuality = ctx.match[1];
  state.persons[state.current_id].hasSetSexuality = true;
  await ctx.answerCbQuery("🌈 Gespeichert!");
  return sendUpdate(ctx, state, Render.status(state.persons[state.current_id], state), getMainKeys(state));
});

bot.action(/^act_sex_(.*)$/, async (ctx) => {
  const state = await readSave(ctx.from.id);
  if (Math.random() < 0.2) state.persons[state.current_id].isPregnant = true;
  await ctx.answerCbQuery("🔞 Das war intensiv...", { show_alert: true });
  return sendUpdate(ctx, state, Render.status(state.persons[state.current_id], state), getMainKeys(state));
});

bot.action(/^act_ask_rel_(.*)$/, async (ctx) => {
    const state = await readSave(ctx.from.id);
    const result = Engine.attemptRelationship(state, ctx.match[1]);
    await ctx.answerCbQuery(result.success ? "❤️ Erfolg!" : "💔 Abgelehnt", { show_alert: true });
    return sendUpdate(ctx, state, Render.status(state.persons[state.current_id], state), getMainKeys(state));
});

// --- NAVIGATION ---

bot.action('tree', async (ctx) => {
  const state = await readSave(ctx.from.id);
  if (!await isMessageValid(ctx, state)) return;
  await ctx.answerCbQuery();
  if (state.currentView === 'tree') {
    state.currentView = 'status';
    return sendUpdate(ctx, state, Render.status(state.persons[state.current_id], state), getMainKeys(state));
  }
  state.currentView = 'tree';
  return sendUpdate(ctx, state, Render.tree(state), getMainKeys(state));
});

bot.action('diary', async (ctx) => {
  const state = await readSave(ctx.from.id);
  if (!await isMessageValid(ctx, state)) return;
  await ctx.answerCbQuery();
  if (state.currentView === 'diary') {
    state.currentView = 'status';
    return sendUpdate(ctx, state, Render.status(state.persons[state.current_id], state), getMainKeys(state));
  }
  state.currentView = 'diary';
  return sendUpdate(ctx, state, Render.diary(state), getMainKeys(state));
});

bot.action('rel', async (ctx) => {
  const state = await readSave(ctx.from.id);
  if (!await isMessageValid(ctx, state)) return;
  const rel = Render.relationships(state);
  return sendUpdate(ctx, state, rel.text, rel.keyboard);
});

bot.action('activities', async (ctx) => {
  const state = await readSave(ctx.from.id);
  if (!await isMessageValid(ctx, state)) return;
  return sendUpdate(ctx, state, "🎡 Aktivitäten", Markup.inlineKeyboard([[Markup.button.callback('💃 Disco (100€)', 'act_disco'), Markup.button.callback('📱 Finder', 'act_finder')],[Markup.button.callback('⬅️ Zurück', 'main_menu')]]));
});

bot.action('act_disco', async (ctx) => {
  const state = await readSave(ctx.from.id);
  if (state.persons[state.current_id].money < 100) return ctx.answerCbQuery("⚠️ Zu wenig Geld!");
  state.persons[state.current_id].money -= 100;
  const match = Engine.generateEncounter(state, true);
  state.persons[match.id] = match;
  await ctx.answerCbQuery(`💃 Du triffst ${match.name}!`);
  return sendUpdate(ctx, state, `💃 *Disco*\nDu hast ${match.name} getroffen.`, Markup.inlineKeyboard([[Markup.button.callback('💘 Interagieren', `interact_${match.id}`)],[Markup.button.callback('⬅️ Zurück', 'activities')]]));
});

bot.action('act_finder', async (ctx) => {
  const state = await readSave(ctx.from.id);
  const match = Engine.generateEncounter(state, true);
  state.persons[match.id] = match;
  await ctx.answerCbQuery("📱 Neues Profil!");
  return sendUpdate(ctx, state, Render.finderProfile(match), Markup.inlineKeyboard([[Markup.button.callback('✅ Like', `interact_${match.id}`), Markup.button.callback('❌ Skip', 'act_finder')],[Markup.button.callback('⬅️ Zurück', 'activities')]]));
});

bot.action(/^interact_(.*)$/, async (ctx) => {
  const state = await readSave(ctx.from.id);
  if (!await isMessageValid(ctx, state)) return;
  await ctx.answerCbQuery();
  return triggerInteractMenu(ctx, state, ctx.match[1]);
});

// --- SYSTEM ---

bot.on('text', async (ctx) => {
  const state = await readSave(ctx.from.id);
  if (!state) return;
  const input = ctx.message.text.trim();
  if (state.setupStep === 'name') {
    if (input.split(' ').length < 2) return ctx.reply("Vor- & Nachname bitte.");
    state.persons[state.current_id].name = input;
    state.familyLastName = input.split(' ').pop();
    state.setupStep = 'gender';
    await writeSave(ctx.from.id, state);
    return runSetup(ctx, state);
  }
  if (state.setupStep === 'naming_baby') {
    state.persons[state.pendingBabyId].name = input + " " + state.familyLastName;
    state.setupStep = 'done';
    await bulkDelete(ctx, ctx.message.message_id, 2);
    return sendUpdate(ctx, state, Render.status(state.persons[state.current_id], state), getMainKeys(state));
  }
  if (state.setupStep === 'typing_custom_famname') {
    finalizeMarriage(state, input);
    await bulkDelete(ctx, ctx.message.message_id, 2);
    return sendUpdate(ctx, state, Render.status(state.persons[state.current_id], state), getMainKeys(state));
  }
});

bot.action('main_menu', async (ctx) => {
  const state = await readSave(ctx.from.id);
  state.currentView = 'status';
  return sendUpdate(ctx, state, Render.status(state.persons[state.current_id], state), getMainKeys(state));
});

bot.action('reset', async (ctx) => {
  const newState = initGameState(ctx.from.id);
  await writeSave(ctx.from.id, newState);
  await ctx.answerCbQuery("♻️ Neustart...");
  return runSetup(ctx, newState);
});

bot.on('callback_query', (ctx) => ctx.answerCbQuery());
bot.launch().then(() => console.log(`ValueLifeSim v${config.version} online!`));
