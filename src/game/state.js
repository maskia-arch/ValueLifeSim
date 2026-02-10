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
  let finalName = name;
  if (!finalName && gender) {
    finalName = getRandomName(gender);
  }
  
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
    childrenIds: [] // Wichtig für das Erbe-System
  };
}

function initGameState(userId) {
  const mother = createPerson(null, "W");
  mother.age = Math.floor(Math.random() * 20) + 20;
  mother.money = Math.floor(Math.random() * 5000);
  mother.relationship = 80;
  
  const father = createPerson(null, "M");
  father.age = mother.age + Math.floor(Math.random() * 5);
  father.money = Math.floor(Math.random() * 5000);
  father.relationship = 80;
  
  const p = createPerson(null, null); 
  p.motherId = mother.id;
  p.fatherId = father.id;

  return {
    schema_version: "0.0.172",
    setupComplete: false,
    setupStep: 'name',
    country: null,
    current_id: p.id,
    
    // NEU: Sicherheit & Erbe
    activeEventId: null, // Verhindert Mehrfach-Klicks (Exploit-Schutz)
    isGameOver: false,   // Sperrt das Spiel, wenn der Stammbaum endet
    
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
