const fs = require('fs-extra');
const path = require('path');

// Wir nutzen den absoluten Pfad zum Hauptverzeichnis des Projekts
const SAVE_DIR = path.join(process.cwd(), 'saves');

async function writeSave(userId, data) {
  try {
    // Dieser Befehl erstellt den Ordner 'saves', falls er fehlt
    await fs.ensureDir(SAVE_DIR);
    const filePath = path.join(SAVE_DIR, `${userId}.json`);
    await fs.writeJson(filePath, data);
    console.log(`Save erfolgreich für User ${userId}`);
  } catch (err) {
    console.error("KRITISCHER SPEICHERFEHLER:", err);
    // Wir werfen den Fehler nicht weiter, damit der Bot nicht abstürzt
  }
}

async function readSave(userId) {
  try {
    const filePath = path.join(SAVE_DIR, `${userId}.json`);
    if (!(await fs.pathExists(filePath))) return null;
    return await fs.readJson(filePath);
  } catch (err) {
    console.error("Ladefehler:", err);
    return null;
  }
}

module.exports = { writeSave, readSave };
