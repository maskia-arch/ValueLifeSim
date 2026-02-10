const fs = require('fs');
const path = require('path');

// Funktion zum Einlesen der Version aus der txt-Datei
function getVersion() {
  try {
    const versionPath = path.join(process.cwd(), 'version.txt');
    return fs.readFileSync(versionPath, 'utf8').trim();
  } catch (err) {
    return '0.0.0'; // Fallback, falls Datei fehlt
  }
}

module.exports = {
  token: process.env.BOT_TOKEN,
  url: process.env.PUBLIC_URL,
  port: process.env.PORT || 3000,
  savePath: path.join(process.cwd(), 'saves'),
  version: getVersion() // Hier wird die Variable für alle Files bereitgestellt
};
