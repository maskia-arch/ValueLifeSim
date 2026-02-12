const { Markup } = require('telegraf');
const Messenger = require('../utils/messenger');
const { initGameState, finalizeParentsCulture } = require('../src/game/state'); // Pfad zu src/game korrigiert
const Render = require('../src/ui/render'); // Pfad zu src/ui korrigiert

class SetupHandler {
  /**
   * Behandelt den /start Befehl. 
   * Lädt bestehende Spielstände oder startet die Erstellung.
   */
  static async handleStart(ctx, state, writeSave) {
    if (state && state.setupComplete) {
      if (state.pinMessageId) {
        try { 
          await ctx.telegram.unpinChatMessage(ctx.from.id, { message_id: state.pinMessageId }); 
          await ctx.telegram.deleteMessage(ctx.from.id, state.pinMessageId);
        } catch(e) {}
        state.pinMessageId = null;
      }
      
      const p = state.persons[state.current_id];
      const bot = require('../src/bot'); // Zentrale Logik liegt in src/bot.js
      return Messenger.sendUpdate(ctx, state, Render.status(p, state), bot.getMainKeys(state), writeSave);
    }
    
    const newState = initGameState(ctx.from.id);
    await writeSave(ctx.from.id, newState);
    return this.runSetup(ctx, newState, writeSave);
  }

  /**
   * Der schrittweise Setup-Prozess (Name -> Geschlecht -> Land)
   */
  static async runSetup(ctx, state, writeSave) {
    const p = state.persons[state.current_id];
    
    // 1. Namenswahl
    if (!p.name) {
      state.setupStep = 'name';
      await writeSave(ctx.from.id, state);
      return ctx.reply("Willkommen bei ValueLifeSim! 🌟\nWie lautet dein vollständiger Name (Vor- & Nachname)?");
    }
    
    // 2. Geschlechtswahl
    if (!p.gender) {
      state.setupStep = 'gender';
      await writeSave(ctx.from.id, state);
      const keys = Markup.inlineKeyboard([
        [Markup.button.callback('♂ Männlich', 'set_gender_M'), Markup.button.callback('♀ Weiblich', 'set_gender_W')]
      ]);
      return ctx.reply(`Hallo ${p.name}! Wähle dein Geschlecht:`, keys);
    }
    
    // 3. Länderwahl
    if (!state.country) {
      state.setupStep = 'country';
      await writeSave(ctx.from.id, state);
      const countries = ["Germany", "USA", "Turkey", "Japan"];
      const keys = Markup.inlineKeyboard(countries.map(c => [Markup.button.callback(c, `set_country_${c}`)]));
      return ctx.reply("In welchem Land wirst du geboren?", keys);
    }

    // Setup beendet
    state.setupComplete = true;
    state.diary.push(`🌟 Du wurdest als ${p.name} in ${state.country} geboren.`);
    
    const bot = require('../src/bot');
    await Messenger.sendUpdate(ctx, state, Render.status(p, state), bot.getMainKeys(state), writeSave);
    
    // Letzte Nachrichten aufräumen
    await Messenger.bulkDelete(ctx, ctx.message?.message_id || state.lastMessageId, 15);
  }

  /**
   * Verarbeitet die erste Namenseingabe und extrahiert den Familiennamen
   */
  static async handleNameInput(ctx, state, input, writeSave) {
    if (input.split(' ').length < 2) return ctx.reply("Bitte gib einen Vor- und Nachnamen an.");
    state.persons[state.current_id].name = input;
    state.familyLastName = input.split(' ').pop();
    return this.runSetup(ctx, state, writeSave);
  }

  /**
   * Verarbeitet die Namenseingabe für ein neugeborenes Baby
   */
  static async handleNamingBaby(ctx, state, input, writeSave) {
    if (!state.pendingBabyId) return;
    
    state.persons[state.pendingBabyId].name = input + " " + state.familyLastName;
    state.diary.push(`👶 Du hast dein Kind ${state.persons[state.pendingBabyId].name} genannt.`);
    
    state.setupStep = 'done';
    state.pendingBabyId = null;
    
    await Messenger.bulkDelete(ctx, ctx.message.message_id, 2);
    
    const bot = require('../src/bot');
    return Messenger.sendUpdate(ctx, state, Render.status(state.persons[state.current_id], state), bot.getMainKeys(state), writeSave);
  }

  /**
   * Setzt das Spiel per /reset Befehl zurück
   */
  static async handleReset(ctx, writeSave) {
    const newState = initGameState(ctx.from.id);
    await writeSave(ctx.from.id, newState);
    await ctx.reply("♻️ Das Spiel wurde vollständig zurückgesetzt.");
    return this.runSetup(ctx, newState, writeSave);
  }
}

module.exports = SetupHandler;
