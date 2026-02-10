require('dotenv').config();
const server = require('./src/server');
const config = require('./src/config');
const bot = require('./src/bot'); // WICHTIG: Lädt deine Bot-Logik!

const PORT = config.port;

// Webhook-Route einrichten
// Telegram sendet Updates an https://deine-url.com/telegram
server.post('/telegram', (req, res) => {
  bot.handleUpdate(req.body, res);
});

server.listen(PORT, () => {
  console.log(`ValueLifeSim v${config.version} online auf Port ${PORT}`);
});
