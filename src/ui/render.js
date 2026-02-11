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
   * Zeigt den detaillierten Status inkl. Schwangerschaft, Partner und Orientierung
   */
  static status(p, state) {
    if (!p) return "Fehler: Charakterdaten konnten nicht geladen werden.";
    
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
    } catch (err) {}

    const lifeStatus = p.isAlive ? "" : "💀 *VERSTORBEN*\n";
    const moneyText = this.formatMoney(p.money, state.country);

    // Status-Icons (Heirat & Schwangerschaft)
    const maritalText = p.maritalStatus ? `💍 *Status:* ${p.maritalStatus}\n` : "";
    const pregnancyText = p.isPregnant ? `🤰 *Status:* Schwanger (Geburt im nächsten Jahr)\n` : "";
    
    // NEU: Anzeige der Orientierung ab Alter 16
    const sexualityIcons = { 'hetero': '👫 Hetero', 'homo': '👬 Homo', 'bi': '🌍 Bi' };
    const sexualityText = (p.age >= 16 && p.hasSetSexuality) 
      ? `🌈 *Orientierung:* ${sexualityIcons[p.sexuality] || p.sexuality}\n` 
      : "";

    const heatVal = p.heat !== undefined ? p.heat : 0;

    return `✨ *ValueLifeSim v${config.version}*\n` +
           `${lifeStatus}` + 
           `👤 *Name:* ${p.name}\n` +
           `🎂 *Alter:* ${p.age}\n` +
           `${flag} *Land:* ${countryDisplayName}\n` +
           `${maritalText}${pregnancyText}${sexualityText}` +
           `💰 *Bank:* ${moneyText}\n\n` +
           `🏥 *Gesundheit:* ${p.health}%\n` +
           `😊 *Glück:* ${p.happiness}%\n` +
           `🎓 *Smarts:* ${p.smarts}% | 🔥 *Heat:* ${heatVal}%\n` +
           `🏆 *Ruf:* ${p.reputation || 50}%`;
  }

  /**
   * Design für die Dating-App "Finder"
   */
  static finderProfile(npc) {
    const genderIcon = npc.gender === 'W' ? '👩' : '👨';
    return `📱 *Finder - Neues Profil*\n\n` +
           `${genderIcon} *Name:* ${npc.name}\n` +
           `🎂 *Alter:* ${npc.age}\n` +
           `✨ *Looks:* ${npc.looks || 0}%\n` +
           `❤️ *Interesse:* ${npc.relationship}%\n\n` +
           `_„Suchst du jemanden wie mich?“_`;
  }

  /**
   * Beziehungsliste
   */
  static relationships(state) {
    if (!state || !state.persons) return { text: "Keine Beziehungen.", keyboard: null };
    
    const player = state.persons[state.current_id];
    let text = `👥 *Beziehungen & Familie (v${config.version})*\n\n`;
    const buttons = [];

    const personIds = Object.keys(state.persons).filter(id => id !== state.current_id);

    personIds.forEach(id => {
      const p = state.persons[id];
      const relation = this.getRelationLabel(p, state);
      
      const isRelevant = id === player.motherId || 
                         id === player.fatherId || 
                         id === player.partnerId || 
                         (player.childrenIds && player.childrenIds.includes(id)) ||
                         (player.friendsIds && player.friendsIds.includes(id));

      if (isRelevant) {
        let statusIcon = p.isAlive ? "❤️" : "💀";
        if (p.id === player.partnerId) statusIcon = p.maritalStatus ? "💍" : "💘";
        
        const barLength = 5;
        const relVal = p.relationship !== undefined ? p.relationship : 50;
        const filled = Math.round((relVal / 100) * barLength);
        const bar = "🟢".repeat(filled) + "⚪".repeat(barLength - filled);

        const romanceBar = (p.romance && p.romance > 0) ? `\n└ 🔥 Liebe: ${"❤️".repeat(Math.round(p.romance/20))}` : "";

        text += `${statusIcon} *${p.name}*\n`;
        text += `└ ${relation} | ${bar} ${relVal}%${romanceBar}\n\n`;

        if (p.isAlive) {
          buttons.push([Markup.button.callback(`👉 Mit ${p.name} interagieren`, `interact_${id}`)]);
        }
      }
    });

    if (buttons.length === 0) text += "_Noch keine engen Kontakte._\n\n";

    buttons.push([Markup.button.callback('⬅️ Zurück zum Hauptmenü', 'main_menu')]);

    return { text: text, keyboard: Markup.inlineKeyboard(buttons) };
  }

  static getRelationLabel(p, state) {
    const player = state.persons[state.current_id];
    if (!player) return "Bekannte(r)";
    if (p.id === state.current_id) return "Selbst";
    if (p.id === player.partnerId) {
       const isMarried = p.maritalStatus !== null;
       if (player.gender === 'W') return isMarried ? "Ehemann" : "Partner";
       return isMarried ? "Ehefrau" : "Partnerin";
    }
    if (p.id === player.motherId) return "Mutter";
    if (p.id === player.fatherId) return "Vater";
    if (player.childrenIds && player.childrenIds.includes(p.id)) return "Kind";
    if (player.friendsIds && player.friendsIds.includes(p.id)) return "Freund(in)";
    return "Bekannte(r)";
  }

  static tree(state) {
    if (!state || !state.persons) return "Kein Stammbaum verfügbar.";
    let text = `🌳 *Chronologischer Stammbaum*\n________________________________\n\n`;
    const sortedPersons = Object.values(state.persons).sort((a, b) => b.age - a.age);

    sortedPersons.forEach(p => {
      const statusIcon = p.isAlive ? '🟢' : '⚫️';
      const isCurrent = p.id === state.current_id ? " ⭐" : "";
      const relation = this.getRelationLabel(p, state);
      
      text += `${statusIcon} *${p.name}* (${p.age} J.)${isCurrent}\n`;
      text += `└─ ${relation}\n\n`;
    });
    return text;
  }

  static diary(state) {
    if (!state.diary || state.diary.length === 0) return "📖 *Tagebuch leer.*";
    let text = "📖 *Lebenschronik*\n________________________________\n\n";
    [...state.diary].reverse().slice(0, 15).forEach(e => { text += `• ${e}\n`; });
    return text;
  }
}

module.exports = Render;
