const fs = require('fs');
const path = require('path');

// Funktion zum Einlesen der Version aus der txt-Datei
function getVersion() {
  try {
    const versionPath = path.join(process.cwd(), 'version.txt');
    if (fs.existsSync(versionPath)) {
      return fs.readFileSync(versionPath, 'utf8').trim();
    }
    return '0.0.22'; // Manueller Fallback passend zum Update
  } catch (err) {
    return '0.0.22'; 
  }
}

module.exports = {
  token: process.env.BOT_TOKEN,
  url: process.env.PUBLIC_URL,
  // Auf Render.com wird PORT automatisch zugewiesen (meist 10000)
  port: process.env.PORT || 3000,
  savePath: path.join(process.cwd(), 'saves'),
  version: getVersion()
};
