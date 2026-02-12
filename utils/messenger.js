const { Markup } = require('telegraf');

/**
 * Messenger Utility - Zentrale für alle UI-Updates
 * Verhindert Nachrichten-Spam und regelt das Pinning.
 */
class Messenger {
  
  /**
   * Prüft, ob die Aktion von der aktuell gültigen (gepinnten) Nachricht kommt.
   * Löscht veraltete Nachrichten sofort.
   */
  static async isMessageValid(ctx, state) {
    if (!state || !state.setupComplete) return true;
    const currentMsgId = ctx.callbackQuery?.message?.message_id;
    
    if (state.pinMessageId && currentMsgId && currentMsgId !== state.pinMessageId) {
      try {
        await ctx.telegram.deleteMessage(ctx.from.id, currentMsgId);
      } catch (e) {}
      await ctx.answerCbQuery("⚠️ Bitte nutze das aktuelle Menü oben.", { show_alert: true });
      return false;
    }
    return true;
  }

  /**
   * Bereinigt den Chat von alten Nachrichten
   */
  static async bulkDelete(ctx, startId, count = 20) {
    const userId = ctx.from.id;
    if (!startId) return;
    for (let i = 0; i < count; i++) {
      try {
        await ctx.telegram.deleteMessage(userId, startId - i);
      } catch (err) {}
    }
  }

  /**
   * Kernfunktion für Interface-Updates. 
   * Nutzt editMessageText für die gepinnte Nachricht oder erstellt eine neue.
   */
  static async sendUpdate(ctx, state, text, keyboard, writeSaveFunc) {
    const userId = ctx.from.id;
    
    if (state.pinMessageId) {
      try {
        await ctx.telegram.editMessageText(userId, state.pinMessageId, null, text, {
          parse_mode: 'Markdown',
          reply_markup: keyboard.reply_markup
        });
        if (writeSaveFunc) await writeSaveFunc(userId, state);
        return;
      } catch (err) {
        // Falls Nachricht gelöscht wurde, Pin-ID zurücksetzen
        state.pinMessageId = null;
      }
    }

    // Falls kein Pin existiert: Neue Nachricht senden
    const msg = await ctx.replyWithMarkdown(text, keyboard);
    state.lastMessageId = msg.message_id;
    
    if (state.setupComplete && !state.pinMessageId) {
      state.pinMessageId = msg.message_id;
      try {
        await ctx.telegram.pinChatMessage(userId, msg.message_id);
      } catch (e) {}
    }
    
    if (writeSaveFunc) await writeSaveFunc(userId, state);
  }
}

module.exports = Messenger;
