const { Telegraf, Markup } = require('telegraf');
const fs = require('fs');
const path = require('path');
const { readSave, writeSave } = require('./storage/save');
const { initGameState } = require('./game/state');
const Engine = require('./game/engine');
const Render = require('./ui/render');
const config = require('./config');

const bot = new Telegraf(process.env.BOT_TOKEN);

// Hauptmenü-Tastatur
const mainKeys = Markup.inlineKeyboard([
  [Markup.button.callback('➕ Ein Jahr älter', 'age_up')],
  [Markup.button.callback('📊 Status', 'status'), Markup.button.callback('👥 Beziehungen', 'rel')],
  [Markup.button.callback('🌳 Stammbaum', 'tree'), Markup.button.callback('⚙️ Reset', 'reset')]
]);

// Hilfsfunktion: Steuert den mehrstufigen Charakter-Erstellungsprozess
async function runSetup(ctx, state) {
  if (!state || !state.persons || !state.current_id) {
    return ctx.reply("Fehler im Spielstand. Bitte nutze /start für einen Reset.");
  }

  const p = state.persons[state.current_id];
  
  if (!p.name) {
    state.setupStep = 'name';
    await writeSave(ctx.from.id, state);
    return ctx.reply("Willkommen bei ValueLifeSim! Wie soll dein Charakter heißen?");
  }

  if (!p.gender) {
    state.setupStep = 'gender';
    await writeSave(ctx.from.id, state);
    return ctx.reply(`Hallo ${p.name}! Wähle dein Geschlecht:`, Markup.inlineKeyboard([
      [Markup.button.callback('♂ Männlich', 'set_gender_M'), 
       Markup.button.callback('♀ Weiblich', 'set_gender_W')]
    ]));
  }

  if (!state.country) {
    state.setupStep = 'country';
    await writeSave(ctx.from.id, state);
    const countriesPath = path.join(process.cwd(), 'data/countries.json');
    const countriesData = JSON.parse(fs.readFileSync(countriesPath, 'utf8'));
    const countryButtons = countriesData.map(c => [
        Markup.button.callback(`${c.flag} ${c.name}`, `set_country_${c.name}`)
    ]);
    return ctx.reply("In welchem Land wirst du geboren?", Markup.inlineKeyboard(countryButtons));
  }

  state.setupComplete = true;
  state.setupStep = 'done';
  await writeSave(ctx.from.id, state);
  return ctx.reply(`Das Abenteuer in ${state.country} beginnt! Viel Glück, ${p.name}.`, mainKeys);
}

// --- COMMANDS ---

bot.start(async (ctx) => {
  try {
    let state = await readSave(ctx.from.id);
    if (!state || !state.persons) {
      state = initGameState(ctx.from.id);
      await writeSave(ctx.from.id, state);
    }
    return runSetup(ctx, state);
  } catch (err) { console.error(err); }
});

bot.on('text', async (ctx) => {
  try {
    let state = await readSave(ctx.from.id);
    if (state && !state.setupComplete && state.setupStep === 'name') {
      state.persons[state.current_id].name = ctx.message.text.trim();
      await writeSave(ctx.from.id, state);
      return runSetup(ctx, state);
    }
  } catch (err) { console.error(err); }
});

// --- ACTIONS / SETUP ---

bot.action(/set_gender_(.*)/, async (ctx) => {
  await ctx.answerCbQuery();
  let state = await readSave(ctx.from.id);
  if (state && state.setupStep === 'gender') {
    state.persons[state.current_id].gender = ctx.match[1];
    await writeSave(ctx.from.id, state);
    return runSetup(ctx, state);
  }
});

bot.action(/set_country_(.*)/, async (ctx) => {
  await ctx.answerCbQuery();
  let state = await readSave(ctx.from.id);
  if (state && state.setupStep === 'country') {
    state.country = ctx.match[1];
    await writeSave(ctx.from.id, state);
    return runSetup(ctx, state);
  }
});

// --- ACTIONS / GAMEPLAY ---

bot.action('age_up', async (ctx) => {
  try {
    await ctx.answerCbQuery();
    const state = await readSave(ctx.from.id);
    
    // Engine berechnet das neue Jahr
    const result = Engine.nextYear(state);
    const p = state.persons[state.current_id];

    if (result.type === 'death') {
      return ctx.reply(`💀 Du bist gestorben. /start für Neuanfang.`);
    }

    // NPC Tode anzeigen
    if (result.npcDeaths && result.npcDeaths.length > 0) {
      for (const death of result.npcDeaths) {
        await ctx.reply(`🕯 Traurige Nachricht: ${death.name} (${death.relation}) ist verstorben.`);
      }
    }

    if (result.type === 'event') {
      // Buttons für das Event erstellen
      const choices = result.data.choices.map((c, i) => [
        Markup.button.callback(c.text, `choice_${result.data.id}_${i}`)
      ]);
      
      await ctx.reply(`*Jahr ${p.age} - Ereignis!*\n\n${result.data.text}`, { 
        parse_mode: 'Markdown', 
        ...Markup.inlineKeyboard(choices) 
      });
    } else {
      await ctx.reply(`Du bist jetzt ${p.age} Jahre alt.`, mainKeys);
    }
    
    await writeSave(ctx.from.id, state);
  } catch (err) { console.error(err); }
});

