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
  // Wir erstellen die Person erst ohne Namen, da dieser im Bot-Dialog abgefragt wird
  const p = createPerson(null); 
  return {
    schema_version: "0.0.12", // Deine aktuelle Ziel-Version
    setupComplete: false,    // Neu: Markiert, ob Name/Geschlecht feststehen
    current_id: p.id,
    persons: { [p.id]: p },
    assets: []
  };
}

module.exports = { createPerson, initGameState };
