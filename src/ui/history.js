// src/ui/history.js
const SocialRender = require('./social_render');

class HistoryRender {
  static tree(state) {
    let text = `🌳 *Stammbaum*\n________________________________\n\n`;
    const player = state.persons[state.current_id];
    
    // FILTER: Nur Personen anzeigen, die KEINE Freunde oder Bekannte sind
    Object.values(state.persons)
      .filter(p => {
        const label = SocialRender.getRelationLabel(p, state);
        return label !== "Freund(in)" && label !== "Bekannte(r)";
      })
      .sort((a, b) => b.age - a.age)
      .forEach(p => {
        const relation = SocialRender.getRelationLabel(p, state);
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

module.exports = HistoryRender;
