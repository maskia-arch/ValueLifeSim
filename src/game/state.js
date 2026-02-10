const { v4: uuidv4 } = require('uuid');

function createPerson(name, parents = { m: null, f: null }, inherited = 0) {
  return {
    id: uuidv4(),
    name,
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

function initGameState(userId, name) {
  const p = createPerson(name);
  return {
    schema_version: "0.0.1",
    current_id: p.id,
    persons: { [p.id]: p },
    assets: []
  };
}

module.exports = { createPerson, initGameState };
