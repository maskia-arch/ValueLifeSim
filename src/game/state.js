const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

/**
 * Hilfsfunktion: Holt einen zufälligen Namen aus der JSON-Datenbank
 */
function getRandomName(gender) {
  try {
    const namesPath = path.join(process.cwd(), 'data/npc_names.json');
    const data = JSON.parse(fs.readFileSync(namesPath, 'utf8'));
    
    const firstNames = gender === 'W' ? data.female : data.male;
    const firstName = firstNames[Math.floor(Math.random() * firstNames.length)];
    const lastName = data.lastnames[Math.floor(Math.random() * data.lastnames.length)];
    
    return `${firstName} ${lastName}`;
  } catch (err) {
    // Fallback, falls Datei fehlt oder beschädigt ist
    return gender === 'W' ? "Monika Smith" : "Andreas Kaya";
  }
}

/**
 * Erstellt ein neues Personen-Objekt mit Standardwerten
 */
function createPerson(name, gender = null, parents = { m: null, f: null }, inherited = 0) {
  let finalName = name;
  if (finalName === null && gender !== null) {
    finalName = getRandomName(gender);
  }
  
  return {
    id: uuidv4(),
    name: finalName, 
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

/**
 * Initialisiert den kompletten Spielstatus für einen neuen User
 */
function initGameState(userId) {
  // Eltern-Generierung (Erhalten sofort Namen/Geschlecht)
  const mother = createPerson(null, "W");
  mother.age = Math.floor(Math.random() * 15) + 20;
  
  const father = createPerson(null, "M");
  father.age = mother.age + Math.floor(Math.random() * 5);
  
  // Spieler-Initialisierung (Name/Geschlecht/Land folgen im Setup)
  const p = createPerson(null, null); 
  p.motherId = mother.id;
  p.fatherId = father.id;

  return {
    schema_version: "0.0.174",
    setupComplete: false,   // Sperre für Charaktererstellung
    setupStep: 'name',      // Aktueller Schritt im Setup
    country: null,          // Wird im Setup festgesetzt
    current_id: p.id,       // Zeiger auf den aktuellen aktiven Charakter
    
    // UI- & Engine-Management (Wichtig für Cloud-Sync)
    activeEventId: null,    // Verhindert Klicks auf alte Ereignisse
    isGameOver: false,      // Stoppt die Engine bei Tod ohne Erben
    diary: [],              // Lebenschronik / Tagebuch
    lastMessageId: null,    // Notwendig für automatische Nachrichten-Löschung
    
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
