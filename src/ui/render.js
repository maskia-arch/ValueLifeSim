const config = require('../config');
const { Markup } = require('telegraf');

class Render {
  /**
   * Zeigt den detaillierten Status des aktuellen Spielers an
   */
  static status(p, state) {
    if (!p) return "Fehler: Charakterdaten konnten nicht geladen werden.";
    
    // Land-Emoji Logik
    const flags = { "Deutschland": "🇩🇪", "USA": "🇺🇸", "Schweiz": "🇨🇭", "Türkei": "🇹🇷", "Japan": "🇯🇵" };
    const flag = flags[state.country] || "📍";

    const lifeStatus = p.isAlive ? "" : "💀 *VERSTORBEN*\n";

    return `✨ *ValueLifeSim v${config.version}*\n` +
           `${lifeStatus}` + 
           `👤 *Name:* ${p.name || 'Unbekannt'}\n` +
           `🎂 *Alter:* ${p.age}\n` +
           `${flag} *Land:* ${state.country || 'Keines'}\n` +
           `💰 *Bank:* $${p.money.toLocaleString() || 0}\n\n` +
           `🏥 *Gesundheit:* ${p.health}%\n` +
           `😊 *Glück:* ${p.happiness}%\n` +
           `🎓 *Smarts:* ${p.smarts}% | 🔥 *Heat:* ${p.heat}%\n` +
           `🏆 *Ruf:* ${p.reputation || 50}%`;
  }

  /**
   * Erstellt einen chronologischen Stammbaum (Älteste oben)
   */
  static tree(state) {
    if (!state || !state.persons) return "Kein Stammbaum verfügbar.";
    
    let text = `🌳 *Chronologischer Stammbaum*\n`;
    text += `________________________________\n\n`;

    // Personen in Array umwandeln und nach Alter sortieren (absteigend)
    const sortedPersons = Object.values(state.persons).sort((a, b) => b.age - a.age);

    sortedPersons.forEach(p => {
      const statusIcon = p.isAlive ? '🟢' : '⚫️';
      const genderIcon = p.gender === 'W' ? '♀' : '♂';
      const isCurrent = p.id === state.current_id ? " ⭐ (Du)" : "";
      
      // Verwandtschaft bestimmen
      const relation = this.getRelationLabel(p, state);

      text += `${statusIcon} *${p.name || 'Unbekannt'}* (${p.age} J.)${isCurrent}\n`;
      text += `└─ ${genderIcon} ${relation}\n\n`;
    });

    return text;
  }

  /**
   * Listet alle Beziehungen auf und erstellt Interaktions-Buttons
   */
  static relationships(state) {
    if (!state || !state.persons) return { text: "Keine Beziehungen gefunden.", keyboard: null };
    
    const player = state.persons[state.current_id];
    let text = `👥 *Beziehungen (v${config.version})*\n\n`;
    const buttons = [];

    // Nur NPCs anzeigen (nicht den Spieler selbst)
    for (let id in state.persons) {
      if (id === state.current_id) continue;
      
      const p = state.persons[id];
      const relation = this.getRelationLabel(p, state);
      const statusIcon = p.isAlive ? "❤️" : "💀";
      const ageText = p.isAlive ? `${p.age} Jahre` : "Verstorben";
      const relBar = p.isAlive ? `\n   [${p.relationship}% Vertrauen]` : "";

      text += `${statusIcon} *${p.name || 'Unbekannt'}*\n`;
      text += `└ ${relation} | ${ageText}${relBar}\n\n`;

      // Interaktions-Button nur für lebende NPCs
      if (p.isAlive) {
        buttons.push([Markup.button.callback(`👉 Mit ${p.name} interagieren`, `interact_${id}`)]);
      }
    }

    if (buttons.length === 0 && Object.keys(state.persons).length <= 1) {
      text += "_Du hast aktuell noch keine bekannten Beziehungen._";
    }

    // Zurück-Button führt zum main_menu Handler in der bot.js
    buttons.push([Markup.button.callback('⬅️ Zurück zum Hauptmenü', 'main_menu')]);

    return {
      text: text,
      keyboard: Markup.inlineKeyboard(buttons)
    };
  }

  /**
   * Hilfsfunktion zur Ermittlung des Verwandtschaftsverhältnisses
   */
  static getRelationLabel(p, state) {
    const player = state.persons[state.current_id];
    if (!player) return "Bekannte(r)";
    if (p.id === state.current_id) return "Selbst";
    if (p.id === player.motherId) return "Mutter";
    if (p.id === player.fatherId) return "Vater";
    if (player.childrenIds && player.childrenIds.includes(p.id)) return "Kind";
    return "Verwandte(r)";
  }
}

module.exports = Render;
