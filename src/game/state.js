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
 * Passt die Eltern kulturell an das gewählte Land an.
 */
function finalizeParentsCulture(state, country) {
  const p = state.persons[state.current_id];
  const mother = state.persons[p.motherId];
  const father = state.persons[p.fatherId];
  const lastName = state.familyLastName;

  const mData = getRandomName("W", country, lastName);
  const fData = getRandomName("M", country, lastName);

  mother.name = mData.full;
  father.name = fData.full;

  // Verknüpfung der Eltern als Partner
  mother.partnerId = father.id;
  father.partnerId = mother.id;
  mother.maritalStatus = `Verheiratet mit ${father.name}`;
  father.maritalStatus = `Verheiratet mit ${mother.name}`;
}

/**
 * Erstellt eine Person mit erweiterten Attributen.
 */
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
    heat: 0,                                
    reputation: 50,
    relationship: 80, 
    romance: 0,                             
    isAlive: true,
    motherId: parents.m,
    fatherId: parents.f,
    partnerId: null,      
    maritalStatus: null,  
    sexuality: 'hetero', 
    hasSetSexuality: false, 
    isPregnant: false,   
    childrenIds: [],
    friendsIds: []        
  };
}

/**
 * Initialisiert den globalen Spielzustand für v0.0.3i.
 */
function initGameState(userId) {
  const mother = createPerson(null, "W");
  mother.age = Math.floor(Math.random() * 15) + 20;
  
  const father = createPerson(null, "M");
  father.age = mother.age + Math.floor(Math.random() * 5);

  const p = createPerson(null, null);
  p.motherId = mother.id;
  p.fatherId = father.id;

  return {
    schema_version: "0.0.3i", 
    setupComplete: false,
    setupStep: 'name',
    country: null, 
    familyLastName: null, 
    current_id: p.id,
    activeEventId: null,
    pendingBabyId: null,     // NEU: Hält die ID des Babys während der Namenswahl
    isGameOver: false,
    diary: [],
    lastMessageId: null,
    pinMessageId: null,      
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
