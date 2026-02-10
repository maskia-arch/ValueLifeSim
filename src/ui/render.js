const config = require('../config');

class Render {
  static status(p) {
    if (!p) return "Fehler: Charakterdaten konnten nicht geladen werden.";
    
    return `✨ *ValueLifeSim v${config.version}*\n\n` + 
           `👤 *Name:* ${p.name || 'Unbekannt'}\n` +
           `🎂 *Alter:* ${p.age}\n` +
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
    if (!state || !state.persons) return "Keine Beziehungen gefunden.";
    
    const player = state.persons[state.current_id];
    let text = `👥 *Beziehungen (v${config.version})*\n\n`;

    let count = 0;
    for (let id in state.persons) {
      if (id === state.current_id) continue;
      
      const p = state.persons[id];
      count++;
      
      // Verwandtschaftsgrad bestimmen mit Sicherheitscheck
      let relation = "Bekannte(r)";
      if (player && id === player.motherId) relation = "Mutter";
      if (player && id === player.fatherId) relation = "Vater";

      // Status-Emoji
      const statusIcon = p.isAlive ? "❤️" : "💀";
      const ageText = p.isAlive ? `${p.age} Jahre` : "Verstorben";

      text += `${statusIcon} *${p.name || 'Unbekannt'}*\n`;
      text += `└ ${relation} | ${ageText}\n\n`;
    }

    if (count === 0) {
      text += "_Du hast aktuell noch keine bekannten Beziehungen._";
    }

    return text;
  }
}

module.exports = Render;
