const { Telegraf, Markup } = require('telegraf');
const fs = require('fs');
const path = require('path');
const { readSave, writeSave } = require('./storage/save');
const { initGameState } = require('./game/state');
const Engine = require('./game/engine');
const Render = require('./ui/render');
const config = require('./config');

const bot = new Telegraf(process.env.BOT_TOKEN);

// Hilfsfunktion: Prüft, ob das Spiel vorbei ist
const checkGameOver = (state) => state.isGameOver || !state.persons[state.current_id].isAlive;

// Hauptmenü-Tastatur (dynamisch)
const getMainKeys = (state) => {
  if (state.isGameOver) {
    return Markup.inlineKeyboard([[Markup.button.callback('⚙️ Neustart (Stammbaum erloschen)', 'reset')]]);
  }
  return Markup.inlineKeyboard([
    [Markup.button.callback('➕ Ein Jahr älter', 'age_up')],
    [Markup.button.callback('📊 Status', 'status'), Markup.button.callback('👥 Beziehungen', 'rel')],
    [Markup.button.callback('🌳 Stammbaum', 'tree'), Markup.button.callback('⚙️ Reset', 'reset')]
  ]);
};

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
      [Markup.button.callback('♂ Männlich', 'set_gender_M'), Markup.button.callback('♀ Weiblich', 'set_gender_W')]
    ]));
  }
  if (!state.country) {
    state.setupStep = 'country';
    await writeSave(ctx.from.id, state);
    const countriesPath = path.join(process.cwd(), 'data/countries.json');
    const countriesData = JSON.parse(fs.readFileSync(countriesPath, 'utf8'));
    const countryButtons = countriesData.map(c => [Markup.button.callback(`${c.flag} ${c.name}`, `set_country_${c.name}`)]);
    return ctx.reply("In welchem Land wirst du geboren?", Markup.inlineKeyboard(countryButtons));
  }
  state.setupComplete = true;
  state.setupStep = 'done';
  await writeSave(ctx.from.id, state);
  return ctx.reply(`Das Abenteuer in ${state.country} beginnt! Viel Glück, ${p.name}.`, getMainKeys(state));
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

// --- ACTIONS / GAMEPLAY ---
bot.action('age_up', async (ctx) => {
  try {
    const state = await readSave(ctx.from.id);
    if (checkGameOver(state)) return ctx.answerCbQuery("Dieses Leben ist vorbei.");
    await ctx.answerCbQuery();
    
    const result = Engine.nextYear(state);
    const p = state.persons[state.current_id];

    if (result.type === 'death') {
      if (result.hasInheritor) {
        const child = result.inheritor;
        return ctx.reply(`💀 Du bist gestorben. Aber dein Erbe lebt weiter!\n\nMöchtest du als dein Kind *${child.name}* (${child.age} J.) weiterspielen?`, 
          Markup.inlineKeyboard([[Markup.button.callback(`🕹 Als ${child.name} weiterspielen`, `inherit_${child.id}`)], [Markup.button.callback('⚙️ Neu anfangen', 'reset')]]));
      } else {
        state.isGameOver = true;
        await writeSave(ctx.from.id, state);
        return ctx.reply("💀 Du bist gestorben und hast keine Nachkommen. Dein Stammbaum endet hier.", getMainKeys(state));
      }
    }

    if (result.npcDeaths && result.npcDeaths.length > 0) {
      for (const death of result.npcDeaths) await ctx.reply(`🕯 ${death.name} (${death.relation}) ist verstorben.`);
    }

    if (result.type === 'event') {
      const choices = result.data.choices.map((c, i) => [Markup.button.callback(c.text, `choice_${result.data.id}_${i}`)]);
      await ctx.reply(`*Jahr ${p.age} - Ereignis!*\n\n${result.data.text}`, { parse_mode: 'Markdown', ...Markup.inlineKeyboard(choices) });
    } else {
      await ctx.reply(`Du bist jetzt ${p.age} Jahre alt.`, getMainKeys(state));
    }
    await writeSave(ctx.from.id, state);
  } catch (err) { console.error(err); }
});

// Klick-Exploit Schutz & Event Handler
bot.action(/^choice_(.*)_(.*)$/, async (ctx) => {
  try {
    const [_, eventId, choiceIdx] = ctx.match;
    const state = await readSave(ctx.from.id);
    
    // Prüfen, ob das Event noch aktiv ist (Verhindert Mehrfach-Klicks)
    if (state.activeEventId !== eventId) {
      return ctx.answerCbQuery("Dieses Ereignis ist bereits abgeschlossen.", { show_alert: true });
    }

    const events = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'data/events.json'), 'utf8'));
    const event = events.find(e => e.id === eventId);
    if (!event) return ctx.answerCbQuery("Fehler.");

    const choice = event.choices[parseInt(choiceIdx)];
    Engine.processChoice(state, choice); // Setzt activeEventId auf null
    
    await ctx.answerCbQuery();
    await writeSave(ctx.from.id, state);
    await ctx.reply(`✅ ${choice.response}`, getMainKeys(state));
  } catch (err) { console.error(err); }
});

// Erbe-Übernahme
bot.action(/^inherit_(.*)$/, async (ctx) => {
  try {
    const nextId = ctx.match[1];
    const state = await readSave(ctx.from.id);
    const newChar = state.persons[nextId];
    
    state.current_id = nextId;
    await writeSave(ctx.from.id, state);
    await ctx.answerCbQuery();
    await ctx.reply(`Ein neues Kapitel beginnt! Du bist jetzt ${newChar.name}.`, getMainKeys(state));
  } catch (err) { console.error(err); }
});

// --- RESTLICHE HANDLER (MIT SPERRE) ---
bot.action('status', async (ctx) => {
  const state = await readSave(ctx.from.id);
  await ctx.answerCbQuery();
  ctx.replyWithMarkdown(Render.status(state.persons[state.current_id], state), getMainKeys(state));
});

bot.action('rel', async (ctx) => {
  const state = await readSave(ctx.from.id);
  if (checkGameOver(state)) return ctx.answerCbQuery("Kein Zugriff.");
  await ctx.answerCbQuery();
  const { text, keyboard } = Render.relationships(state);
  ctx.replyWithMarkdown(text, keyboard);
});

bot.action('reset', async (ctx) => {
  await ctx.answerCbQuery("Reset...");
  const state = initGameState(ctx.from.id);
  await writeSave(ctx.from.id, state);
  return runSetup(ctx, state);
});

// Dummy Handler für andere Actions
bot.on('callback_query', async (ctx) => { await ctx.answerCbQuery(); });
bot.on('text', async (ctx) => { /* Setup Logik hier lassen */ });

module.exports = bot;
