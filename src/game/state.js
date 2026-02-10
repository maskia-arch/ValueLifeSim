const { v4: uuidv4 } = require('uuid');

function createPerson(name, gender = null, parents = { m: null, f: null }, inherited = 0) {
  return {
    id: uuidv4(),
    name,
    gender, 
    age: 0,
    money: inherited,
    health: 100,
    happiness: 100,
    smarts: Math.floor(Math.random() * 101),
    looks: Math.floor(Math.random() * 101),
    reputation: 50,
    heat: 0,
    relationship: 50, // Neu: Beziehungswert zum Spieler (0-100)
    jobId: null,
    isAlive: true,
    motherId: parents.m,
    fatherId: parents.f,
    childrenIds: []
  };
}

function initGameState(userId) {
  // 1. Eltern erstellen (mit etwas Startkapital und Alter)
  const mother = createPerson("Mama", "W");
  mother.age = Math.floor(Math.random() * 20) + 20;
  mother.money = Math.floor(Math.random() * 5000);
  mother.relationship = 80; // Zu den Eltern startet man meist gut
  
  const father = createPerson("Papa", "M");
  father.age = mother.age + Math.floor(Math.random() * 5);
  father.money = Math.floor(Math.random() * 5000);
  father.relationship = 80;
  
  // 2. Spieler erstellen
  const p = createPerson(null); 
  p.motherId = mother.id;
  p.fatherId = father.id;

  return {
    schema_version: "0.0.16",
    setupComplete: false,
    setupStep: 'name', // Neu: 'name', 'gender', 'country'
    country: null,     // Neu: Startland
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
