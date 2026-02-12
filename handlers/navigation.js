const { Markup } = require('telegraf');
const Render = require('../src/ui/render'); // Pfad für Status & Finder
const SocialRender = require('../src/ui/social_render'); // Neu: Für Beziehungen
const HistoryRender = require('../src/ui/history'); // Neu: Für Stammbaum & Tagebuch
const Messenger = require('../utils/messenger');
const Engine = require('../src/game/engine'); // Pfad für Engine

class NavigationHandler {
  /**
   * Wechselt zur Stammbaum-Ansicht (Tree) - Nutzt den neuen Filter gegen Fremde im Baum
   */
  static async handleTree(ctx, state, writeSave) {
    if (!await Messenger.isMessageValid(ctx, state)) return;
    await ctx.answerCbQuery();

    const bot = require('../src/src/bot'); // Korrigierter Pfad zur Bot-Zentrale

    // Toggle-Logik: Zurück zum Hauptmenü, wenn man bereits im Baum ist
    if (state.currentView === 'tree') {
      state.currentView = 'status';
      const p = state.persons[state.current_id];
      return Messenger.sendUpdate(ctx, state, Render.status(p, state), bot.getMainKeys(state), writeSave);
    }

    state.currentView = 'tree';
    // Nutzt jetzt HistoryRender für den gefilterten Stammbaum (entfernt Bekannte)
    const treeText = HistoryRender.tree(state); 
    await Messenger.sendUpdate(ctx, state, treeText, bot.getMainKeys(state), writeSave);
  }

  /**
   * Wechselt zur Tagebuch-Ansicht (Diary)
   */
  static async handleDiary(ctx, state, writeSave) {
    if (!await Messenger.isMessageValid(ctx, state)) return;
    await ctx.answerCbQuery();

    const bot = require('../src/src/bot');

    if (state.currentView === 'diary') {
      state.currentView = 'status';
      const p = state.persons[state.current_id];
      return Messenger.sendUpdate(ctx, state, Render.status(p, state), bot.getMainKeys(state), writeSave);
    }

    state.currentView = 'diary';
    // Nutzt jetzt HistoryRender für das chronologische Tagebuch
    const diaryText = HistoryRender.diary(state);
    await Messenger.sendUpdate(ctx, state, diaryText, bot.getMainKeys(state), writeSave);
  }

  /**
   * Öffnet die Liste der Beziehungen (Relationships)
   */
  static async handleRelationships(ctx, state, writeSave) {
    if (!await Messenger.isMessageValid(ctx, state)) return;
    await ctx.answerCbQuery();

    // Nutzt jetzt SocialRender für die detaillierte Beziehungsliste
    const { text, keyboard } = SocialRender.relationships(state);
    await Messenger.sendUpdate(ctx, state, text, keyboard, writeSave);
  }

  /**
   * Öffnet das Aktivitäten-Menü (Disco, Finder)
   */
  static async handleActivities(ctx, state, writeSave) {
    if (!await Messenger.isMessageValid(ctx, state)) return;
    await ctx.answerCbQuery();

    const text = "🎡 *Aktivitäten*\nWas möchtest du heute unternehmen?";
    const keys = Markup.inlineKeyboard([
      [Markup.button.callback('💃 Disco (100€)', 'act_disco'), Markup.button.callback('📱 Finder', 'act_finder')],
      [Markup.button.callback('⬅️ Zurück', 'main_menu')]
    ]);
    
    await Messenger.sendUpdate(ctx, state, text, keys, writeSave);
  }

  /**
   * Simuliert den Disco-Besuch und generiert Begegnungen im richtigen Alter
   */
  static async handleDisco(ctx, state, writeSave) {
    const p = state.persons[state.current_id];
    if (p.money < 100) return ctx.answerCbQuery("⚠️ Zu wenig Geld (100€ benötigt)!", { show_alert: true });

    p.money -= 100;
    // Engine generiert eine neue Person im passenden Altersbereich
    const match = Engine.generateEncounter(state, true);
    state.persons[match.id] = match;

    const text = `💃 *Disco-Nacht*\n\nDu hast im Getümmel **${match.name}** kennengelernt.`;
    const keys = Markup.inlineKeyboard([
      [Markup.button.callback('💘 Interagieren', `interact_${match.id}`)],
      [Markup.button.callback('⬅️ Zurück', 'activities')]
    ]);

    await ctx.answerCbQuery("🕺 Musik ab!");
    await Messenger.sendUpdate(ctx, state, text, keys, writeSave);
  }

  /**
   * Simuliert die Finder-App
   */
  static async handleFinder(ctx, state, writeSave) {
    const match = Engine.generateEncounter(state, true);
    state.persons[match.id] = match;

    const text = Render.finderProfile(match); // Finder-Layout bleibt in der Basis-Render.js
    const keys = Markup.inlineKeyboard([
      [Markup.button.callback('✅ Like', `interact_${match.id}`), Markup.button.callback('❌ Skip', 'act_finder')],
      [Markup.button.callback('⬅️ Zurück', 'activities')]
    ]);

    await ctx.answerCbQuery("📱 Neues Match gefunden!");
    await Messenger.sendUpdate(ctx, state, text, keys, writeSave);
  }

  /**
   * Kehrt zum Hauptmenü (Status) zurück
   */
  static async handleMainMenu(ctx, state, writeSave) {
    state.currentView = 'status';
    const p = state.persons[state.current_id];
    const bot = require('../src/src/bot');
    await Messenger.sendUpdate(ctx, state, Render.status(p, state), bot.getMainKeys(state), writeSave);
  }
}

module.exports = NavigationHandler;
