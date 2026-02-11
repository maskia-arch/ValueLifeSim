const fs = require('fs');
const path = require('path');
const { getRandomName, createPerson } = require('./state');

class Engine {
  static nextYear(state) {
    const player = state.persons[state.current_id];
    
    if (state.isGameOver || !player.isAlive) {
      return { type: 'death_locked' };
    }

    if (!state.diary) state.diary = [];
    // Sicherheitscheck für Arrays
    if (!player.friendsIds) player.friendsIds = [];
    if (!player.childrenIds) player.childrenIds = [];

    const npcDeaths = [];
    const countries = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'data/countries.json'), 'utf8'));
    const countryData = countries.find(c => c.name === state.country) || countries[0];

    // --- 1. GEBURTS-LOGIK ---
    let birthEvent = null;
    if (player.age >= 16) {
      for (let id in state.persons) {
        const person = state.persons[id];
        if (person.isAlive && person.isPregnant) {
          person.isPregnant = false; 
          
          const gender = Math.random() > 0.5 ? 'M' : 'W';
          const baby = createPerson("Baby", gender, state.country, { 
            m: person.gender === 'W' ? person.id : person.partnerId, 
            f: person.gender === 'M' ? person.id : person.partnerId 
          });

          state.persons[baby.id] = baby;
          
          if (person.id === state.current_id || person.id === player.partnerId) {
            player.childrenIds.push(baby.id);
            const partner = state.persons[player.partnerId];
            if (partner) {
                if (!partner.childrenIds) partner.childrenIds = [];
                partner.childrenIds.push(baby.id);
            }
            
            birthEvent = { type: 'birth', babyId: baby.id, gender: gender };
            state.diary.push(`👶 Alter ${player.age}: Nachwuchs! Ein ${gender === 'W' ? 'Mädchen' : 'Junge'} wurde geboren.`);
          }
        }
      }
    }

    // --- 2. Simulation aller Personen ---
    for (let id in state.persons) {
      const person = state.persons[id];
      if (person.isAlive) {
        person.age += 1;
        
        // ZWANGS-FIX für alle Statuswerte (verhindert undefined in der UI)
        person.heat = person.heat || 0;
        person.money = person.money || 0;
        person.happiness = person.happiness || 100;
        person.health = person.health || 100;
        person.romance = person.romance || 0;

        if (id !== state.current_id) {
          person.health = Math.min(100, Math.max(0, person.health + (Math.random() * 4 - 2.5)));
          
          const isFriend = (player.friendsIds || []).includes(id);
          const isPartner = player.partnerId === id;
          const isParent = (id === player.motherId || id === player.fatherId);
          
          // Beziehungsverfall (Eltern verfallen langsamer)
          let decayFactor = isParent ? 0.5 : 1;
          const decay = (isFriend || isPartner) ? Math.floor(Math.random() * 2 * decayFactor) : Math.floor(Math.random() * 3) + 1;
          person.relationship = Math.max(0, (person.relationship || 50) - decay);

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
            
            npcDeaths.push({ name: person.name, relation: relation });
            state.diary.push(`🕯️ Alter ${player.age}: Deine ${relation} ${person.name} ist verstorben.`);
          }
        }
      }
    }

    if (birthEvent) return { ...birthEvent, npcDeaths };

    // --- 3. Event Check ---
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

  // --- NEU: NPC GENERATOR FÜR SOCIAL-FEATURES ---
  static generateEncounter(state, useSexualityFilter = false) {
    const player = state.persons[state.current_id];
    let targetGender = Math.random() > 0.5 ? 'M' : 'W';

    // Filter-Logik für Finder (Dating-App)
    if (useSexualityFilter && player.hasSetSexuality) {
      if (player.sexuality === 'hetero') {
        targetGender = (player.gender === 'M') ? 'W' : 'M';
      } else if (player.sexuality === 'homo') {
        targetGender = player.gender;
      }
      // Bei 'bi' bleibt targetGender zufällig 50/50
    }

    const npcData = getRandomName(targetGender, state.country);
    const npc = createPerson(npcData.full, targetGender, state.country);
    
    // Alter an den Spieler anpassen (+/- 3 Jahre)
    npc.age = Math.max(16, player.age + (Math.floor(Math.random() * 7) - 3));
    
    // Initialisierung wichtiger Dating-Attribute
    npc.relationship = Math.floor(Math.random() * 20) + 10; // Startwert 10-30%
    npc.looks = Math.floor(Math.random() * 80) + 20;       // Optik 20-100%
    npc.romance = 0;
    
    return npc;
  }

  static checkHeritage(state) {
    const player = state.persons[state.current_id];
    const children = (player.childrenIds || [])
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
    if (!p.friendsIds) p.friendsIds = [];
    
    const effects = choice.effect || {};

    // Standard-Effekte
    if (effects.money) p.money += effects.money;
    ['happiness', 'smarts', 'health', 'looks', 'reputation', 'heat'].forEach(stat => {
      if (effects[stat] !== undefined) {
        p[stat] = Math.min(100, Math.max(0, (p[stat] || 0) + effects[stat]));
      }
    });

    // --- FIX: Freund-Hinzufügen Logik ---
    if (effects.add_friend) {
      const friend = this.generateEncounter(state);
      friend.relationship = 85; // Höherer Startwert für "Event-Freunde"
      
      state.persons[friend.id] = friend;
      p.friendsIds.push(friend.id); 
    }

    state.diary.push(`📝 Alter ${p.age}: ${choice.response}`);
    state.activeEventId = null;
  }
}

module.exports = Engine;
