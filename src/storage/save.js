const fs = require('fs-extra');
const path = require('path');

const SAVE_DIR = path.join(__dirname, '../../saves');

async function writeSave(userId, data) {
  await fs.ensureDir(SAVE_DIR);
  await fs.writeJson(path.join(SAVE_DIR, `${userId}.json`), data);
}

async function readSave(userId) {
  const file = path.join(SAVE_DIR, `${userId}.json`);
  if (!(await fs.pathExists(file))) return null;
  return await fs.readJson(file);
}

module.exports = { writeSave, readSave };
