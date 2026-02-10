const config = require('../config');

class Render {
  static status(p) {
    return `✨ *ValueLifeSim v${config.version}*\n\n` + 
           `👤 *Name:* ${p.name}\n` +
           `🎂 *Alter:* ${p.age}\n` +
           `💰 *Bank:* $${p.money}\n` +
           `🏥 *Gesundheit:* ${p.health}%\n` +
           `😊 *Glück:* ${p.happiness}%\n` +
           `🎓 *Smarts:* ${p.smarts}% | 🔥 *Heat:* ${p.heat}%`;
  }

  static tree(state) {
    let text = `🌳 *Stammbaum (v${config.version})*\n\n`;
    Object.values(state.persons).forEach(p => {
      text += `${p.isAlive ? '🟢' : '⚫️'} ${p.name} (${p.age} J.)\n`;
    });
    return text;
  }

  static relationships(state) {
    const player = state.persons[state.current_id];
    let text = `👥 *Beziehungen (v${config.version})*\n\n`;

    // Wir gehen alle Personen durch, außer den Spieler selbst
    for (let id in state.persons) {
      if (id === state.current_id) continue;
      
      const p = state.persons[id];
      
      // Verwandtschaftsgrad bestimmen
      let relation = "Bekannte(r)";
      if (id === player.motherId) relation = "Mutter";
      if (id === player.fatherId) relation = "Vater";

      // Status-Emoji (Herz für lebende, Totenkopf für verstorbene)
      const statusIcon = p.isAlive ? "❤️" : "💀";
      const ageText = p.isAlive ? `${p.age} Jahre` : "Verstorben";

      text += `${statusIcon} *${p.name || 'Unbekannt'}*\n`;
      text += `└ ${relation} | ${ageText}\n\n`;
    }

    if (Object.keys(state.persons).length <= 1) {
      text += "_Du hast aktuell noch keine bekannten Beziehungen._";
    }

    return text;
  }
}

module.exports = Render;