// KORREKTUR: Handler für Event-Entscheidungen (Choices)
bot.action(/^choice_(.*)_(.*)$/, async (ctx) => {
  try {
    const eventId = ctx.match[1];
    const choiceIdx = parseInt(ctx.match[2]);
    const state = await readSave(ctx.from.id);
    
    // Event-Daten laden, um den Effekt zu finden
    const eventsPath = path.join(process.cwd(), 'data/events.json');
    const events = JSON.parse(fs.readFileSync(eventsPath, 'utf8'));
    const event = events.find(e => e.id === eventId);
    
    if (!event) {
        await ctx.answerCbQuery("Event nicht gefunden.");
        return;
    }

    const choice = event.choices[choiceIdx];

    // Effekt via Engine auf den State anwenden
    Engine.processChoice(state, choice);
    
    await ctx.answerCbQuery();
    await writeSave(ctx.from.id, state);
    
    // Antwort senden und Hauptmenü zeigen
    await ctx.reply(`✅ ${choice.response}`, mainKeys);
  } catch (err) {
    console.error("Fehler bei choice action:", err);
  }
});

// --- INTERAKTIONS-SYSTEM ---

bot.action('main_menu', async (ctx) => {
  await ctx.answerCbQuery();
  const state = await readSave(ctx.from.id);
  ctx.reply("Was möchtest du tun?", mainKeys);
});

bot.action(/interact_(.*)/, async (ctx) => {
  await ctx.answerCbQuery();
  const npcId = ctx.match[1];
  const state = await readSave(ctx.from.id);
  const npc = state.persons[npcId];
  
  ctx.reply(`Was möchtest du mit ${npc.name} tun?\n(Beziehung: ${npc.relationship}%)`, Markup.inlineKeyboard([
    [Markup.button.callback('💬 Reden', `act_talk_${npcId}`), Markup.button.callback('🎡 Zeit verbringen', `act_spend_${npcId}`)],
    [Markup.button.callback('💰 Um Geld bitten', `act_askmoney_${npcId}`)],
    [Markup.button.callback('⬅️ Zurück', 'rel')]
  ]));
});

bot.action(/^act_talk_(.*)$/, async (ctx) => {
  const npcId = ctx.match[1];
  const state = await readSave(ctx.from.id);
  const npc = state.persons[npcId];
  
  const boost = Math.floor(Math.random() * 5) + 3;
  npc.relationship = Math.min(100, (npc.relationship || 50) + boost);
  
  await ctx.answerCbQuery(`Gespräch beendet!`);
  await writeSave(ctx.from.id, state);
  await ctx.reply(`Du hast mit ${npc.name} über Gott und die Welt geredet. (+${boost}% Beziehung)`, mainKeys);
});

bot.action(/^act_spend_(.*)$/, async (ctx) => {
  const npcId = ctx.match[1];
  const state = await readSave(ctx.from.id);
  const p = state.persons[state.current_id];
  const npc = state.persons[npcId];

  const countries = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'data/countries.json'), 'utf8'));
  const country = countries.find(c => c.name === state.country) || { cost_of_living: 1 };
  const cost = Math.floor(30 * country.cost_of_living);

  if (p.money < cost) {
    return ctx.answerCbQuery("Zu wenig Geld!", { show_alert: true });
  }

  p.money -= cost;
  const boost = Math.floor(Math.random() * 10) + 8;
  npc.relationship = Math.min(100, (npc.relationship || 50) + boost);
  p.happiness = Math.min(100, p.happiness + 10);

  await ctx.answerCbQuery();
  await writeSave(ctx.from.id, state);
  await ctx.reply(`Ihr hattet einen tollen Tag! Es hat $${cost} gekostet. (+${boost}% Beziehung)`, mainKeys);
});

bot.action(/^act_askmoney_(.*)$/, async (ctx) => {
  const npcId = ctx.match[1];
  const state = await readSave(ctx.from.id);
  const p = state.persons[state.current_id];
  const npc = state.persons[npcId];

  const success = Math.random() * 100 < npc.relationship;

  if (success && npc.money > 0) {
    const gift = Math.floor(Math.random() * 50) + 10;
    npc.money -= gift;
    p.money += gift;
    npc.relationship = Math.max(0, npc.relationship - 5);
    await ctx.answerCbQuery(`Erfolg!`);
    await ctx.reply(`${npc.name} hat dir $${gift} gegeben. Aber es war ihm/ihr etwas unangenehm.`, mainKeys);
  } else {
    npc.relationship = Math.max(0, npc.relationship - 10);
    await ctx.answerCbQuery(`Abgelehnt!`);
    await ctx.reply(`${npc.name} wollte dir kein Geld geben. Die Stimmung ist jetzt etwas angespannt.`, mainKeys);
  }
  await writeSave(ctx.from.id, state);
});

// --- REST ---

bot.action('rel', async (ctx) => {
  await ctx.answerCbQuery();
  const state = await readSave(ctx.from.id);
  const { text, keyboard } = Render.relationships(state);
  ctx.replyWithMarkdown(text, keyboard);
});

bot.action('status', async (ctx) => {
  await ctx.answerCbQuery();
  const state = await readSave(ctx.from.id);
  ctx.replyWithMarkdown(Render.status(state.persons[state.current_id], state), mainKeys);
});

bot.action('tree', async (ctx) => {
  await ctx.answerCbQuery();
  const state = await readSave(ctx.from.id);
  ctx.replyWithMarkdown(Render.tree(state), mainKeys);
});

bot.action('reset', async (ctx) => {
  await ctx.answerCbQuery();
  const state = initGameState(ctx.from.id);
  await writeSave(ctx.from.id, state);
  return runSetup(ctx, state);
});

module.exports = bot;
