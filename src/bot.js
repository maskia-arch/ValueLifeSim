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

// --- HOCHZEITS-FINALYSER ---

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
  state.diary.push(`💍 Hochzeit! Die Familie trägt nun den Namen ${newLastName}.`);
  state.setupStep = 'done';
  state.pendingPartnerId = null;
}

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

  // TIMING-FIX: Erst Nachricht pinnen, dann Erstellung löschen
  await sendUpdate(ctx, state, Render.status(p, state), getMainKeys(state));
  const currentMsgId = ctx.callbackQuery?.message?.message_id || state.lastMessageId;
  await bulkDelete(ctx, currentMsgId, 15);
}

// --- GAMEPLAY ACTIONS ---

bot.action('age_up', async (ctx) => {
  const state = await readSave(ctx.from.id);
  if (!await isMessageValid(ctx, state)) return;
  await ctx.answerCbQuery();
  state.currentView = 'status';

  const result = Engine.nextYear(state);
  const p = state.persons[state.current_id];

  if (result.type === 'birth') {
    state.setupStep = 'naming_baby';
    state.pendingBabyId = result.babyId;
    await writeSave(ctx.from.id, state);
    return ctx.reply(`👶 Ein ${result.gender === 'W' ? 'Mädchen' : 'Junge'} wurde geboren! Wie soll es heißen?`);
  }

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

// --- SOCIAL HANDLER ---

bot.action(/^set_sex_(.*)$/, async (ctx) => {
  const state = await readSave(ctx.from.id);
  if (!await isMessageValid(ctx, state)) return;
  const p = state.persons[state.current_id];
  p.sexuality = ctx.match[1];
  p.hasSetSexuality = true;
  await ctx.answerCbQuery("🌈 Orientierung gespeichert.");
  await sendUpdate(ctx, state, Render.status(p, state), getMainKeys(state));
});

bot.action(/^act_askmoney_(.*)$/, async (ctx) => {
  const state = await readSave(ctx.from.id);
  const npcId = ctx.match[1];
  const npc = state.persons[npcId];
  const p = state.persons[state.current_id];
  if (Math.random() < (npc.relationship / 100)) {
    const amount = Math.floor(Math.random() * 50) + 10;
    p.money += amount;
    npc.relationship = Math.max(0, npc.relationship - 5);
    await ctx.answerCbQuery(`💰 Erfolg! ${npc.name} hat dir ${amount}€ gegeben.`, { show_alert: true });
  } else {
    npc.relationship = Math.max(0, npc.relationship - 10);
    await ctx.answerCbQuery(`❌ Abgelehnt!`, { show_alert: true });
  }
  const rel = Render.relationships(state);
  await sendUpdate(ctx, state, rel.text, rel.keyboard);
});

bot.action(/^act_marry_(.*)$/, async (ctx) => {
  const state = await readSave(ctx.from.id);
  const npcId = ctx.match[1];
  const result = Engine.attemptMarriage(state, npcId);
  if (result.success) {
    state.setupStep = 'choosing_family_name';
    state.pendingPartnerId = npcId;
    await writeSave(ctx.from.id, state);
    const keys = Markup.inlineKeyboard([
      [Markup.button.callback(`🏠 ${state.familyLastName}`, `set_famname_player`)],
      [Markup.button.callback(`🏡 ${state.persons[npcId].name.split(' ').pop()}`, `set_famname_npc`)],
      [Markup.button.callback('⌨️ Custom', 'set_famname_custom')]
    ]);
    await ctx.answerCbQuery("💍 Antrag angenommen!");
    return sendUpdate(ctx, state, "🥂 Welchen Familiennamen wählt ihr?", keys);
  }
  await ctx.answerCbQuery("💔 Abgelehnt.", { show_alert: true });
});

bot.action(/^set_famname_(.*)$/, async (ctx) => {
  const state = await readSave(ctx.from.id);
  if (ctx.match[1] === 'custom') {
    state.setupStep = 'typing_custom_famname';
    await writeSave(ctx.from.id, state);
    return ctx.reply("Wie soll der neue Familienname lauten?");
  }
  const name = ctx.match[1] === 'player' ? state.familyLastName : state.persons[state.pendingPartnerId].name.split(' ').pop();
  finalizeMarriage(state, name);
  await sendUpdate(ctx, state, Render.status(state.persons[state.current_id], state), getMainKeys(state));
});

bot.action(/^act_sex_(.*)$/, async (ctx) => {
  const state = await readSave(ctx.from.id);
  const p = state.persons[state.current_id];
  const chance = p.gender === 'W' ? 0.25 : 0.15;
  if (Math.random() < chance) { p.isPregnant = true; await ctx.answerCbQuery("🔞 Intensiv... Du fühlst dich anders.", { show_alert: true }); }
  else { await ctx.answerCbQuery("🔞 Ein schöner Moment.", { show_alert: true }); }
  await sendUpdate(ctx, state, Render.status(p, state), getMainKeys(state));
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
  else if (p.age >= 16) {
    if (isPartner && npc.relationship === 100) buttons.push([Markup.button.callback('💍 Heiraten', `act_marry_${npcId}`)]);
    if (isPartner) buttons.push([Markup.button.callback('🔞 Sex haben', `act_sex_${npcId}`)]);
    else if (npc.relationship >= 80) buttons.push([Markup.button.callback('❤️ Beziehungsantrag', `act_ask_rel_${npcId}`)]);
  }
  buttons.push([Markup.button.callback('⬅️ Zurück', 'rel')]);
  await sendUpdate(ctx, state, text, Markup.inlineKeyboard(buttons));
});

// --- NAVIGATION & TOGGLE ---

bot.action('tree', async (ctx) => {
  const state = await readSave(ctx.from.id);
  if (!await isMessageValid(ctx, state)) return;
  await ctx.answerCbQuery();
  if (state.currentView === 'tree') {
    state.currentView = 'status';
    return sendUpdate(ctx, state, Render.status(state.persons[state.current_id], state), getMainKeys(state));
  }
  state.currentView = 'tree';
  await sendUpdate(ctx, state, Render.tree(state), getMainKeys(state));
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
  await sendUpdate(ctx, state, Render.diary(state), getMainKeys(state));
});

// --- AKTIVITÄTEN ---

bot.action('activities', async (ctx) => {
  const state = await readSave(ctx.from.id);
  if (!await isMessageValid(ctx, state)) return;
  await ctx.answerCbQuery();
  const keys = Markup.inlineKeyboard([[Markup.button.callback('💃 Disco (100€)', 'act_disco'), Markup.button.callback('📱 Finder', 'act_finder')],[Markup.button.callback('⬅️ Zurück', 'main_menu')]]);
  await sendUpdate(ctx, state, "🎡 Aktivitäten", keys);
});

bot.action('act_disco', async (ctx) => {
    const state = await readSave(ctx.from.id);
    const p = state.persons[state.current_id];
    if (p.money < 100) return ctx.answerCbQuery("⚠️ Zu wenig Geld!", { show_alert: true });
    p.money -= 100;
    const encounter = Engine.generateEncounter(state, true);
    state.persons[encounter.id] = encounter;
    await ctx.answerCbQuery(`💃 Du triffst ${encounter.name}!`, { show_alert: true });
    const keys = Markup.inlineKeyboard([[Markup.button.callback('💘 Anflirten', `interact_${encounter.id}`)],[Markup.button.callback('⬅️ Zurück', 'activities')]]);
    await sendUpdate(ctx, state, `💃 *Disco*\nDu hast ${encounter.name} getroffen.`, keys);
});

bot.action('act_finder', async (ctx) => {
    const state = await readSave(ctx.from.id);
    const match = Engine.generateEncounter(state, true);
    state.persons[match.id] = match;
    await ctx.answerCbQuery("📱 Neues Profil!");
    const keys = Markup.inlineKeyboard([[Markup.button.callback('✅ Like', `interact_${match.id}`), Markup.button.callback('❌ Skip', 'act_finder')],[Markup.button.callback('⬅️ Zurück', 'activities')]]);
    await sendUpdate(ctx, state, Render.finderProfile(match), keys);
});

// --- SYSTEM ---

bot.on('text', async (ctx) => {
  const state = await readSave(ctx.from.id);
  if (!state) return;
  const input = ctx.message.text.trim();
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
  if (state.setupStep === 'name') {
    if (input.split(' ').length < 2) return ctx.reply("❌ Vor- & Nachname bitte.");
    state.familyLastName = input.split(' ').pop();
    state.persons[state.current_id].name = input;
    state.setupStep = 'gender';
    await writeSave(ctx.from.id, state);
    return runSetup(ctx, state);
  }
});

bot.action('rel', async (ctx) => {
  const state = await readSave(ctx.from.id);
  const rel = Render.relationships(state);
  await sendUpdate(ctx, state, rel.text, rel.keyboard);
});

bot.action('main_menu', async (ctx) => {
  const state = await readSave(ctx.from.id);
  state.currentView = 'status';
  await sendUpdate(ctx, state, Render.status(state.persons[state.current_id], state), getMainKeys(state));
});

bot.action('reset', async (ctx) => {
  const userId = ctx.from.id;
  const state = await readSave(userId);
  if (state?.pinMessageId) {
    try { await ctx.telegram.unpinChatMessage(userId, { message_id: state.pinMessageId }); await ctx.telegram.deleteMessage(userId, state.pinMessageId); } catch (e) {}
  }
  const newState = initGameState(userId);
  await writeSave(userId, newState);
  return runSetup(ctx, newState);
});

bot.on('callback_query', (ctx) => ctx.answerCbQuery());
bot.launch().then(() => console.log(`ValueLifeSim v${config.version} online!`));
