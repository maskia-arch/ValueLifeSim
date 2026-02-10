const fs = require('fs');
const path = require('path');

class Engine {
  static nextYear(state) {
    const player = state.persons[state.current_id];
    
    // Sicherheitscheck: Wenn das Spiel vorbei ist oder der Spieler tot, keine Alterung zulassen
    if (state.isGameOver || !player.isAlive) {
      return { type: 'death_locked' };
    }

    const npcDeaths = [];

    // 1. Alle Personen im Spielstand simulieren
    for (let id in state.persons) {
      const person = state.persons[id];
      if (person.isAlive) {
        person.age += 1;
        
        // --- NPC LOGIK (Eltern/Kinder/Freunde) ---
        if (id !== state.current_id) {
          person.health = Math.min(100, Math.max(0, person.health + (Math.random() * 4 - 2.5)));
          
          // Beziehungsverfall
          const decay = Math.floor(Math.random() * 3) + 1;
          person.relationship = Math.max(0, (person.relationship || 50) - decay);

          // NPC-Finanzen
          if (person.age >= 20 && person.age <= 65) {
            person.money += Math.floor(Math.random() * 500) + 100;
          } else if (person.age > 65) {
            person.money += Math.floor(Math.random() * 200) + 50;
          }
          person.money = Math.max(0, person.money - 50);
        }

        // --- TODESLOGIK ---
        let deathChance = 0;
        if (person.age > 70) deathChance += (person.age - 70) * 0.05;
        if (person.health < 20) deathChance += 0.15;

        if (Math.random() < deathChance) {
          person.isAlive = false;
          
          if (id === state.current_id) {
            // Spieler stirbt -> Erbe-Check einleiten
            const inheritance = this.checkHeritage(state);
            return { type: 'death', hasInheritor: inheritance.possible, inheritor: inheritance.child };
          } else {
            let relation = "Bekannte(r)";
            if (id === player.motherId) relation = "Mutter";
            if (id === player.fatherId) relation = "Vater";
            // Check ob es ein Kind ist
            if (player.childrenIds.includes(id)) relation = "Kind";
            
            npcDeaths.push({ name: person.name, relation: relation });
          }
        }
      }
    }

    // 2. EVENT CHECK (mit Gewichtung und Sperre)
    if (Math.random() < 0.25) {
      try {
        const eventsPath = path.join(process.cwd(), 'data/events.json');
        const allEvents = JSON.parse(fs.readFileSync(eventsPath, 'utf8'));
        
        // Filter nach Alter
        let possibleEvents = allEvents.filter(e => player.age >= e.min_age && player.age <= e.max_age);
        
        // Gewichtetes Zufallssystem
        const weightedPool = [];
        possibleEvents.forEach(e => {
          const weight = e.weight || 10; // Standardgewicht 10
          for (let i = 0; i < weight; i++) weightedPool.push(e);
        });

        if (weightedPool.length > 0) {
          const event = weightedPool[Math.floor(Math.random() * weightedPool.length)];
          state.activeEventId = event.id; // Event-Lock im State setzen
          return { type: 'event', data: event, npcDeaths: npcDeaths };
        }
      } catch (err) { console.error(err); }
    }

    return { type: 'none', npcDeaths: npcDeaths };
  }

  // Hilfsfunktion: Prüft ob Kinder als Erben vorhanden sind
  static checkHeritage(state) {
    const player = state.persons[state.current_id];
    const children = player.childrenIds
      .map(id => state.persons[id])
      .filter(c => c && c.isAlive);

    if (children.length > 0) {
      // Wählt das älteste lebende Kind als primären Erben
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
    
    // WICHTIG: Event-Lock nach der Wahl aufheben
    state.activeEventId = null;
  }
}

module.exports = Engine;
