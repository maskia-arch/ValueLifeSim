class Render {
  static status(p) {
    return `✨ *ValueLifeSim v0.0.1*\n\n` +
           `👤 *Name:* ${p.name}\n` +
           `🎂 *Alter:* ${p.age}\n` +
           `💰 *Bank:* $${p.money}\n` +
           `🏥 *Gesundheit:* ${p.health}%\n` +
           `😊 *Glück:* ${p.happiness}%\n` +
           `🎓 *Smarts:* ${p.smarts}% | 🔥 *Heat:* ${p.heat}%`;
  }

  static tree(state) {
    let text = "🌳 *Stammbaum*\n\n";
    Object.values(state.persons).forEach(p => {
      text += `${p.isAlive ? '🟢' : '⚫️'} ${p.name} (${p.age} J.)\n`;
    });
    return text;
  }
}

module.exports = Render;
