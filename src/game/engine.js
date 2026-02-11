const fs = require('fs');
const path = require('path');
const { getRandomName, createPerson } = require('./state'); // Wichtig für NPC-Generierung

class Engine {
  static nextYear(state) {
    const player = state.persons[state.current_id];
    
    if (state.isGameOver || !player.isAlive) {
      return { type: 'death_locked' };
    }

    if (!state.diary) state.diary = [];

    const npcDeaths = [];
    const countries = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'data/countries.json'), 'utf8'));
    // Nutzt das Land des Spielers für wirtschaftliche Faktoren
    const countryData = countries.find(c => c.name === state.country) || countries[0];

    // 1. Simulation aller Personen
    for (let id in state.persons) {
      const person = state.persons[id];
      if (person.isAlive) {
        person.age += 1;
        
        if (id !== state.current_id) {
          person.health = Math.min(100, Math.max(0, person.health + (Math.random() * 4 - 2.5)));
          
          // Beziehungsverfall (etwas milder bei Freunden/Partnern)
          const isFriend = (player.friendsIds || []).includes(id);
          const decay = isFriend ? Math.floor(Math.random() * 2) : Math.floor(Math.random() * 3) + 1;
          person.relationship = Math.max(0, (person.relationship || 50) - decay);

          // NPC-Finanzen
          if (person.age >= 20 && person.age <= 65) {
            person.money += Math.floor((Math.random() * 500 + 100) * countryData.salary_multiplier);
          }
          person.money = Math.max(0, person.money - (50 * countryData.cost_of_living));
        }

        // Todeslogik
        let deathChance = 0;
        if (person.age > 70) deathChance += (person.age - 70) * 0.05;
        if (person.health < 20) deathChance += 0.15;

        if (Math.random() < deathChance) {
          person.isAlive = false;
          
          if (id === state.current_id) {
            state.diary.push(`🕯️ Alter ${person.age}: Du bist in ${state.country} verstorben.`);
            const inheritance = this.checkHeritage(state);
            return { type: 'death', hasInheritor: inheritance.possible, inheritor: inheritance.child };
          } else {
            let relation = "Bekannte(r)";
            if (id === player.motherId) relation = "Mutter";
            if (id === player.fatherId) relation = "Vater";
            if (id === player.partnerId) relation = "Ehepartner";
            if (player.childrenIds.includes(id)) relation = "Kind";
            if ((player.friendsIds || []).includes(id)) relation = "Freund(in)";
            
            npcDeaths.push({ name: person.name, relation: relation });
            state.diary.push(`🕯️ Alter ${player.age}: Deine ${relation} ${person.name} ist verstorben.`);
          }
        }
      }
    }

    // 2. Event Check
    if (Math.random() < 0.25) {
      try {
        const eventsPath = path.join(process.cwd(), 'data/events.json');
        const allEvents = JSON.parse(fs.readFileSync(eventsPath, 'utf8'));
        
        let possibleEvents = allEvents.filter(e => player.age >= e.min_age && player.age <= e.max_age);
        
        if (possibleEvents.length > 0) {
          const event = possibleEvents[Math.floor(Math.random() * possibleEvents.length)];
          state.activeEventId = event.id;
          return { type: 'event', data: event, npcDeaths: npcDeaths };
        }
      } catch (err) { console.error(err); }
    }

    return { type: 'none', npcDeaths: npcDeaths };
  }

  static processChoice(state, choice) {
    const p = state.persons[state.current_id];
    const effects = choice.effect || {};

    // Standard-Effekte
    if (effects.money) p.money += effects.money;
    ['happiness', 'smarts', 'health', 'looks', 'reputation'].forEach(stat => {
      if (effects[stat] !== undefined) {
        p[stat] = Math.min(100, Math.max(0, (p[stat] || 0) + effects[stat]));
      }
    });
    
    // --- NEU: NPC GENERIERUNG (Freunde) ---
    if (effects.add_friend) {
      const gender = Math.random() > 0.5 ? 'M' : 'W';
      // Erstellt NPC passend zum aktuellen Land des Spielers
      const npcData = getRandomName(gender, state.country || 'germany');
      const friend = createPerson(npcData.full, gender, state.country);
      
      // Alter des Freundes an Spieler anpassen (+/- 2 Jahre)
      friend.age = Math.max(0, p.age + (Math.floor(Math.random() * 5) - 2));
      friend.relationship = 70; // Startwert für neue Freunde
      
      state.persons[friend.id] = friend;
      if (!p.friendsIds) p.friendsIds = [];
      p.friendsIds.push(friend.id);
    }

    if (!state.diary) state.diary = [];
    state.diary.push(`📝 Alter ${p.age}: ${choice.response}`);
    state.activeEventId = null;
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
}

module.exports = Engine;
