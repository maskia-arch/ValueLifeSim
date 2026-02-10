const { v4: uuidv4 } = require('uuid');

function createPerson(name, gender = null, parents = { m: null, f: null }, inherited = 0) {
  return {
    id: uuidv4(),
    name,
    gender, // Neu: M oder W
    age: 0,
    money: inherited,
    health: 100,
    happiness: 100,
    smarts: Math.floor(Math.random() * 101),
    looks: Math.floor(Math.random() * 101),
    reputation: 50,
    heat: 0,
    jobId: null,
    isAlive: true,
    motherId: parents.m,
    fatherId: parents.f,
    childrenIds: []
  };
}

function initGameState(userId) {
  // 1. Eltern erstellen
  const mother = createPerson("Mama", "W");
  mother.age = Math.floor(Math.random() * 20) + 20; // 20-40 Jahre alt
  
  const father = createPerson("Papa", "M");
  father.age = mother.age + Math.floor(Math.random() * 5); // Papa meist etwas älter
  
  // 2. Spieler erstellen
  const p = createPerson(null); 
  p.motherId = mother.id;
  p.fatherId = father.id;

  return {
    schema_version: "0.0.14",
    setupComplete: false,
    current_id: p.id,
    persons: { 
      [p.id]: p,
      [mother.id]: mother,
      [father.id]: father
    },
    assets: []
  };
}
