const fs = require('fs');
const path = require('path');

class Engine {
  static nextYear(state) {
    const player = state.persons[state.current_id];
    
    // Sicherheitscheck: Keine Alterung bei Tod oder Game Over
    if (state.isGameOver || !player.isAlive) {
      return { type: 'death_locked' };
    }

    // Initialisierung des Tagebuchs, falls nicht vorhanden
    if (!state.diary) state.diary = [];

    const npcDeaths = [];
    const countries = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'data/countries.json'), 'utf8'));
    const countryData = countries.find(c => c.name === state.country) || countries[0];

    // 1. Alle Personen im Spielstand simulieren
    for (let id in state.persons) {
      const person = state.persons[id];
      if (person.isAlive) {
        person.age += 1;
        
        // --- NPC LOGIK ---
        if (id !== state.current_id) {
          person.health = Math.min(100, Math.max(0, person.health + (Math.random() * 4 - 2.5)));
          
          // Beziehungsverfall
          const decay = Math.floor(Math.random() * 3) + 1;
          person.relationship = Math.max(0, (person.relationship || 50) - decay);

          // NPC-Finanzen basierend auf Ländern
          if (person.age >= 20 && person.age <= 65) {
            person.money += Math.floor((Math.random() * 500 + 100) * countryData.salary_multiplier);
          } else if (person.age > 65) {
            person.money += Math.floor((Math.random() * 200 + 50) * countryData.salary_multiplier);
          }
          person.money = Math.max(0, person.money - (50 * countryData.cost_of_living));
        }

        // --- TODESLOGIK ---
        let deathChance = 0;
        if (person.age > 70) deathChance += (person.age - 70) * 0.05;
        if (person.health < 20) deathChance += 0.15;

        if (Math.random() < deathChance) {
          person.isAlive = false;
          
          if (id === state.current_id) {
            // Spieler stirbt
            state.diary.push(`🕯️ Alter ${person.age}: Du bist in ${state.country} verstorben.`);
            const inheritance = this.checkHeritage(state);
            return { type: 'death', hasInheritor: inheritance.possible, inheritor: inheritance.child };
          } else {
            let relation = "Bekannte(r)";
            if (id === player.motherId) relation = "Mutter";
            if (id === player.fatherId) relation = "Vater";
            if (player.childrenIds.includes(id)) relation = "Kind";
            
            npcDeaths.push({ name: person.name, relation: relation });
            state.diary.push(`🕯️ Alter ${player.age}: Deine ${relation} ${person.name} ist verstorben.`);
          }
        }
      }
    }

    // 2. EVENT CHECK (mit Gewichtung und Tagebuch-Lock)
    if (Math.random() < 0.25) {
      try {
        const eventsPath = path.join(process.cwd(), 'data/events.json');
        const allEvents = JSON.parse(fs.readFileSync(eventsPath, 'utf8'));
        
        let possibleEvents = allEvents.filter(e => player.age >= e.min_age && player.age <= e.max_age);
        
        const weightedPool = [];
        possibleEvents.forEach(e => {
          const weight = e.weight || 10;
          for (let i = 0; i < weight; i++) weightedPool.push(e);
        });

        if (weightedPool.length > 0) {
          const event = weightedPool[Math.floor(Math.random() * weightedPool.length)];
          state.activeEventId = event.id;
          return { type: 'event', data: event, npcDeaths: npcDeaths };
        }
      } catch (err) { console.error(err); }
    }

    return { type: 'none', npcDeaths: npcDeaths };
  }

  static checkHeritage(state) {
    const player = state.persons[state.current_id];
    const children = player.childrenIds
      .map(id => state.persons[id])
      .filter(c => c && c.isAlive);

    if (children.length > 0) {
      const inheritor = children.sort((a, b) => b.age - a.age)[0];
      return { possible: true, child: inheritor };
    }
    
    state.isGameOver = true;
    return { possible: false, child: null };
  }

  static processChoice(state, choice) {
    const p = state.persons[state.current_id];
    const effects = choice.effect || {};

    if (effects.money) p.money += effects.money;

    const stats = ['happiness', 'smarts', 'health', 'looks', 'reputation'];
    stats.forEach(stat => {
      if (effects[stat] !== undefined) {
        p[stat] = Math.min(100, Math.max(0, (p[stat] || 0) + effects[stat]));
      }
    });
    
    // Tagebuch-Eintrag für die Entscheidung
    if (!state.diary) state.diary = [];
    state.diary.push(`📝 Alter ${p.age}: ${choice.response}`);
    
    state.activeEventId = null;
  }
}

module.exports = Engine;
