const config = require('../config');
const { Markup } = require('telegraf');
const fs = require('fs');
const path = require('path');

class Render {
  static formatMoney(amount, country) {
    const localeMap = {
      "Germany": { code: "de-DE", symbol: "€" },
      "USA": { code: "en-US", symbol: "$" },
      "Turkey": { code: "tr-TR", symbol: "₺" },
      "Japan": { code: "ja-JP", symbol: "¥" }
    };
    const conf = localeMap[country] || { code: "de-DE", symbol: "€" };
    const formattedNumber = new Intl.NumberFormat(conf.code).format(amount || 0);
    return country === "USA" ? `${conf.symbol}${formattedNumber}` : `${formattedNumber} ${conf.symbol}`;
  }

  static status(p, state) {
    if (!p) return "Fehler: Charakterdaten konnten nicht geladen werden.";
    let countryDisplayName = state.country || 'Keines';
    let flag = "📍";
    try {
      const countries = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'data/countries.json'), 'utf8'));
      const countryObj = countries.find(c => c.name === state.country);
      if (countryObj) {
        countryDisplayName = countryObj.display_name;
        flag = countryObj.flag;
      }
    } catch (err) {}

    const lifeStatus = p.isAlive ? "" : "💀 *VERSTORBEN*\n";
    const maritalText = p.maritalStatus ? `💍 *Status:* ${p.maritalStatus}\n` : "";
    const pregnancyText = p.isPregnant ? `🤰 *Status:* Schwanger\n` : "";
    const sexualityIcons = { 'hetero': '👫 Hetero', 'homo': '👬 Homo', 'bi': '🌍 Bi' };
    const sexualityText = (p.age >= 16 && p.hasSetSexuality) ? `🌈 *Orientierung:* ${sexualityIcons[p.sexuality] || p.sexuality}\n` : "";

    return `✨ *ValueLifeSim v${config.version}* | 👤 Name: ${p.name}\n` +
           `________________________________\n\n` +
           `${lifeStatus}🎂 *Alter:* ${p.age}\n` +
           `${flag} *Land:* ${countryDisplayName}\n${maritalText}${pregnancyText}${sexualityText}` +
           `💰 *Bank:* ${this.formatMoney(p.money, state.country)}\n\n` +
           `🏥 *Gesundheit:* ${p.health}%\n😊 *Glück:* ${p.happiness}%\n` +
           `🎓 *Smarts:* ${p.smarts}% | 🔥 *Heat:* ${p.heat || 0}%\n🏆 *Ruf:* ${p.reputation || 50}%`;
  }

  static finderProfile(npc) {
    const genderIcon = npc.gender === 'W' ? '👩' : '👨';
    return `📱 *Finder - Profil*\n________________________________\n\n` +
           `${genderIcon} *Name:* ${npc.name}\n🎂 *Alter:* ${npc.age}\n` +
           `✨ *Looks:* ${npc.looks || 0}%\n❤️ *Interesse:* ${npc.relationship || 0}%\n\n` +
           `_„Bereit für ein Abenteuer?“_`;
  }

  /**
   * Beziehungsliste mit hierarchischer Sortierung (v0.0.3)
   */
  static relationships(state) {
    if (!state || !state.persons) return { text: "Keine Beziehungen.", keyboard: null };
    const player = state.persons[state.current_id];
    let text = `👥 *Beziehungen & Familie*\n________________________________\n\n`;
    
    const getRank = (npc, id) => {
      // 1. Großeltern (Eltern der Eltern)
      const m = state.persons[player.motherId];
      const f = state.persons[player.fatherId];
      if ((m && (id === m.motherId || id === m.fatherId)) || 
          (f && (id === f.motherId || id === f.fatherId))) return 1;

      // 2. Eltern
      if (id === player.motherId || id === player.fatherId) return 2;

      // 3. Partner
      if (id === player.partnerId) return 3;

      // 4. Kinder
      if (player.childrenIds && player.childrenIds.includes(id)) return 4;

      // 5. Geschwister
      if ((npc.motherId === player.motherId || npc.fatherId === player.fatherId) && id !== state.current_id) return 5;

      // 6. Freunde
      if (player.friendsIds && player.friendsIds.includes(id)) return 6;

      return 7; // Sonstige
    };

    const personIds = Object.keys(state.persons)
      .filter(id => id !== state.current_id)
      .sort((a, b) => getRank(state.persons[a], a) - getRank(state.persons[b], b));

    const buttons = [];
    personIds.forEach(id => {
      const p = state.persons[id];
      const relation = this.getRelationLabel(p, state);
      
      // Nur relevante Personen anzeigen
      const isRelevant = id === player.motherId || id === player.fatherId || id === player.partnerId || 
                         (player.childrenIds && player.childrenIds.includes(id)) || 
                         (player.friendsIds && player.friendsIds.includes(id)) || p.relationship > 10;

      if (isRelevant) {
        const statusIcon = p.isAlive ? (id === player.partnerId ? "💍" : "❤️") : "💀";
        const filled = Math.round(((p.relationship || 50) / 100) * 5);
        const bar = "🟢".repeat(filled) + "⚪".repeat(5 - filled);
        const romance = (p.romance > 10) ? ` | 🔥 ${p.romance}%` : "";

        text += `${statusIcon} *${p.name}*\n└ ${relation} | ${bar} ${p.relationship}%${romance}\n\n`;
        
        if (p.isAlive) {
          buttons.push([Markup.button.callback(`👉 Mit ${p.name} interagieren`, `interact_${id}`)]);
        }
      }
    });

    buttons.push([Markup.button.callback('⬅️ Zurück zum Hauptmenü', 'main_menu')]);
    return { text, keyboard: Markup.inlineKeyboard(buttons) };
  }

  static getRelationLabel(p, state) {
    const player = state.persons[state.current_id];
    const id = p.id;
    if (id === player.partnerId) return player.gender === 'W' ? "Partner" : "Partnerin";
    if (id === player.motherId) return "Mutter";
    if (id === player.fatherId) return "Vater";
    
    const m = state.persons[player.motherId];
    const f = state.persons[player.fatherId];
    if (m && (id === m.motherId || id === m.fatherId)) return "Großeltern";
    if (f && (id === f.motherId || id === f.fatherId)) return "Großeltern";

    if (player.childrenIds && player.childrenIds.includes(id)) return "Kind";
    if ((p.motherId === player.motherId || p.fatherId === player.fatherId) && id !== state.current_id) return "Geschwister";
    if (player.friendsIds && player.friendsIds.includes(id)) return "Freund(in)";
    
    return "Bekannte(r)";
  }

  static tree(state) {
    let text = `🌳 *Stammbaum*\n________________________________\n\n`;
    Object.values(state.persons).sort((a, b) => b.age - a.age).forEach(p => {
      const relation = this.getRelationLabel(p, state);
      const icon = p.isAlive ? (p.id === state.current_id ? '⭐' : '🟢') : '⚫️';
      text += `${icon} *${p.name}* (${p.age} J.)\n└─ ${relation}\n\n`;
    });
    return text;
  }

  static diary(state) {
    let text = "📖 *Lebenschronik*\n________________________________\n\n";
    if (!state.diary || state.diary.length === 0) return text + "_Noch keine Einträge vorhanden._";
    [...state.diary].reverse().slice(0, 15).forEach(e => { text += `• ${e}\n`; });
    return text;
  }
}

module.exports = Render;
