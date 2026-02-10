const fs = require('fs');
const path = require('path');

class Engine {
  static nextYear(state) {
    // 1. Alle Personen im Spielstand altern lassen
    for (let id in state.persons) {
      const person = state.persons[id];
      if (person.isAlive) {
        person.age += 1;
        
        // Todeswahrscheinlichkeit ab 70 Jahren
        if (person.age > 70) {
          const deathChance = (person.age - 70) * 0.05;
          if (Math.random() < deathChance) {
            person.isAlive = false;
            // Falls der Hauptcharakter stirbt, bricht die Engine hier ab
            if (id === state.current_id) return { type: 'death' };
          }
        }
      }
    }

    const p = state.persons[state.current_id];

    // 2. Zufalls-Event Check (25% Wahrscheinlichkeit)
    if (Math.random() < 0.25) {
      try {
        const eventsPath = path.join(process.cwd(), 'data/events.json');
        if (fs.existsSync(eventsPath)) {
          const allEvents = JSON.parse(fs.readFileSync(eventsPath, 'utf8'));
          
          // Filtern nach Alter des Spielers
          const possibleEvents = allEvents.filter(e => p.age >= e.min_age && p.age <= e.max_age);
          
          if (possibleEvents.length > 0) {
            const event = possibleEvents[Math.floor(Math.random() * possibleEvents.length)];
            return { type: 'event', data: event };
          }
        }
      } catch (err) { 
        console.error("Engine Event Error:", err); 
      }
    }

    return { type: 'none' };
  }

  static processChoice(state, choice) {
    const p = state.persons[state.current_id];
    const effects = choice.effect || {};

    // Geld hat kein Limit nach oben
    if (effects.money) p.money += effects.money;

    // Prozentuale Werte zwischen 0 und 100 halten
    const stats = ['happiness', 'smarts', 'health', 'looks', 'reputation'];
    stats.forEach(stat => {
      if (effects[stat]) {
        p[stat] = Math.min(100, Math.max(0, (p[stat] || 0) + effects[stat]));
      }
    });
  }
}

module.exports = Engine;
