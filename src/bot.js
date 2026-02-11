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
  
  // SETUP ABSCHLIESSEN
  state.setupComplete = true;
  state.diary.push(`🌟 Du wurdest als ${p.name} in ${state.country} geboren.`);
  
  // TIMING-FIX: Erst senden und pinnen, damit der Chat nie leer ist
  await sendUpdate(ctx, state, Render.status(p, state), getMainKeys(state));
  
  // Dann die Erstellungs-Nachrichten löschen
  const currentMsgId = ctx.callbackQuery?.message?.message_id || state.lastMessageId;
  await bulkDelete(ctx, currentMsgId, 15);
}

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
    return ctx.reply(`👶 Ein ${result.gender === 'W' ? 'Mädchen' : 'Junge'} wurde geboren! Wie soll es heißen?`);
  }

  if (p.age === 16 && !p.hasSetSexuality) {
    const keys = Markup.inlineKeyboard([[Markup.button.callback('👫 Hetero', 'set_sex_hetero')],[Markup.button.callback('👬 Homo', 'set_sex_homo')],[Markup.button.callback('🌍 Bi', 'set_sex_bi')]]);
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

bot.action(/^act_askmoney_(.*)$/, async (ctx) => {
  const state = await readSave(ctx.from.id);
  const npcId = ctx.match[1];
  const npc = state.persons[npcId];
  const p = state.persons[state.current_id];
  
  const successChance = (npc.relationship || 0) / 100;
  if (Math.random() < successChance) {
    const amount = Math.floor(Math.random() * 50) + 10;
    p.money += amount;
    npc.relationship = Math.max(0, npc.relationship - 5);
    await ctx.answerCbQuery(`💰 Erfolg! ${npc.name} hat dir ${amount}€ gegeben.`, { show_alert: true });
  } else {
    npc.relationship = Math.max(0, npc.relationship - 10);
    await ctx.answerCbQuery(`❌ Abgelehnt! ${npc.name} wollte dir kein Geld geben.`, { show_alert: true });
  }
  const { text, keyboard } = Render.relationships(state);
  await sendUpdate(ctx, state, text, keyboard);
});

bot.action(/^act_ask_rel_(.*)$/, async (ctx) => {
  const state = await readSave(ctx.from.id);
  const npcId = ctx.match[1];
  const result = Engine.attemptRelationship(state, npcId);
  await ctx.answerCbQuery(result.success ? "❤️ Erfolg!" : "💔 Ablehnung", { show_alert: true });
  await sendUpdate(ctx, state, Render.status(state.persons[state.current_id], state), getMainKeys(state));
});

bot.action(/^act_marry_(.*)$/, async (ctx) => {
  const state = await readSave(ctx.from.id);
  const npcId = ctx.match[1];
  const result = Engine.attemptMarriage(state, npcId);

  if (result.success) {
    const npc = state.persons[npcId];
    state.setupStep = 'choosing_family_name';
    state.pendingPartnerId = npcId;
    await writeSave(ctx.from.id, state);

    const keys = Markup.inlineKeyboard([
      [Markup.button.callback(`🏠 Name: ${state.familyLastName}`, `set_famname_player`)],
      [Markup.button.callback(`🏡 Name: ${npc.name.split(' ').pop()}`, `set_famname_npc`)],
      [Markup.button.callback('⌨️ Eigener Name', 'set_famname_custom')]
    ]);
    await ctx.answerCbQuery("💍 Antrag angenommen!", { show_alert: true });
    return sendUpdate(ctx, state, "🥂 *Hochzeit!*\nWelchen Nachnamen soll die Familie ab jetzt tragen?", keys);
  } else {
    const alertMsg = result.reason === 'low_relationship' ? "⚠️ Beziehung muss 100% sein!" : "💔 Antrag abgelehnt...";
    await ctx.answerCbQuery(alertMsg, { show_alert: true });
  }
});

bot.action(/^set_famname_(.*)$/, async (ctx) => {
  const state = await readSave(ctx.from.id);
  const type = ctx.match[1];
  const partner = state.persons[state.pendingPartnerId];
  const player = state.persons[state.current_id];

  if (type === 'custom') {
    state.setupStep = 'typing_custom_famname';
    await writeSave(ctx.from.id, state);
    return ctx.reply("Wie soll der neue Familienname lauten?");
  }

  let newLastName = type === 'player' ? state.familyLastName : partner.name.split(' ').pop();
  finalizeMarriage(state, newLastName);
  await ctx.answerCbQuery("💍 Frisch verheiratet!");
  await sendUpdate(ctx, state, Render.status(player, state), getMainKeys(state));
});

bot.action(/^act_sex_(.*)$/, async (ctx) => {
  const state = await readSave(ctx.from.id);
  const npcId = ctx.match[1];
  const p = state.persons[state.current_id];
  const chance = p.gender === 'W' ? 0.25 : 0.15;
  if (Math.random() < chance) {
    p.isPregnant = true;
    await ctx.answerCbQuery("🔞 Das war intensiv... Du fühlst dich irgendwie anders.", { show_alert: true });
  } else {
    await ctx.answerCbQuery("🔞 Ihr hattet eine schöne Zeit zusammen.", { show_alert: true });
  }
  await sendUpdate(ctx, state, Render.status(p, state), getMainKeys(state));
});

bot.action(/^interact_(.*)$/, async (ctx) => {
  const state = await readSave(ctx.from.id);
  const npcId = ctx.match[1];
  const npc = state.persons[npcId];
  const p = state.persons[state.current_id];
  if (!npc) return ctx.answerCbQuery("Fehler");
  
  const isParent = (npcId === p.motherId || npcId === p.fatherId);
  const isPartner = (npcId === p.partnerId);
  
  await ctx.answerCbQuery();
  let text = `👥 *Interaktion mit ${npc.name}*\nBeziehung: ${npc.relationship}%`;
  const buttons = [[Markup.button.callback('💬 Reden', `act_talk_${npcId}`), Markup.button.callback('🎁 Geschenk', `act_gift_${npcId}`)]];
  
  if (isParent) {
    buttons.push([Markup.button.callback('💰 Nach Geld fragen', `act_askmoney_${npcId}`)]);
  } else if (p.age >= 16) {
    if (isPartner && npc.relationship === 100) {
      buttons.push([Markup.button.callback('💍 Heiraten', `act_marry_${npcId}`)]);
    }
    if (isPartner) {
      buttons.push([Markup.button.callback('🔞 Sex haben', `act_sex_${npcId}`)]);
    } else if (npc.relationship >= 80) {
      buttons.push([Markup.button.callback('❤️ Beziehungsantrag', `act_ask_rel_${npcId}`)]);
    }
  }
  
  buttons.push([Markup.button.callback('⬅️ Zurück', 'rel')]);
  await sendUpdate(ctx, state, text, Markup.inlineKeyboard(buttons));
});

// --- TEXT HANDLER ---

bot.on('text', async (ctx) => {
  const state = await readSave(ctx.from.id);
  if (!state) return;

  if (state.setupStep === 'typing_custom_famname') {
    finalizeMarriage(state, ctx.message.text.trim());
    await bulkDelete(ctx, ctx.message.message_id, 2);
    await ctx.reply(`💍 Neuer Familienname: ${state.familyLastName}`);
    return sendUpdate(ctx, state, Render.status(state.persons[state.current_id], state), getMainKeys(state));
  }

  if (state.setupStep === 'naming_baby' && state.pendingBabyId) {
    const babyName = ctx.message.text.trim();
    const baby = state.persons[state.pendingBabyId];
    baby.name = babyName + " " + state.familyLastName;
    state.setupStep = 'done';
    state.pendingBabyId = null;
    await bulkDelete(ctx, ctx.message.message_id, 2);
    await ctx.reply(`✨ ${baby.name} wurde in die Familie aufgenommen!`);
    return sendUpdate(ctx, state, Render.status(state.persons[state.current_id], state), getMainKeys(state));
  }

  if (!state.setupComplete && state.setupStep === 'name') {
    const input = ctx.message.text.trim();
    if (input.split(' ').length < 2) return ctx.reply("❌ Bitte Vor- & Nachname.");
    state.familyLastName = input.split(' ').pop();
    state.persons[state.current_id].name = input;
    state.setupStep = 'gender';
    await writeSave(ctx.from.id, state);
    return runSetup(ctx, state);
  }
});

// --- NAVIGATION & SYSTEM ---

bot.action('rel', async (ctx) => {
  const state = await readSave(ctx.from.id);
  if (!await isMessageValid(ctx, state)) return;
  const { text, keyboard } = Render.relationships(state);
  await sendUpdate(ctx, state, text, keyboard);
});

bot.action('activities', async (ctx) => {
  const state = await readSave(ctx.from.id);
  if (!await isMessageValid(ctx, state)) return;
  await sendUpdate(ctx, state, "🎡 *Aktivitäten*", Markup.inlineKeyboard([[Markup.button.callback('💃 Disco (100€)', 'act_disco'), Markup.button.callback('📱 Finder', 'act_finder')],[Markup.button.callback('⬅️ Zurück', 'main_menu')]]));
});

bot.action('main_menu', async (ctx) => {
  const state = await readSave(ctx.from.id);
  await sendUpdate(ctx, state, Render.status(state.persons[state.current_id], state), getMainKeys(state));
});

bot.action('reset', async (ctx) => {
  const userId = ctx.from.id;
  const state = await readSave(userId);
  if (state?.pinMessageId) {
    try { await ctx.telegram.unpinChatMessage(userId, { message_id: state.pinMessageId }); await ctx.telegram.deleteMessage(userId, state.pinMessageId); } catch (e) {}
  }
  await bulkDelete(ctx, ctx.callbackQuery?.message?.message_id, 35);
  const newState = initGameState(userId);
  await writeSave(userId, newState);
  return runSetup(ctx, newState);
});

bot.action(/^choice_(.*)_(.*)$/, async (ctx) => {
  const [_, eventId, choiceIdx] = ctx.match;
  const state = await readSave(ctx.from.id);
  const events = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'data/events.json'), 'utf8'));
  const event = events.find(e => e.id === eventId);
  Engine.processChoice(state, event.choices[parseInt(choiceIdx)]);
  await ctx.answerCbQuery(`✅ Bestätigt`, { show_alert: true });
  await sendUpdate(ctx, state, Render.status(state.persons[state.current_id], state), getMainKeys(state));
});

bot.action(/^act_talk_(.*)$/, async (ctx) => {
  const state = await readSave(ctx.from.id);
  const npc = state.persons[ctx.match[1]];
  npc.relationship = Math.min(100, (npc.relationship || 0) + 5);
  await ctx.answerCbQuery(`💬 Gespräch mit ${npc.name} geführt.`, { show_alert: true });
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
  await ctx.answerCbQuery(`🎁 Geschenk für ${npc.name} gekauft.`, { show_alert: true });
  const { text, keyboard } = Render.relationships(state);
  await sendUpdate(ctx, state, text, keyboard);
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

bot.action(/set_sex_(.*)/, async (ctx) => {
  const state = await readSave(ctx.from.id);
  const p = state.persons[state.current_id];
  p.sexuality = ctx.match[1];
  p.hasSetSexuality = true;
  await ctx.answerCbQuery("Präferenz gespeichert.");
  await sendUpdate(ctx, state, Render.status(p, state), getMainKeys(state));
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

// START MIT DYNAMISCHER VERSION AUS CONFIG
bot.launch().then(() => console.log(`ValueLifeSim v${config.version} online!`));
