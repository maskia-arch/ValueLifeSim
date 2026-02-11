const { Telegraf, Markup } = require('telegraf');
const fs = require('fs');
const path = require('path');
const { readSave, writeSave } = require('./storage/save');
const { initGameState } = require('./game/state');
const Engine = require('./game/engine');
const Render = require('./ui/render');
const config = require('./config');

const bot = new Telegraf(process.env.BOT_TOKEN);

// --- HILFSFUNKTIONEN ---

const checkGameOver = (state) => state.isGameOver || !state.persons[state.current_id].isAlive;

/**
 * SICHERHEITS-CHECK: Verhindert Klicks auf veraltete Nachrichten
 */
async function isMessageValid(ctx, state) {
  if (!state.setupComplete) return true; 

  const currentMsgId = ctx.callbackQuery?.message?.message_id;
  if (state.lastMessageId && currentMsgId !== state.lastMessageId) {
    await ctx.answerCbQuery("⚠️ Diese Nachricht ist veraltet. Bitte nutze das aktuelle Menü unten.", { show_alert: true });
    return false;
  }
  return true;
}

async function clearChat(ctx, state) {
  if (state.lastMessageId) {
    try {
      await ctx.telegram.deleteMessage(ctx.from.id, state.lastMessageId);
    } catch (err) { /* Ignorieren */ }
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
  return Markup.inlineKeyboard([
    [Markup.button.callback('➕ Ein Jahr älter', 'age_up')],
    [Markup.button.callback('📊 Status', 'status'), Markup.button.callback('👥 Beziehungen', 'rel')],
    [Markup.button.callback('📖 Tagebuch', 'diary'), Markup.button.callback('🌳 Stammbaum', 'tree')],
    [Markup.button.callback('⚙️ Reset', 'reset')]
  ]);
};

async function runSetup(ctx, state) {
  if (!state || !state.persons || !state.current_id) {
    return ctx.reply("Fehler im Spielstand. Bitte nutze /start für einen Reset.");
  }
  const p = state.persons[state.current_id];
  
  // 1. NAME (Vor- und Nachname Pflicht)
  if (!p.name || p.name.trim() === "") {
    state.setupStep = 'name';
    await writeSave(ctx.from.id, state);
    return ctx.reply(`Willkommen! Dein Familienname ist *${state.familyLastName}*.\n\nWie lautet dein vollständiger Name (Vor- und Nachname)?`);
  }
  
  // 2. GESCHLECHT
  if (!p.gender) {
    state.setupStep = 'gender';
    await writeSave(ctx.from.id, state);
    return ctx.reply(`Hallo ${p.name}! Wähle dein Geschlecht:`, Markup.inlineKeyboard([
      [Markup.button.callback('♂ Männlich', 'set_gender_M'), Markup.button.callback('♀ Weiblich', 'set_gender_W')]
    ]));
  }
  
  // 3. LAND
  if (!state.country) {
    state.setupStep = 'country';
    await writeSave(ctx.from.id, state);
    // Hier nutzen wir die Länderliste aus state.js Logik oder config
    const countries = ["Germany", "USA", "Turkey", "Japan"];
    const countryButtons = countries.map(c => [Markup.button.callback(c, `set_country_${c}`)]);
    return ctx.reply("In welchem Land wirst du geboren?", Markup.inlineKeyboard(countryButtons));
  }
  
  state.setupComplete = true;
  state.setupStep = 'done';
  
  if (!state.diary) state.diary = [];
  state.diary.push(`🌟 Geburt: Du wurdest als ${p.name} in ${state.country} geboren.`);
  
  await sendUpdate(ctx, state, `Das Abenteuer in ${state.country} beginnt! Viel Glück, ${p.name}.`, getMainKeys(state));
}

// --- COMMANDS & TEXT ---

bot.start(async (ctx) => {
  try {
    let state = await readSave(ctx.from.id);
    if (!state || !state.persons) {
      state = initGameState(ctx.from.id);
    }
    return runSetup(ctx, state);
  } catch (err) { console.error(err); }
});

bot.on('text', async (ctx) => {
  try {
    const userId = ctx.from.id;
    let state = await readSave(userId);
    
    if (state && !state.setupComplete && state.setupStep === 'name') {
      const input = ctx.message.text.trim();
      const parts = input.split(' ');

      // Validierung: Mindestens zwei Namen
      if (parts.length < 2) {
        return ctx.reply("❌ Bitte gib sowohl einen Vornamen als auch deinen Nachnamen an.");
      }

      const lastName = parts[parts.length - 1];
      
      // Validierung: Nachname muss mit Familie übereinstimmen
      if (lastName.toLowerCase() !== state.familyLastName.toLowerCase()) {
        return ctx.reply(`❌ Dein Nachname muss *${state.familyLastName}* lauten, um zu deiner Familie zu gehören.`);
      }

      state.persons[state.current_id].name = input;
      await writeSave(userId, state);
      return runSetup(ctx, state);
    }
  } catch (err) { console.error("Text Handler Error:", err); }
});

// --- GAMEPLAY ACTIONS ---

bot.action('age_up', async (ctx) => {
  try {
    const state = await readSave(ctx.from.id);
    if (!await isMessageValid(ctx, state)) return;
    if (checkGameOver(state)) return ctx.answerCbQuery("Dieses Leben ist vorbei.");
    await ctx.answerCbQuery();
    
    const result = Engine.nextYear(state);
    const p = state.persons[state.current_id];

    if (result.type === 'death') {
      let deathMsg = `💀 Du bist gestorben.`;
      let keys = Markup.inlineKeyboard([[Markup.button.callback('⚙️ Reset', 'reset')]]);
      
      if (result.hasInheritor) {
        deathMsg += ` Aber dein Erbe lebt weiter!`;
        keys = Markup.inlineKeyboard([
          [Markup.button.callback(`🕹 Als ${result.inheritor.name} spielen`, `inherit_${result.inheritor.id}`)],
          [Markup.button.callback('⚙️ Reset', 'reset')]
        ]);
      } else { state.isGameOver = true; }
      return sendUpdate(ctx, state, deathMsg, keys);
    }

    let msgText = result.npcDeaths.length > 0 
      ? `Du bist jetzt ${p.age} Jahre alt.\n\nSchwere Zeiten: ${result.npcDeaths.map(d => `${d.name} (${d.relation})`).join(', ')} ist verstorben.`
      : `Du bist jetzt ${p.age} Jahre alt.`;
      
    let keys = getMainKeys(state);

    if (result.type === 'event') {
      msgText = `*Jahr ${p.age} - Ereignis!*\n\n${result.data.text}`;
      keys = Markup.inlineKeyboard(result.data.choices.map((c, i) => [Markup.button.callback(c.text, `choice_${result.data.id}_${i}`)]));
    }
    await sendUpdate(ctx, state, msgText, keys);
  } catch (err) { console.error(err); }
});

bot.action(/^choice_(.*)_(.*)$/, async (ctx) => {
  try {
    const [_, eventId, choiceIdx] = ctx.match;
    const state = await readSave(ctx.from.id);
    if (!await isMessageValid(ctx, state)) return;
    if (state.activeEventId !== eventId) return ctx.answerCbQuery("Bereits abgeschlossen.");

    const events = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'data/events.json'), 'utf8'));
    const event = events.find(e => e.id === eventId);
    const choice = event.choices[parseInt(choiceIdx)];
    
    Engine.processChoice(state, choice);
    await ctx.answerCbQuery();
    await sendUpdate(ctx, state, `✅ ${choice.response}`, getMainKeys(state));
  } catch (err) { console.error(err); }
});

