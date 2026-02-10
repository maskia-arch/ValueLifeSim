const fs = require('fs');
const path = require('path');

class Engine {
  static nextYear(state) {
    for (let id in state.persons) {
      const person = state.persons[id];
      if (person.isAlive) {
        person.age += 1;
        if (person.age > 70) {
          const deathChance = (person.age - 70) * 0.05;
          if (Math.random() < deathChance) {
            person.isAlive = false;
            if (id === state.current_id) return { type: 'death' };
          }
        }
      }
    }

    const p = state.persons[state.current_id];
    if (Math.random() < 0.25) {
      try {
        const eventsPath = path.join(process.cwd(), 'data/events.json');
        const allEvents = JSON.parse(fs.readFileSync(eventsPath, 'utf8'));
        const possibleEvents = allEvents.filter(e => p.age >= e.min_age && p.age <= e.max_age);
        if (possibleEvents.length > 0) {
          return { type: 'event', data: possibleEvents[Math.floor(Math.random() * possibleEvents.length)] };
        }
      } catch (err) { console.error("Event Error:", err); }
    }
    return { type: 'none' };
  }

  static processChoice(state, choice) {
    const p = state.persons[state.current_id];
    const effects = choice.effect || {};
    if (effects.money) p.money += effects.money;
    if (effects.happiness) p.happiness = Math.min(100, Math.max(0, p.happiness + effects.happiness));
    if (effects.smarts) p.smarts = Math.min(100, Math.max(0, p.smarts + effects.smarts));
    if (effects.health) p.health = Math.min(100, Math.max(0, p.health + effects.health));
  }
}

module.exports = Engine;

