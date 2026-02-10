const fs = require('fs');
const path = require('path');

class Engine {
  static nextYear(state) {
    const p = state.persons[state.current_id];
    
    // 1. Charakter altert
    p.age += 1;

    // 2. Zufalls-Event Check (25% Wahrscheinlichkeit)
    const shouldTriggerEvent = Math.random() < 0.25;
    
    if (shouldTriggerEvent) {
      const allEvents = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'data/events.json'), 'utf8'));
      
      // Filtern nach Alter
      const possibleEvents = allEvents.filter(e => p.age >= e.min_age && p.age <= e.max_age);
      
      if (possibleEvents.length > 0) {
        const event = possibleEvents[Math.floor(Math.random() * possibleEvents.length)];
        return { type: 'event', data: event };
      }
    }

    // Kein Event, nur normales Altern
    return { type: 'none' };
  }

  static processChoice(state, choice) {
    const p = state.persons[state.current_id];
    const effects = choice.effect || {};

    // Effekte anwenden
    if (effects.money) p.money += effects.money;
    if (effects.happiness) p.happiness = Math.min(100, Math.max(0, p.happiness + effects.happiness));
    if (effects.smarts) p.smarts = Math.min(100, Math.max(0, p.smarts + effects.smarts));
    if (effects.health) p.health = Math.min(100, Math.max(0, p.health + effects.health));
  }
}

module.exports = Engine;
