const events = require('../../data/events.json');
const jobs = require('../../data/jobs.json');

class Engine {
  static nextYear(state) {
    const p = state.persons[state.current_id];
    if (!p.isAlive) return { type: 'death' };

    p.age++;
    
    // Wirtschaft & Verfall
    if (p.jobId) {
      const job = jobs.find(j => j.id === p.jobId);
      p.money += job?.salary || 0;
    }
    
    p.health -= (p.age > 60) ? 5 : 1;
    if (p.age > 100 || p.health <= 0) {
      p.isAlive = false;
      return { type: 'death' };
    }

    // Event Auswahl
    const possible = events.filter(e => p.age >= e.min_age && p.age <= e.max_age);
    const event = possible[Math.floor(Math.random() * possible.length)];

    return { type: 'event', data: event };
  }

  static processChoice(state, choice) {
    const p = state.persons[state.current_id];
    const e = choice.effects;
    if (e.money) p.money += e.money;
    if (e.health) p.health = Math.max(0, Math.min(100, p.health + e.health));
    if (e.happiness) p.happiness = Math.max(0, Math.min(100, p.happiness + e.happiness));
    if (e.heat) p.heat += e.heat;
  }
}

module.exports = Engine;
