const config = require('../config');
const { Markup } = require('telegraf');
const fs = require('fs');
const path = require('path');

class Render {
  /**
   * Hilfsfunktion: Gibt die Währung und Formatierung basierend auf dem Land zurück
   */
  static formatMoney(amount, country) {
    const localeMap = {
      "Germany": { code: "de-DE", symbol: "€" },
      "USA": { code: "en-US", symbol: "$" },
      "Turkey": { code: "tr-TR", symbol: "₺" },
      "Japan": { code: "ja-JP", symbol: "¥" }
    };

    const conf = localeMap[country] || { code: "en-US", symbol: "$" };
    const formattedNumber = new Intl.NumberFormat(conf.code).format(amount || 0);
    
    return country === "USA" ? `${conf.symbol}${formattedNumber}` : `${formattedNumber} ${conf.symbol}`;
  }

  /**
   * Zeigt den detaillierten Status inkl. Beziehungsstatus und DisplayName
   */
  static status(p, state) {
    if (!p) return "Fehler: Charakterdaten konnten nicht geladen werden.";
    
    // Länderdaten laden, um display_name zu finden
    let countryDisplayName = state.country || 'Keines';
    let flag = "📍";
    
    try {
      const countriesPath = path.join(process.cwd(), 'data/countries.json');
      const countries = JSON.parse(fs.readFileSync(countriesPath, 'utf8'));
      const countryObj = countries.find(c => c.name === state.country);
      if (countryObj) {
        countryDisplayName = countryObj.display_name;
        flag = countryObj.flag;
      }
    } catch (err) {
      console.error("Fehler beim Laden der Länder für Render:", err);
    }

    const lifeStatus = p.isAlive ? "" : "💀 *VERSTORBEN*\n";
    const moneyText = this.formatMoney(p.money, state.country);

    // NEU: Beziehungsstatus (Heirat)
    const maritalText = p.maritalStatus ? `💍 *Status:* ${p.maritalStatus}\n` : "";

    return `✨ *ValueLifeSim v${config.version}*\n` +
           `${lifeStatus}` + 
           `👤 *Name:* ${p.name || 'Unbekannt'}\n` +
           `🎂 *Alter:* ${p.age}\n` +
           `${flag} *Land:* ${countryDisplayName}\n` +
           `${maritalText}` +
           `💰 *Bank:* ${moneyText}\n\n` +
           `🏥 *Gesundheit:* ${p.health}%\n` +
           `😊 *Glück:* ${p.happiness}%\n` +
           `🎓 *Smarts:* ${p.smarts}% | 🔥 *Heat:* ${p.heat}%\n` +
           `🏆 *Ruf:* ${p.reputation || 50}%`;
  }

  /**
   * Tagebuch Anzeige
   */
  static diary(state) {
    if (!state.diary || state.diary.length === 0) {
      return "📖 *Dein Tagebuch*\n\n_Noch keine Einträge vorhanden._";
    }
    let text = "📖 *Deine Lebenschronik*\n________________________________\n\n";
    const entries = [...state.diary].reverse().slice(0, 15);
    entries.forEach(entry => { text += `• ${entry}\n`; });
    return text;
  }

  /**
   * Beziehungsliste inkl. Freunde und Familienstand
   */
  static relationships(state) {
    if (!state || !state.persons) return { text: "Keine Beziehungen gefunden.", keyboard: null };
    
    const player = state.persons[state.current_id];
    let text = `👥 *Beziehungen & Freunde (v${config.version})*\n\n`;
    const buttons = [];

    // Personen filtern (alle außer der Spieler selbst)
    const personIds = Object.keys(state.persons).filter(id => id !== state.current_id);

    personIds.forEach(id => {
      const p = state.persons[id];
      const relation = this.getRelationLabel(p, state);
      const statusIcon = p.isAlive ? "❤️" : "💀";
      
      const barLength = 5;
      const filled = Math.round((p.relationship / 100) * barLength);
      const bar = "🟢".repeat(filled) + "⚪".repeat(barLength - filled);

      // Spezielle Anzeige für Partner
      const partnerNote = p.id === player.partnerId ? "💍 " : "";

      text += `${statusIcon} ${partnerNote}*${p.name}*\n`;
      text += `└ ${relation} | ${bar} ${p.relationship}%\n\n`;

      if (p.isAlive) {
        buttons.push([Markup.button.callback(`👉 Mit ${p.name} interagieren`, `interact_${id}`)]);
      }
    });

    buttons.push([Markup.button.callback('⬅️ Zurück zum Hauptmenü', 'main_menu')]);

    return {
      text: text,
      keyboard: Markup.inlineKeyboard(buttons)
    };
  }

  /**
   * Stammbaum mit Heirats-Logik
   */
  static tree(state) {
    if (!state || !state.persons) return "Kein Stammbaum verfügbar.";
    let text = `🌳 *Chronologischer Stammbaum*\n________________________________\n\n`;
    const sortedPersons = Object.values(state.persons).sort((a, b) => b.age - a.age);

    sortedPersons.forEach(p => {
      const statusIcon = p.isAlive ? '🟢' : '⚫️';
      const isCurrent = p.id === state.current_id ? " ⭐" : "";
      const relation = this.getRelationLabel(p, state);
      const marriedInfo = p.maritalStatus ? ` (${p.maritalStatus})` : "";

      text += `${statusIcon} *${p.name}* (${p.age} J.)${isCurrent}\n`;
      text += `└─ ${relation}${marriedInfo}\n\n`;
    });
    return text;
  }

  static getRelationLabel(p, state) {
    const player = state.persons[state.current_id];
    if (!player) return "Bekannte(r)";
    if (p.id === state.current_id) return "Selbst";
    if (p.id === player.partnerId) return player.gender === 'W' ? "Ehemann" : "Ehefrau";
    if (p.id === player.motherId) return "Mutter";
    if (p.id === player.fatherId) return "Vater";
    if (player.childrenIds && player.childrenIds.includes(p.id)) return "Kind";
    if (player.friendsIds && player.friendsIds.includes(p.id)) return "Freund(in)";
    return "Bekannte(r)";
  }
}

module.exports = Render;
