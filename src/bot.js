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
    await ctx.answerCbQuery("⚠️ Diese Nachricht ist veraltet.", { show_alert: true });
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

  // NEU: Aktivitäten (Dating/Disco) erst ab 16 Jahren sichtbar
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

  // Sexualität wurde aus dem Initial-Setup entfernt und auf Alter 16 verschoben
  
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

// --- TEXT HANDLER ---

bot.on('text', async (ctx) => {
  const userId = ctx.from.id;
  let state = await readSave(userId);
  if (!state) return;

  if (!state.setupComplete && state.setupStep === 'name') {
    const input = ctx.message.text.trim();
    if (input.split(' ').length < 2) return ctx.reply("Vor- & Nachname bitte.");
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

// --- GAMEPLAY & AGE UP ---

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

  // NEU: Sexualität mit 16 abfragen
  if (p.age === 16 && !p.hasSetSexuality) {
    state.setupStep = 'sexuality';
    await writeSave(ctx.from.id, state);
    return ctx.reply("✨ Du wirst erwachsen! Was ist deine sexuelle Orientierung?", Markup.inlineKeyboard([
      [Markup.button.callback('👫 Heterosexuell', 'set_sex_hetero')],
      [Markup.button.callback('👬 Homosexuell', 'set_sex_homo')],
      [Markup.button.callback('🌍 Bisexuell', 'set_sex_bi')]
    ]));
  }

  if (result.type === 'birth') {
    state.setupStep = 'naming_baby';
    state.pendingBabyId = result.babyId;
    await writeSave(ctx.from.id, state);
    return ctx.reply(`👶 Glückwunsch! Ein ${result.gender === 'W' ? 'Mädchen' : 'Junge'} wurde geboren. Wie soll das Kind heißen?`);
  }

  let msgText = `Du bist jetzt ${p.age} Jahre alt.`;
  if (result.type === 'event') msgText = `*Ereignis!*\n\n${result.data.text}`;
  await sendUpdate(ctx, state, msgText, getMainKeys(state));
});

// --- DATING & AKTIVITÄTEN ---

bot.action('activities', async (ctx) => {
  const state = await readSave(ctx.from.id);
  const p = state.persons[state.current_id];
  
  if (p.age < 16) return ctx.answerCbQuery("Du bist noch zu jung dafür!", { show_alert: true });

  const text = "🎡 *Was möchtest du unternehmen?*";
  const keys = Markup.inlineKeyboard([
    [Markup.button.callback('💃 In die Disco gehen (-100)', 'act_disco')],
    [Markup.button.callback('📱 Finder-Dating App', 'act_finder')],
    [Markup.button.callback('⬅️ Zurück', 'main_menu')]
  ]);
  await sendUpdate(ctx, state, text, keys);
});

bot.action('act_disco', async (ctx) => {
  const state = await readSave(ctx.from.id);
  const p = state.persons[state.current_id];
  if (p.money < 100) return ctx.answerCbQuery("Zu wenig Geld!", { show_alert: true });
  p.money -= 100;
  
  if (Math.random() > 0.4) {
    const gender = (p.sexuality === 'homo' ? p.gender : (p.gender === 'M' ? 'W' : 'M'));
    const npcData = getRandomName(gender, state.country);
    const match = createPerson(npcData.full, gender, state.country);
    match.age = p.age + (Math.floor(Math.random() * 5) - 2);
    state.persons[match.id] = match;
    
    const text = `💃 In der Disco hast du ${match.name} kennengelernt!`;
    const keys = Markup.inlineKeyboard([
      [Markup.button.callback('💘 Flirten', `interact_${match.id}`)],
      [Markup.button.callback('⬅️ Zurück', 'activities')]
    ]);
    return sendUpdate(ctx, state, text, keys);
  }
  await sendUpdate(ctx, state, "💃 Die Nacht war enttäuschend. Niemand interessantes dabei.", getMainKeys(state));
});

// --- ROMANTIK ---

bot.action(/interact_(.*)/, async (ctx) => {
  const state = await readSave(ctx.from.id);
  const npc = state.persons[ctx.match[1]];
  const p = state.persons[state.current_id];
  
  let text = `👥 *Interaktion mit ${npc.name}*\nBeziehung: ${npc.relationship}% | ❤️ Liebe: ${npc.romance || 0}%`;
  let buttons = [
    [Markup.button.callback('💬 Reden', `act_talk_${npc.id}`)]
  ];

  // Romantische Interaktionen erst ab 16
  if (p.age >= 16) {
    buttons.push([Markup.button.callback('🌹 Date (Romantik steigern)', `act_romance_${npc.id}`)]);
    if ((npc.romance || 0) > 30 && p.partnerId !== npc.id) {
      buttons.push([Markup.button.callback('👫 Partnerschaft vorschlagen', `act_ask_partner_${npc.id}`)]);
    }
    if (p.partnerId === npc.id) {
      buttons.push([Markup.button.callback('💍 Heiratsantrag machen', `act_propose_${npc.id}`)]);
      if (p.gender !== npc.gender) {
        buttons.push([Markup.button.callback('🔞 Sex haben', `act_sex_${npc.id}`)]);
      }
    }
  }

  buttons.push([Markup.button.callback('⬅️ Zurück', 'rel')]);
  await sendUpdate(ctx, state, text, Markup.inlineKeyboard(buttons));
});

// --- NAVIGATION & SETTINGS ---

bot.action(/^set_sex_(.*)$/, async (ctx) => {
  const state = await readSave(ctx.from.id);
  const p = state.persons[state.current_id];
  p.sexuality = ctx.match[1];
  p.hasSetSexuality = true;
  await ctx.answerCbQuery("Präferenz gespeichert!");
  await sendUpdate(ctx, state, "✨ Du hast deine Orientierung festgelegt. Dein Leben geht weiter!", getMainKeys(state));
});

bot.action('main_menu', async (ctx) => {
  const state = await readSave(ctx.from.id);
  const p = state.persons[state.current_id];
  await sendUpdate(ctx, state, Render.status(p, state), getMainKeys(state));
});

bot.action(/set_country_(.*)/, async (ctx) => {
  const state = await readSave(ctx.from.id);
  if (state && !state.setupComplete) {
    state.country = ctx.match[1];
    finalizeParentsCulture(state, state.country);
    await ctx.answerCbQuery();
    return runSetup(ctx, state);
  }
});

bot.action(/set_gender_(.*)/, async (ctx) => {
  const state = await readSave(ctx.from.id);
  state.persons[state.current_id].gender = ctx.match[1].replace('set_gender_', '');
  return runSetup(ctx, state);
});

bot.action('reset', async (ctx) => {
  const state = initGameState(ctx.from.id);
  await writeSave(ctx.from.id, state);
  return runSetup(ctx, state);
});

bot.on('callback_query', async (ctx) => { await ctx.answerCbQuery(); });

module.exports = bot;
