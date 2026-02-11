const config = require('../config');
const { Markup } = require('telegraf');

class Render {
  /**
   * Hilfsfunktion: Gibt die Währung und Formatierung basierend auf dem Land zurück
   */
  static formatMoney(amount, country) {
    const localeMap = {
      "Deutschland": { code: "de-DE", symbol: "€" },
      "USA": { code: "en-US", symbol: "$" },
      "Schweiz": { code: "de-CH", symbol: "CHF" },
      "Türkei": { code: "tr-TR", symbol: "₺" },
      "Japan": { code: "ja-JP", symbol: "¥" }
    };

    const config = localeMap[country] || { code: "en-US", symbol: "$" };
    
    // Formatiert die Zahl (z.B. 1.000,00 für DE oder 1,000.00 für US)
    const formattedNumber = new Intl.NumberFormat(config.code).format(amount || 0);
    
    // Position des Symbols (In DE/CH meist dahinter, bei $ davor)
    return country === "USA" ? `${config.symbol}${formattedNumber}` : `${formattedNumber} ${config.symbol}`;
  }

  /**
   * Zeigt den detaillierten Status inkl. lokaler Währung
   */
  static status(p, state) {
    if (!p) return "Fehler: Charakterdaten konnten nicht geladen werden.";
    
    const flags = { "Deutschland": "🇩🇪", "USA": "🇺🇸", "Schweiz": "🇨🇭", "Türkei": "🇹🇷", "Japan": "🇯🇵" };
    const flag = flags[state.country] || "📍";
    const lifeStatus = p.isAlive ? "" : "💀 *VERSTORBEN*\n";

    // Dynamische Währung nutzen
    const moneyText = this.formatMoney(p.money, state.country);

    return `✨ *ValueLifeSim v${config.version}*\n` +
           `${lifeStatus}` + 
           `👤 *Name:* ${p.name || 'Unbekannt'}\n` +
           `🎂 *Alter:* ${p.age}\n` +
           `${flag} *Land:* ${state.country || 'Keines'}\n` +
           `💰 *Bank:* ${moneyText}\n\n` +
           `🏥 *Gesundheit:* ${p.health}%\n` +
           `😊 *Glück:* ${p.happiness}%\n` +
           `🎓 *Smarts:* ${p.smarts}% | 🔥 *Heat:* ${p.heat}%\n` +
           `🏆 *Ruf:* ${p.reputation || 50}%`;
  }

  /**
   * Zeigt das Tagebuch (Chronik der Ereignisse)
   */
  static diary(state) {
    if (!state.diary || state.diary.length === 0) {
      return "📖 *Dein Tagebuch*\n\n_Noch keine Einträge vorhanden._";
    }

    let text = "📖 *Deine Lebenschronik*\n";
    text += "________________________________\n\n";
    
    // Die letzten 15 Einträge anzeigen, neueste oben
    const entries = [...state.diary].reverse().slice(0, 15);
    
    entries.forEach(entry => {
      text += `• ${entry}\n`;
    });

    return text;
  }

  /**
   * Erstellt einen chronologischen Stammbaum
   */
  static tree(state) {
    if (!state || !state.persons) return "Kein Stammbaum verfügbar.";
    
    let text = `🌳 *Chronologischer Stammbaum*\n`;
    text += `________________________________\n\n`;

    const sortedPersons = Object.values(state.persons).sort((a, b) => b.age - a.age);

    sortedPersons.forEach(p => {
      const statusIcon = p.isAlive ? '🟢' : '⚫️';
      const genderIcon = p.gender === 'W' ? '♀' : '♂';
      const isCurrent = p.id === state.current_id ? " ⭐ (Du)" : "";
      const relation = this.getRelationLabel(p, state);

      text += `${statusIcon} *${p.name || 'Unbekannt'}* (${p.age} J.)${isCurrent}\n`;
      text += `└─ ${genderIcon} ${relation}\n\n`;
    });

    return text;
  }

  /**
   * Beziehungsliste mit Fortschrittsbalken
   */
  static relationships(state) {
    if (!state || !state.persons) return { text: "Keine Beziehungen gefunden.", keyboard: null };
    
    const player = state.persons[state.current_id];
    let text = `👥 *Beziehungen (v${config.version})*\n\n`;
    const buttons = [];

    for (let id in state.persons) {
      if (id === state.current_id) continue;
      
      const p = state.persons[id];
      const relation = this.getRelationLabel(p, state);
      const statusIcon = p.isAlive ? "❤️" : "💀";
      
      // Visueller Beziehungsbalken (Emoji-basiert)
      const barLength = 5;
      const filled = Math.round((p.relationship / 100) * barLength);
      const bar = "🟢".repeat(filled) + "⚪".repeat(barLength - filled);

      text += `${statusIcon} *${p.name || 'Unbekannt'}*\n`;
      text += `└ ${relation} | ${bar} ${p.relationship}%\n\n`;

      if (p.isAlive) {
        buttons.push([Markup.button.callback(`👉 Mit ${p.name} interagieren`, `interact_${id}`)]);
      }
    }

    buttons.push([Markup.button.callback('⬅️ Zurück zum Hauptmenü', 'main_menu')]);

    return {
      text: text,
      keyboard: Markup.inlineKeyboard(buttons)
    };
  }

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
