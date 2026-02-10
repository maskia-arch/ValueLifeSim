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

// Hilfsfunktion: Steuert den Charakter-Erstellungsprozess
async function runSetup(ctx, state) {
  // Sicherheitscheck: Falls state oder persons fehlen
  if (!state || !state.persons || !state.current_id) {
    return ctx.reply("Fehler im Spielstand. Bitte nutze /start für einen Reset.");
  }

  const p = state.persons[state.current_id];
  
  // 1. Name abfragen
  if (!p.name) {
    return ctx.reply("Willkommen bei ValueLifeSim! Wie soll dein Charakter heißen? (Schreib mir einfach den Namen)");
  }

  // 2. Geschlecht abfragen
  if (!p.gender) {
    return ctx.reply(`Hallo ${p.name}! Wähle dein Geschlecht:`, Markup.inlineKeyboard([
      [Markup.button.callback('♂ Männlich', 'set_gender_M'), 
       Markup.button.callback('♀ Weiblich', 'set_gender_W')]
    ]));
  }

  // 3. Setup abschließen
  state.setupComplete = true;
  await writeSave(ctx.from.id, state);
  return ctx.reply(`Das Abenteuer beginnt! Viel Glück, ${p.name}.`, mainKeys);
}

// --- COMMANDS ---

bot.start(async (ctx) => {
  try {
    let state = await readSave(ctx.from.id);
    
    // Wenn kein Spielstand existiert oder dieser veraltet/kaputt ist
    if (!state || !state.persons) {
      state = initGameState(ctx.from.id);
      await writeSave(ctx.from.id, state);
    }
    
    if (!state.setupComplete) {
      return runSetup(ctx, state);
    }
    
    ctx.reply(`Willkommen zurück bei ValueLifeSim v${config.version}, ${state.persons[state.current_id].name}!`, mainKeys);
  } catch (err) {
    console.error("Fehler im Bot-Start:", err);
    ctx.reply("Ein technischer Fehler ist aufgetreten. Bitte versuche es mit /start erneut.");
  }
});

// Empfängt den geschriebenen Namen
bot.on('text', async (ctx) => {
  try {
    let state = await readSave(ctx.from.id);
    if (state && !state.setupComplete) {
      const p = state.persons[state.current_id];
      if (p && !p.name) {
        p.name = ctx.message.text.trim();
        await writeSave(ctx.from.id, state);
        return runSetup(ctx, state);
      }
    }
  } catch (err) {
    console.error("Fehler bei Texteingabe:", err);
  }
});

// --- ACTIONS / BUTTONS ---

bot.action(/set_gender_(.*)/, async (ctx) => {
  try {
    await ctx.answerCbQuery();
    const gender = ctx.match[1];
    let state = await readSave(ctx.from.id);
    
    if (state && !state.setupComplete) {
      const p = state.persons[state.current_id];
      p.gender = gender;
      await writeSave(ctx.from.id, state);
      return runSetup(ctx, state);
    }
  } catch (err) {
    console.error("Fehler bei set_gender:", err);
  }
});

bot.action('age_up', async (ctx) => {
  try {
    await ctx.answerCbQuery();
    const state = await readSave(ctx.from.id);
    if (!state || !state.setupComplete) return runSetup(ctx, state);

    const result = Engine.nextYear(state);
    const p = state.persons[state.current_id];

    if (result.type === 'death') {
      await ctx.reply(`💀 Du bist im Alter von ${p.age} Jahren gestorben.`);
      return ctx.reply("Nutze /start für einen Neuanfang.");
    }

    if (result.type === 'event') {
      const evt = result.data;
      const choices = evt.choices.map((c, i) => [Markup.button.callback(c.text, `choice_${evt.id}_${i}`)]);
      
      await ctx.reply(`*Jahr ${p.age} - Ereignis!*\n\n${evt.text}`, {
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard(choices)
      });
    } else {
      await ctx.reply(`Ein Jahr vergeht... Du bist jetzt ${p.age} Jahre alt.`, mainKeys);
    }
    await writeSave(ctx.from.id, state);
  } catch (err) {
    console.error("Fehler in age_up:", err);
  }
});

bot.action(/^choice_(.*)_(.*)$/, async (ctx) => {
  try {
    const [_, eId, cIdx] = ctx.match;
    const state = await readSave(ctx.from.id);
    
    const eventsPath = path.join(process.cwd(), 'data/events.json');
    const events = JSON.parse(fs.readFileSync(eventsPath, 'utf8'));
    const event = events.find(e => e.id === eId);
    const choice = event.choices[cIdx];

    Engine.processChoice(state, choice);
    await writeSave(ctx.from.id, state);
    await ctx.answerCbQuery(choice.text);
    await ctx.reply(choice.response, mainKeys);
  } catch (err) {
    console.error("Fehler bei Event-Wahl:", err);
  }
});

bot.action('rel', async (ctx) => {
  try {
    await ctx.answerCbQuery();
    const state = await readSave(ctx.from.id);
    if (!state || !state.setupComplete) return runSetup(ctx, state);
    ctx.replyWithMarkdown(Render.relationships(state), mainKeys);
  } catch (err) {
    console.error("Fehler in Beziehungen:", err);
  }
});

bot.action('status', async (ctx) => {
  try {
    await ctx.answerCbQuery();
    const state = await readSave(ctx.from.id);
    if (!state || !state.setupComplete) return runSetup(ctx, state);
    const p = state.persons[state.current_id];
    ctx.replyWithMarkdown(Render.status(p), mainKeys);
  } catch (err) {
    console.error("Fehler in Status:", err);
  }
});

bot.action('tree', async (ctx) => {
  try {
    await ctx.answerCbQuery();
    const state = await readSave(ctx.from.id);
    if (!state || !state.setupComplete) return runSetup(ctx, state);
    ctx.replyWithMarkdown(Render.tree(state), mainKeys);
  } catch (err) {
    console.error("Fehler in Stammbaum:", err);
  }
});

bot.action('reset', async (ctx) => {
  try {
    await ctx.answerCbQuery("Reset...");
    const state = initGameState(ctx.from.id);
    await writeSave(ctx.from.id, state);
    ctx.reply("Spiel zurückgesetzt.");
    return runSetup(ctx, state);
  } catch (err) {
    console.error("Fehler bei Reset:", err);
  }
});

module.exports = bot;
