const { Markup } = require('telegraf');
const Engine = require('../src/game/engine'); // Korrekter Pfad laut Screenshot 1000029118
const Render = require('../src/ui/render'); // Korrekter Pfad laut Screenshot 1000029121
const Messenger = require('../utils/messenger');
const fs = require('fs');
const path = require('path');

class ActionHandler {
  /**
   * Behandelt den Klick auf "+ Ein Jahr älter"
   */
  static async handleAgeUp(ctx, state, writeSave) {
    if (!await Messenger.isMessageValid(ctx, state)) return;
    await ctx.answerCbQuery();

    const result = Engine.nextYear(state);
    const p = state.persons[state.current_id];

    // 1. Logik für Geburten
    if (result.type === 'birth') {
      state.setupStep = 'naming_baby';
      state.pendingBabyId = result.babyId;
      await writeSave(ctx.from.id, state);
      // Direkter Reply erforderlich für anschließende Texteingabe des Namens
      return ctx.reply(`👶 Ein ${result.gender === 'W' ? 'Mädchen' : 'Junge'} wurde geboren! Wie soll das Baby heißen?`);
    }

    // 2. Logik für die sexuelle Orientierung mit 16 Jahren
    if (p.age === 16 && !p.hasSetSexuality) {
      const sexualityKeys = Markup.inlineKeyboard([
        [Markup.button.callback('👫 Hetero', 'set_sex_hetero')],
        [Markup.button.callback('👬 Homo', 'set_sex_homo')],
        [Markup.button.callback('🌍 Bi', 'set_sex_bi')]
      ]);
      return Messenger.sendUpdate(ctx, state, "✨ Du wirst erwachsener. Wie ist deine sexuelle Orientierung?", sexualityKeys, writeSave);
    }

    // 3. Logik für Zufallsereignisse (Events)
    if (result.type === 'event') {
      const event = result.data;
      const eventKeys = Markup.inlineKeyboard(event.choices.map((choice, index) => [
        Markup.button.callback(choice.text, `choice_${event.id}_${index}`)
      ]));
      return Messenger.sendUpdate(ctx, state, `⚡️ *Ereignis!*\n\n${event.text}`, eventKeys, writeSave);
    }

    // 4. Logik für den Tod (Game Over)
    if (result.type === 'death') {
        const deathText = result.hasInheritor 
            ? `🕯 Du bist verstorben. Möchtest du als dein Kind ${result.inheritor.name} weiterspielen?`
            : `🕯 Du bist verstorben. Dein Vermächtnis endet hier.`;
        
        const deathKeys = result.hasInheritor 
            ? Markup.inlineKeyboard([[Markup.button.callback('👶 Als Erbe weiterspielen', 'reset')]]) 
            : Markup.inlineKeyboard([[Markup.button.callback('⚙️ Neues Leben', 'reset')]]);
            
        return Messenger.sendUpdate(ctx, state, deathText, deathKeys, writeSave);
    }

    // Standard-Status-Update
    // Import erfolgt lokal in der Methode, um Probleme beim Laden der bot.js zu vermeiden
    const bot = require('../src/bot'); 
    await Messenger.sendUpdate(ctx, state, Render.status(p, state), bot.getMainKeys(state), writeSave);
  }

  /**
   * Behandelt die Entscheidung bei einem Zufallsereignis
   */
  static async handleChoice(ctx, state, eventId, choiceIndex, writeSave) {
    if (!await Messenger.isMessageValid(ctx, state)) return;

    const eventsPath = path.join(process.cwd(), 'data/events.json');
    const allEvents = JSON.parse(fs.readFileSync(eventsPath, 'utf8'));
    const event = allEvents.find(e => e.id === eventId);
    if (!event) return ctx.answerCbQuery("⚠️ Event nicht gefunden.");

    const choice = event.choices[choiceIndex];

    // Engine verarbeitet die Konsequenzen
    Engine.processChoice(state, choice);
    await ctx.answerCbQuery();

    // Zurück zum Hauptstatus
    const p = state.persons[state.current_id];
    const bot = require('../src/bot');
    await Messenger.sendUpdate(ctx, state, Render.status(p, state), bot.getMainKeys(state), writeSave);
  }

  /**
   * Finalisiert die Wahl der Sexualität
   */
  static async handleSexualityFinalize(ctx, state, writeSave) {
    const p = state.persons[state.current_id];
    const bot = require('../src/bot');
    await ctx.answerCbQuery("🌈 Gespeichert!");
    return Messenger.sendUpdate(ctx, state, Render.status(p, state), bot.getMainKeys(state), writeSave);
  }
}

module.exports = ActionHandler;
