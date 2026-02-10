const fs = require('fs');
const path = require('path');

class Engine {
  static nextYear(state) {
    // 1. Alle Personen im Spielstand altern lassen und ggf. sterben lassen
    for (let id in state.persons) {
      const person = state.persons[id];
      
      if (person.isAlive) {
        person.age += 1;

        // Logik für natürliches Sterben ab 70 Jahren
        if (person.age > 70) {
          // Die Wahrscheinlichkeit steigt mit jedem Jahr nach 70 um 5%
          const deathChance = (person.age - 70) * 0.05;
          if (Math.random() < deathChance) {
            person.isAlive = false;
            
            // Falls der aktuelle Spieler stirbt, geben wir das sofort zurück
            if (id === state.current_id) {
              return { type: 'death' };
            }
          }
        }
      }
    }

    const p = state.persons[state.current_id];

    // 2. Zufalls-Event Check für den Spieler (25% Wahrscheinlichkeit)
    const shouldTriggerEvent = Math.random() < 0.25;
    
    if (shouldTriggerEvent) {
      try {
        const eventsPath = path.join(process.cwd(), 'data/events.json');
        const allEvents = JSON.parse(fs.readFileSync(eventsPath, 'utf8'));
        
        // Filtern nach Alter des Spielers
        const possibleEvents = allEvents.filter(e => p.age >= e.min_age && p.age <= e.max_age);
        
        if (possibleEvents.length > 0) {
          const event = possibleEvents[Math.floor(Math.random() * possibleEvents.length)];
          return { type: 'event', data: event };
        }
      } catch (err) {
        console.error("Fehler beim Laden der Events:", err);
      }
    }

    // Kein Event, nur normales Altern aller Beteiligten
    return { type: 'none' };
  }

  static processChoice(state, choice) {
    const p = state.persons[state.current_id];
    const effects = choice.effect || {};

    // Effekte auf die Statuswerte anwenden
    if (effects.money) p.money += effects.money;
    if (effects.happiness) p.happiness = Math.min(100, Math.max(0, p.happiness + effects.happiness));
    if (effects.smarts) p.smarts = Math.min(100, Math.max(0, p.smarts + effects.smarts));
    if (effects.health) p.health = Math.min(100, Math.max(0, p.health + effects.health));
  }
}

module.exports = Engine;
