const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

/**
 * Holt einen Namen basierend auf Geschlecht und Land.
 * @param {string} gender - 'M' oder 'W'
 * @param {string} country - Landesschlüssel (z.B. 'germany')
 * @param {string|null} forcedLastName - Optionaler fester Nachname
 */
function getRandomName(gender, country = 'germany', forcedLastName = null) {
  try {
    const namesPath = path.join(process.cwd(), 'data/npc_names.json');
    const allData = JSON.parse(fs.readFileSync(namesPath, 'utf8'));
    
    // Fallback auf Deutschland, falls Land nicht existiert
    const data = allData[country.toLowerCase()] || allData['germany'];
    
    const firstNames = gender === 'W' ? data.female : data.male;
    const firstName = firstNames[Math.floor(Math.random() * firstNames.length)];
    
    // Nutzt entweder den erzwungenen Nachnamen (vom Spieler) oder einen aus der Liste
    const lastName = forcedLastName || data.lastnames[Math.floor(Math.random() * data.lastnames.length)];
    
    return { full: `${firstName} ${lastName}`, last: lastName };
  } catch (err) {
    const ln = forcedLastName || "Schmidt";
    return { full: (gender === 'W' ? "Julia" : "Lukas") + " " + ln, last: ln };
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
  // Zufälliges Startland für die Eltern-Vornamen-Kultur
  const countries = ["germany", "usa", "turkey", "japan"];
  const startCountry = countries[Math.floor(Math.random() * countries.length)];

  // 1. Eltern als Platzhalter erstellen (Namen werden in der bot.js finalisiert)
  const mother = createPerson(null, "W", startCountry);
  mother.age = Math.floor(Math.random() * 15) + 20;
  
  const father = createPerson(null, "M", startCountry);
  father.age = mother.age + Math.floor(Math.random() * 5);

  // 2. Spieler-Platzhalter
  const p = createPerson(null, null, startCountry);
  p.motherId = mother.id;
  p.fatherId = father.id;

  return {
    schema_version: "0.0.176",
    setupComplete: false,
    setupStep: 'name',
    country: null, 
    familyLastName: null, // Wird vom Spieler durch Eingabe festgelegt
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
  getRandomName 
};
