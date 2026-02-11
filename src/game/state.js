const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

/**
 * Holt einen Namen basierend auf Geschlecht und Land.
 * @param {string} gender - 'M' oder 'W'
 * @param {string} country - Landesschlüssel (z.B. 'germany')
 * @param {string|null} forcedLastName - Optionaler fester Nachname (für Ehe/Kinder)
 */
function getRandomName(gender, country = 'germany', forcedLastName = null) {
  try {
    const namesPath = path.join(process.cwd(), 'data/npc_names.json');
    const allData = JSON.parse(fs.readFileSync(namesPath, 'utf8'));
    
    // Fallback auf Deutschland, falls Land nicht in JSON existiert
    const data = allData[country.toLowerCase()] || allData['germany'];
    
    const firstNames = gender === 'W' ? data.female : data.male;
    const firstName = firstNames[Math.floor(Math.random() * firstNames.length)];
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
    partnerId: null,      // NEU: ID des Ehepartners
    maritalStatus: null,  // NEU: Text wie "Verheiratet mit..."
    childrenIds: [],
    friendsIds: []        // NEU: Liste für NPC-Freunde
  };
}

function initGameState(userId) {
  // Wir wählen ein zufälliges Startland für die Eltern-Generierung
  const countries = ["germany", "usa", "turkey", "japan"];
  const startCountry = countries[Math.floor(Math.random() * countries.length)];

  // 1. Vater generieren
  const fatherData = getRandomName("M", startCountry);
  const father = createPerson(fatherData.full, "M", startCountry);
  father.age = Math.floor(Math.random() * 15) + 25;

  // 2. Mutter generieren (70% Chance auf gleichen Nachnamen/Heirat)
  const isMarried = Math.random() < 0.70;
  const motherLastName = isMarried ? fatherData.last : null;
  const motherData = getRandomName("W", startCountry, motherLastName);
  const mother = createPerson(motherData.full, "W", startCountry);
  mother.age = father.age - Math.floor(Math.random() * 5);

  if (isMarried) {
    father.partnerId = mother.id;
    father.maritalStatus = `Verheiratet mit ${mother.name}`;
    mother.partnerId = father.id;
    mother.maritalStatus = `Verheiratet mit ${father.name}`;
  }

  // 3. Spieler-Platzhalter
  const p = createPerson(null, null, startCountry);
  p.motherId = mother.id;
  p.fatherId = father.id;
  // Wir speichern den Familiennamen im State für die Validierung im Bot
  const familyLastName = fatherData.last;

  return {
    schema_version: "0.0.175",
    setupComplete: false,
    setupStep: 'name',
    country: null, // Wird vom Spieler final gewählt
    familyLastName: familyLastName, // NEU: Damit der Bot den Nachnamen prüfen kann
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
