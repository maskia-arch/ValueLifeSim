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
    if (!player.friendsIds) player.friendsIds = [];
    if (!player.childrenIds) player.childrenIds = [];
    
    // Zähler sicherstellen
    if (state.yearsSinceLastEvent === undefined) state.yearsSinceLastEvent = 0;

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
        
        person.heat = person.heat || 0;
        person.money = person.money || 0;
        person.happiness = person.happiness || 100;
        person.health = person.health || 100;
        person.romance = person.romance || 0;
        person.smarts = person.smarts || 50;
        person.looks = person.looks || 50;

        if (id !== state.current_id) {
          person.health = Math.min(100, Math.max(0, person.health + (Math.random() * 4 - 2.5)));
          
          const isFriend = (player.friendsIds || []).includes(id);
          const isPartner = player.partnerId === id;
          const isParent = (id === player.motherId || id === player.fatherId);
          
          let decayFactor = isParent ? 0.5 : 1;
          const decay = (isFriend || isPartner) ? Math.floor(Math.random() * 2 * decayFactor) : Math.floor(Math.random() * 3) + 1;
          person.relationship = Math.max(0, (person.relationship || 50) - decay);

          if (person.age >= 20 && person.age <= 65) {
            person.money += Math.floor((Math.random() * 500 + 100) * countryData.salary_multiplier);
          }
          person.money = Math.max(0, person.money - (50 * countryData.cost_of_living));
        }

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

    // --- 3. FIX: ÜBERARBEITETER EVENT CHECK ---
    const baseChance = 0.35; // Erhöht auf 35%
    const forceEventThreshold = 3; // Nach 3 Jahren Ruhe kommt garantiert ein Event
    
    const shouldTrigger = (Math.random() < baseChance) || (state.yearsSinceLastEvent >= forceEventThreshold);

    if (shouldTrigger) {
      try {
        const eventsPath = path.join(process.cwd(), 'data/events.json');
        const allEvents = JSON.parse(fs.readFileSync(eventsPath, 'utf8'));
        
        const hasPartner = player.partnerId !== null;

        let possibleEvents = allEvents.filter(e => {
          const ageMatch = player.age >= e.min_age && player.age <= e.max_age;
          const partnerMatch = e.requires_partner ? hasPartner : true;
          return ageMatch && partnerMatch;
        });
        
        if (possibleEvents.length > 0) {
          const event = possibleEvents[Math.floor(Math.random() * possibleEvents.length)];
          state.activeEventId = event.id;
          state.yearsSinceLastEvent = 0; // Zähler bei Erfolg zurücksetzen
          return { type: 'event', data: event, npcDeaths: npcDeaths };
        }
      } catch (err) { console.error("Event-System Fehler:", err); }
    }

    // Wenn kein Event getriggert wurde, Zähler erhöhen
    state.yearsSinceLastEvent++; 
    return { type: 'none', npcDeaths: npcDeaths };
  }

  static generateEncounter(state, useSexualityFilter = false) {
    const player = state.persons[state.current_id];
    let targetGender = Math.random() > 0.5 ? 'M' : 'W';

    if (useSexualityFilter && player.hasSetSexuality) {
      if (player.sexuality === 'hetero') {
        targetGender = (player.gender === 'M') ? 'W' : 'M';
      } else if (player.sexuality === 'homo') {
        targetGender = player.gender;
      }
    }

    const npcData = getRandomName(targetGender, state.country);
    const npc = createPerson(npcData.full, targetGender, state.country);
    
    npc.age = Math.max(16, player.age + (Math.floor(Math.random() * 7) - 3));
    npc.relationship = Math.floor(Math.random() * 20) + 10; 
    npc.looks = Math.floor(Math.random() * 80) + 20;       
    npc.romance = 0;
    
    return npc;
  }

  static attemptRelationship(state, npcId) {
    const player = state.persons[state.current_id];
    const npc = state.persons[npcId];
    if (!npc) return { success: false };

    const isParent = (npcId === player.motherId || npcId === player.fatherId);
    if (isParent) return { success: false, reason: 'family' };

    const chance = npc.relationship / 100;
    const success = Math.random() < chance;

    if (success) {
      player.partnerId = npcId;
      npc.partnerId = state.current_id;
      player.maritalStatus = `In einer Beziehung mit ${npc.name}`;
      npc.maritalStatus = `In einer Beziehung mit ${player.name}`;
      
      npc.relationship = 100;
      npc.romance = 50; 
      
      state.diary.push(`❤️ Alter ${player.age}: Du bist nun offiziell mit ${npc.name} zusammen!`);
      return { success: true };
    } else {
      npc.relationship = Math.max(0, npc.relationship - 20);
      state.diary.push(`💔 Alter ${player.age}: ${npc.name} hat deinen Beziehungsantrag abgelehnt.`);
      return { success: false };
    }
  }

  static attemptMarriage(state, npcId) {
    const player = state.persons[state.current_id];
    const npc = state.persons[npcId];
    
    if (!npc || player.partnerId !== npcId || npc.relationship < 100) {
      return { success: false, reason: 'low_relationship' };
    }

    const success = Math.random() < 0.98;

    if (success) {
      return { success: true };
    } else {
      npc.relationship = Math.max(0, npc.relationship - 30);
      state.diary.push(`💔 Alter ${player.age}: Schock! ${npc.name} hat deinen Heiratsantrag abgelehnt.`);
      return { success: false, reason: 'rejected' };
    }
  }

  static attemptOneNightStand(state, npcId) {
    const player = state.persons[state.current_id];
    const npc = state.persons[npcId];
    if (!npc) return { success: false };
    
    const chance = (player.looks / 100) * 0.4 + (player.heat / 100) * 0.2 + 0.2;
    const success = Math.random() < chance;

    if (success) {
      player.happiness = Math.min(100, player.happiness + 15);
      npc.relationship = Math.min(100, npc.relationship + 10);
      state.diary.push(`🔥 Alter ${player.age}: Du hattest ein aufregendes Abenteuer mit ${npc.name}.`);
      return { success: true };
    } else {
      player.happiness = Math.max(0, player.happiness - 10);
      npc.relationship = Math.max(0, npc.relationship - 15);
      state.diary.push(`❌ Alter ${player.age}: ${npc.name} hatte kein Interesse an einem Abenteuer.`);
      return { success: false };
    }
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

    if (effects.money) p.money += effects.money;
    ['happiness', 'smarts', 'health', 'looks', 'reputation', 'heat'].forEach(stat => {
      if (effects[stat] !== undefined) {
        p[stat] = Math.min(100, Math.max(0, (p[stat] || 0) + effects[stat]));
      }
    });

    if (effects.relationship_partner && p.partnerId) {
        const partner = state.persons[p.partnerId];
        partner.relationship = Math.min(100, Math.max(0, (partner.relationship || 0) + effects.relationship_partner));
    }

    if (effects.add_friend) {
      const friend = this.generateEncounter(state);
      friend.relationship = 85; 
      state.persons[friend.id] = friend;
      p.friendsIds.push(friend.id); 
    }

    state.diary.push(`📝 Alter ${p.age}: ${choice.response}`);
    state.activeEventId = null;
  }
}

module.exports = Engine;
