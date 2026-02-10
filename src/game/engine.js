const fs = require('fs');
const path = require('path');

class Engine {
  static nextYear(state) {
    const npcDeaths = [];
    const player = state.persons[state.current_id];

    // 1. Alle Personen im Spielstand simulieren
    for (let id in state.persons) {
      const person = state.persons[id];
      if (person.isAlive) {
        person.age += 1;
        
        // NPC-Gesundheit leicht schwanken lassen
        if (id !== state.current_id) {
          person.health = Math.min(100, Math.max(0, person.health + (Math.random() * 4 - 2.5)));
        }

        // Todeslogik (natürlich oder durch Krankheit)
        let deathChance = 0;
        if (person.age > 70) deathChance += (person.age - 70) * 0.05;
        if (person.health < 20) deathChance += 0.15;

        if (Math.random() < deathChance) {
          person.isAlive = false;
          
          if (id === state.current_id) {
            return { type: 'death' };
          } else {
            // Verwandtschaftsgrad bestimmen für die Todesnachricht
            let relation = "Bekannte(r)";
            if (id === player.motherId) relation = "Mutter";
            if (id === player.fatherId) relation = "Vater";
            
            npcDeaths.push({ name: person.name, relation: relation });
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
          
          // Filtern nach Alter UND Land (später wichtig für Länder-spezifische Events)
          const possibleEvents = allEvents.filter(e => p.age >= e.min_age && p.age <= e.max_age);
          
          if (possibleEvents.length > 0) {
            const event = possibleEvents[Math.floor(Math.random() * possibleEvents.length)];
            return { type: 'event', data: event, npcDeaths: npcDeaths };
          }
        }
      } catch (err) { 
        console.error("Engine Event Error:", err); 
      }
    }

    // Wenn kein Event passiert, senden wir trotzdem die NPC-Todesliste mit
    return { type: 'none', npcDeaths: npcDeaths };
  }

  static processChoice(state, choice) {
    const p = state.persons[state.current_id];
    const effects = choice.effect || {};

    if (effects.money) p.money += effects.money;

    const stats = ['happiness', 'smarts', 'health', 'looks', 'reputation'];
    stats.forEach(stat => {
      if (effects[stat]) {
        p[stat] = Math.min(100, Math.max(0, (p[stat] || 0) + effects[stat]));
      }
    });
  }
}

module.exports = Engine;
