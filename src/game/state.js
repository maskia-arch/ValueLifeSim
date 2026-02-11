const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

/**
 * Holt einen Namen basierend auf Geschlecht und Land.
 */
function getRandomName(gender, country = 'germany', forcedLastName = null) {
  try {
    const namesPath = path.join(process.cwd(), 'data/npc_names.json');
    const allData = JSON.parse(fs.readFileSync(namesPath, 'utf8'));
    
    // Fallback auf den technischen Namen (Mapping für npc_names keys)
    const key = country.toLowerCase();
    const data = allData[key] || allData['germany'];
    
    const firstNames = gender === 'W' ? data.female : data.male;
    const firstName = firstNames[Math.floor(Math.random() * firstNames.length)];
    
    const lastName = forcedLastName || data.lastnames[Math.floor(Math.random() * data.lastnames.length)];
    
    return { full: `${firstName} ${lastName}`, last: lastName };
  } catch (err) {
    const ln = forcedLastName || "Schmidt";
    return { full: (gender === 'W' ? "Julia" : "Lukas") + " " + ln, last: ln };
  }
}

/**
 * NEU: Passt die Eltern kulturell an das gewählte Land an.
 */
function finalizeParentsCulture(state, country) {
  const p = state.persons[state.current_id];
  const mother = state.persons[p.motherId];
  const father = state.persons[p.fatherId];
  const lastName = state.familyLastName;

  // Generiere neue Vornamen passend zur Nationalität
  const mData = getRandomName("W", country, lastName);
  const fData = getRandomName("M", country, lastName);

  mother.name = mData.full;
  father.name = fData.full;

  // Falls verheiratet, Marital Status Texte aktualisieren
  if (mother.partnerId === father.id) {
    mother.maritalStatus = `Verheiratet mit ${father.name}`;
    father.maritalStatus = `Verheiratet mit ${mother.name}`;
  }
}

function createPerson(name, gender = null, country = 'germany', parents = { m: null, f: null }, inherited = 0) {
  return {
    id: uuidv4(),
    name: name, 
    gender: gender, 
    age: 0,
    money: inherited,
    health: 100,
    happiness: 100,
    smarts: Math.floor(Math.random() * 101),
    looks: Math.floor(Math.random() * 101),
    reputation: 50,
    relationship: 80,
    isAlive: true,
    motherId: parents.m,
    fatherId: parents.f,
    partnerId: null,      
    maritalStatus: null,  
    childrenIds: [],
    friendsIds: []        
  };
}

function initGameState(userId) {
  // Wir erstellen die Personen zuerst als Platzhalter
  const mother = createPerson(null, "W");
  mother.age = Math.floor(Math.random() * 15) + 20;
  
  const father = createPerson(null, "M");
  father.age = mother.age + Math.floor(Math.random() * 5);

  const p = createPerson(null, null);
  p.motherId = mother.id;
  p.fatherId = father.id;

  return {
    schema_version: "0.0.176",
    setupComplete: false,
    setupStep: 'name',
    country: null, 
    familyLastName: null, 
    current_id: p.id,
    activeEventId: null,
    isGameOver: false,
    diary: [],
    lastMessageId: null,
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
  initGameState,
  getRandomName,
  finalizeParentsCulture
};
