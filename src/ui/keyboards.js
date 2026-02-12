// Datei: src/ui/keyboards.js
const { Markup } = require('telegraf');

class Keyboards {
  static main(state) {
    if (state.isGameOver) return Markup.inlineKeyboard([[Markup.button.callback('⚙️ Neustart', 'reset')]]);
    const p = state.persons[state.current_id];
    const rows = [[Markup.button.callback('➕ Ein Jahr älter', 'age_up')]];
    const socialRow = [Markup.button.callback('👥 Beziehungen', 'rel')];
    if (p.age >= 16) socialRow.push(Markup.button.callback('🎡 Aktivitäten', 'activities'));
    rows.push(socialRow);
    rows.push([Markup.button.callback('📖 Tagebuch', 'diary'), Markup.button.callback('🌳 Stammbaum', 'tree')]);
    rows.push([Markup.button.callback('⚙️ Reset', 'reset')]);
    return Markup.inlineKeyboard(rows);
  }
}

module.exports = Keyboards;
