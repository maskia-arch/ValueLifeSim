// src/ui/render.js
const config = require('../config');
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

    return `✨ *ValueLifeSim v${config.version}*\n` +
           `________________________________\n\n` +
           `${lifeStatus}👤 *Name:* \n└ ${p.name}\n\n` +
           `🎂 *Alter:* ${p.age}\n` +
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
}

module.exports = Render;
