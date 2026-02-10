const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

// Hilfsfunktion: Holt einen zufälligen Namen aus der JSON
function getRandomName(gender) {
  try {
    const namesPath = path.join(process.cwd(), 'data/npc_names.json');
    const data = JSON.parse(fs.readFileSync(namesPath, 'utf8'));
    
    const firstNames = gender === 'W' ? data.female : data.male;
    const firstName = firstNames[Math.floor(Math.random() * firstNames.length)];
    const lastName = data.lastnames[Math.floor(Math.random() * data.lastnames.length)];
    
    return `${firstName} ${lastName}`;
  } catch (err) {
    return gender === 'W' ? "Monika Smith" : "Andreas Kaya";
  }
}

function createPerson(name, gender = null, parents = { m: null, f: null }, inherited = 0) {
  // Wenn name ein String ist (auch leerer String), nehmen wir ihn. 
  // Nur wenn name absolut null/undefined ist UND ein Geschlecht feststeht, würfeln wir.
  let finalName = name;
  if (finalName === null && gender !== null) {
    finalName = getRandomName(gender);
  }
  
  return {
    id: uuidv4(),
    name: finalName, // Bleibt null für den Spieler, bis Bot ihn setzt
    gender: gender, 
    age: 0,
    money: inherited,
    health: 100,
    happiness: 100,
    smarts: Math.floor(Math.random() * 101),
    looks: Math.floor(Math.random() * 101),
    reputation: 50,
    heat: 0,
    relationship: 80,
    jobId: null,
    isAlive: true,
    motherId: parents.m,
    fatherId: parents.f,
    childrenIds: []
  };
}

function initGameState(userId) {
  // Eltern erhalten sofort Geschlecht und Namen
  const mother = createPerson(null, "W");
  mother.age = Math.floor(Math.random() * 15) + 20;
  
  const father = createPerson(null, "M");
  father.age = mother.age + Math.floor(Math.random() * 5);
  
  // Spieler wird mit name = null und gender = null erstellt
  const p = createPerson(null, null); 
  p.motherId = mother.id;
  p.fatherId = father.id;

  return {
    schema_version: "0.0.172",
    setupComplete: false,
    setupStep: 'name',
    country: null,
    current_id: p.id,
    activeEventId: null,
    isGameOver: false,
    persons: { 
      [p.id]: p,
      [mother.id]: mother,
      [father.id]: father
    },
    assets: []
  };
}

module.exports = { 
  createPerson, 
  initGameState 
};
