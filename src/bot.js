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
  
  // 1. Name abfragen
  if (!p.name) {
    state.setupStep = 'name';
    await writeSave(ctx.from.id, state);
    return ctx.reply("Willkommen bei ValueLifeSim! Wie soll dein Charakter heißen?");
  }

  // 2. Geschlecht abfragen
  if (!p.gender) {
    state.setupStep = 'gender';
    await writeSave(ctx.from.id, state);
    return ctx.reply(`Hallo ${p.name}! Wähle dein Geschlecht:`, Markup.inlineKeyboard([
      [Markup.button.callback('♂ Männlich', 'set_gender_M'), 
       Markup.button.callback('♀ Weiblich', 'set_gender_W')]
    ]));
  }

  // 3. Land abfragen
  if (!state.country) {
    state.setupStep = 'country';
    await writeSave(ctx.from.id, state);
    
    const countriesPath = path.join(process.cwd(), 'data/countries.json');
    const countriesData = JSON.parse(fs.readFileSync(countriesPath, 'utf8'));
    
    // Erstellt Buttons mit Flagge aus der JSON
    const countryButtons = countriesData.map(c => [
        Markup.button.callback(`${c.flag} ${c.name}`, `set_country_${c.name}`)
    ]);
    
    return ctx.reply("In welchem Land wirst du geboren?", Markup.inlineKeyboard(countryButtons));
  }

  // 4. Setup abschließen
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
  } catch (err) {
    console.error("Start Error:", err);
  }
});

bot.on('text', async (ctx) => {
  try {
    let state = await readSave(ctx.from.id);
    if (state && !state.setupComplete && state.setupStep === 'name') {
      state.persons[state.current_id].name = ctx.message.text.trim();
      await writeSave(ctx.from.id, state); // WICHTIG: Speichern!
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
    await writeSave(ctx.from.id, state); // FIX: Speichern vor dem nächsten Schritt!
    return runSetup(ctx, state);
  }
});

bot.action(/set_country_(.*)/, async (ctx) => {
  await ctx.answerCbQuery();
  let state = await readSave(ctx.from.id);
  if (state && state.setupStep === 'country') {
    state.country = ctx.match[1];
    await writeSave(ctx.from.id, state); // FIX: Speichern vor dem Abschluss!
    return runSetup(ctx, state);
  }
});

// --- ACTIONS / GAMEPLAY ---

bot.action('age_up', async (ctx) => {
  try {
    await ctx.answerCbQuery();
    const state = await readSave(ctx.from.id);
    if (!state.setupComplete) return runSetup(ctx, state);

    const result = Engine.nextYear(state);
    const p = state.persons[state.current_id];

    if (result.type === 'death') {
      return ctx.reply(`💀 Du bist gestorben. /start für Neuanfang.`);
    }

    if (result.npcDeaths && result.npcDeaths.length > 0) {
      for (const death of result.npcDeaths) {
        await ctx.reply(`🕯 Traurige Nachricht: ${death.name} (${death.relation}) ist verstorben.`);
      }
    }

    if (result.type === 'event') {
      const choices = result.data.choices.map((c, i) => [Markup.button.callback(c.text, `choice_${result.data.id}_${i}`)]);
      await ctx.reply(`*Jahr ${p.age}*\n\n${result.data.text}`, { parse_mode: 'Markdown', ...Markup.inlineKeyboard(choices) });
    } else {
      await ctx.reply(`Du bist jetzt ${p.age} Jahre alt.`, mainKeys);
    }
    await writeSave(ctx.from.id, state);
  } catch (err) { console.error(err); }
});

bot.action(/interact_(.*)/, async (ctx) => {
  await ctx.answerCbQuery();
  const npcId = ctx.match[1];
  const state = await readSave(ctx.from.id);
  ctx.reply(`Was möchtest du mit ${state.persons[npcId].name} tun?`, Markup.inlineKeyboard([
    [Markup.button.callback('💬 Reden', `act_talk_${npcId}`), Markup.button.callback('🎡 Zeit verbringen', `act_spend_${npcId}`)],
    [Markup.button.callback('⬅️ Zurück', 'rel')]
  ]));
});

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

bot.action('reset', async (ctx) => {
  await ctx.answerCbQuery();
  const state = initGameState(ctx.from.id);
  await writeSave(ctx.from.id, state);
  return runSetup(ctx, state);
});

module.exports = bot;
