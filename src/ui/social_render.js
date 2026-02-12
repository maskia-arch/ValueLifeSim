// src/ui/social_render.js
const { Markup } = require('telegraf');

class SocialRender {
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

  static relationships(state) {
    if (!state || !state.persons) return { text: "Keine Beziehungen.", keyboard: null };
    const player = state.persons[state.current_id];
    let text = `👥 *Beziehungen & Familie*\n________________________________\n\n`;
    
    // Sortierung und Filterung der Personen
    const personIds = Object.keys(state.persons).filter(id => id !== state.current_id);

    const buttons = [];
    personIds.forEach(id => {
      const p = state.persons[id];
      const relation = this.getRelationLabel(p, state);
      
      const filled = Math.round(((p.relationship || 50) / 100) * 5);
      const bar = "🟢".repeat(filled) + "⚪".repeat(5 - filled);
      
      text += `${p.isAlive ? "❤️" : "💀"} *${p.name}*\n└ ${relation} | ${bar} ${p.relationship}%\n\n`;
      if (p.isAlive) {
        buttons.push([Markup.button.callback(`👉 Mit ${p.name} interagieren`, `interact_${id}`)]);
      }
    });

    buttons.push([Markup.button.callback('⬅️ Zurück zum Hauptmenü', 'main_menu')]);
    return { text, keyboard: Markup.inlineKeyboard(buttons) };
  }
}

module.exports = SocialRender;
