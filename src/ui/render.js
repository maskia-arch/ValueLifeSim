const config = require('../config');
const { Markup } = require('telegraf');

class Render {
  static status(p, state) {
    if (!p) return "Fehler: Charakterdaten konnten nicht geladen werden.";
    
    // Land-Emoji Logik (optional erweiterbar)
    const flags = { "Deutschland": "🇩🇪", "USA": "🇺🇸", "Schweiz": "🇨🇭", "Türkei": "🇹🇷", "Japan": "🇯🇵" };
    const flag = flags[state.country] || "📍";

    return `✨ *ValueLifeSim v${config.version}*\n\n` + 
           `👤 *Name:* ${p.name || 'Unbekannt'}\n` +
           `🎂 *Alter:* ${p.age}\n` +
           `${flag} *Land:* ${state.country || 'Keines'}\n` +
           `💰 *Bank:* $${p.money || 0}\n` +
           `🏥 *Gesundheit:* ${p.health}%\n` +
           `😊 *Glück:* ${p.happiness}%\n` +
           `🎓 *Smarts:* ${p.smarts}% | 🔥 *Heat:* ${p.heat}%`;
  }

  static tree(state) {
    if (!state || !state.persons) return "Kein Stammbaum verfügbar.";
    
    let text = `🌳 *Stammbaum (v${config.version})*\n\n`;
    Object.values(state.persons).forEach(p => {
      text += `${p.isAlive ? '🟢' : '⚫️'} ${p.name || 'Unbekannt'} (${p.age} J.)\n`;
    });
    return text;
  }

  static relationships(state) {
    if (!state || !state.persons) return { text: "Keine Beziehungen gefunden.", keyboard: null };
    
    const player = state.persons[state.current_id];
    let text = `👥 *Beziehungen (v${config.version})*\n\n`;
    const buttons = [];

    for (let id in state.persons) {
      if (id === state.current_id) continue;
      
      const p = state.persons[id];
      
      let relation = "Bekannte(r)";
      if (player && id === player.motherId) relation = "Mutter";
      if (player && id === player.fatherId) relation = "Vater";

      const statusIcon = p.isAlive ? "❤️" : "💀";
      const ageText = p.isAlive ? `${p.age} Jahre` : "Verstorben";

      text += `${statusIcon} *${p.name || 'Unbekannt'}*\n`;
      text += `└ ${relation} | ${ageText}\n\n`;

      // Nur für lebende NPCs einen Interaktions-Button hinzufügen
      if (p.isAlive) {
        buttons.push([Markup.button.callback(`👉 Mit ${p.name} interagieren`, `interact_${id}`)]);
      }
    }

    if (buttons.length === 0 && Object.keys(state.persons).length <= 1) {
      text += "_Du hast aktuell noch keine bekannten Beziehungen._";
    }

    // Zurück-Button zum Hauptmenü immer unten anfügen
    buttons.push([Markup.button.callback('⬅️ Zurück', 'main_menu')]);

    return {
      text: text,
      keyboard: Markup.inlineKeyboard(buttons)
    };
  }
}

module.exports = Render;
