require('dotenv').config();
const server = require('./src/server');
const config = require('./src/config');
const bot = require('./src/bot'); // Lädt die Bot-Instanz aus src/bot.js

const PORT = config.port || 10000;

// 1. Webhook-Route mit Debug-Logs
server.post('/telegram', (req, res) => {
  // Zeigt im Render-Log an, wenn eine Nachricht reinkommt
  console.log('📥 Update von Telegram erhalten:', JSON.stringify(req.body).substring(0, 100) + "...");

  // Sicherheitscheck: Existiert das Bot-Objekt und die handleUpdate-Funktion?
  if (bot && typeof bot.handleUpdate === 'function') {
    bot.handleUpdate(req.body, res);
  } else {
    console.error('❌ Fehler: Das Bot-Objekt wurde nicht korrekt aus src/bot.js exportiert!');
    res.status(500).send('Internal Server Error: Bot not initialized');
  }
});

// 2. Gesundheits-Check (optional, hilft Render.com zu sehen, dass der Server lebt)
server.get('/', (req, res) => {
  res.send(`ValueLifeSim v${config.version} läuft stabil.`);
});

// 3. Server starten
server.listen(PORT, () => {
  console.log(`🚀 ValueLifeSim v${config.version} online auf Port ${PORT}`);
  console.log(`🔗 Webhook-URL sollte sein: https://DEINE-RENDER-URL.com/telegram`);
});
