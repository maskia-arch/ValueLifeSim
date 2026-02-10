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
    console.error("Namens-Fehler:", err);
    return gender === 'W' ? "Erika Mustermann" : "Max Mustermann";
  }
}

function createPerson(name, gender = null, parents = { m: null, f: null }, inherited = 0) {
  // Wenn 'name' null ist, wird ein Zufallsname generiert
  const finalName = name || getRandomName(gender);
  
  return {
    id: uuidv4(),
    name: finalName,
    gender, 
    age: 0,
    money: inherited,
    health: 100,
    happiness: 100,
    smarts: Math.floor(Math.random() * 101),
    looks: Math.floor(Math.random() * 101),
    reputation: 50,
    heat: 0,
    relationship: 50,
    jobId: null,
    isAlive: true,
    motherId: parents.m,
    fatherId: parents.f,
    childrenIds: []
  };
}

function initGameState(userId) {
  // WICHTIG: null übergeben, damit createPerson einen Namen generiert!
  const mother = createPerson(null, "W");
  mother.age = Math.floor(Math.random() * 20) + 20;
  mother.money = Math.floor(Math.random() * 5000);
  mother.relationship = 80;
  
  const father = createPerson(null, "M");
  father.age = mother.age + Math.floor(Math.random() * 5);
  father.money = Math.floor(Math.random() * 5000);
  father.relationship = 80;
  
  // Spieler (Name wird später im Setup gesetzt)
  const p = createPerson(null); 
  p.motherId = mother.id;
  p.fatherId = father.id;

  return {
    schema_version: "0.0.161",
    setupComplete: false,
    setupStep: 'name',
    country: null,
    current_id: p.id,
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