// --- NAVIGATION & STATUS ---

bot.action('diary', async (ctx) => {
  const state = await readSave(ctx.from.id);
  if (!await isMessageValid(ctx, state)) return;
  await ctx.answerCbQuery();
  await sendUpdate(ctx, state, Render.diary(state), getMainKeys(state));
});

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

bot.action('tree', async (ctx) => {
  const state = await readSave(ctx.from.id);
  if (!await isMessageValid(ctx, state)) return;
  await ctx.answerCbQuery();
  await sendUpdate(ctx, state, Render.tree(state), getMainKeys(state));
});

bot.action('reset', async (ctx) => {
  await ctx.answerCbQuery("Reset...");
  const state = initGameState(ctx.from.id);
  try { await ctx.deleteMessage(); } catch(e) {}
  await writeSave(ctx.from.id, state);
  return runSetup(ctx, state);
});

// --- SETUP ACTIONS ---

bot.action(/set_gender_(.*)/, async (ctx) => {
  const state = await readSave(ctx.from.id);
  if (state && !state.setupComplete) {
    state.persons[state.current_id].gender = ctx.match[1];
    await ctx.answerCbQuery();
    try { await ctx.deleteMessage(); } catch(e) {}
    return runSetup(ctx, state);
  }
});

bot.action(/set_country_(.*)/, async (ctx) => {
  const state = await readSave(ctx.from.id);
  if (state && !state.setupComplete) {
    state.country = ctx.match[1];
    await ctx.answerCbQuery();
    try { await ctx.deleteMessage(); } catch(e) {}
    return runSetup(ctx, state);
  }
});

bot.action(/interact_(.*)/, async (ctx) => {
  const state = await readSave(ctx.from.id);
  if (!await isMessageValid(ctx, state)) return;
  const npc = state.persons[ctx.match[1]];
  await ctx.answerCbQuery();
  
  const text = `👥 *Interaktion mit ${npc.name}*\nBeziehung: ${npc.relationship}%`;
  const keyboard = Markup.inlineKeyboard([
    [Markup.button.callback('💬 Reden', `act_talk_${npc.id}`), Markup.button.callback('🎡 Zeit verbringen', `act_spend_${npc.id}`)],
    [Markup.button.callback('💰 Um Geld bitten', `act_askmoney_${npc.id}`)],
    [Markup.button.callback('⬅️ Zurück', 'rel')]
  ]);
  
  await sendUpdate(ctx, state, text, keyboard);
});

bot.on('callback_query', async (ctx) => { await ctx.answerCbQuery(); });

module.exports = bot;
