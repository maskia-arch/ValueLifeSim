const express = require('express');
const server = express();

// Middleware um JSON-Daten von Telegram zu verarbeiten
server.use(express.json());

// 1. Health-Check für Render.com (Wichtig für das "Live"-Signal)
server.get('/health', (req, res) => {
    res.send({ 
        status: "ok", 
        version: "0.0.22",
        timestamp: new Date().toISOString() 
    });
});

// 2. Automatischer Webhook-Setter
// Aufruf über: https://deine-url.onrender.com/setWebhook
server.get('/setWebhook', async (req, res) => {
  const bot = require('./bot'); // Lokal importieren um Zyklen zu vermeiden
  const url = `${process.env.PUBLIC_URL}/telegram`;
  
  if (!process.env.PUBLIC_URL) {
    return res.status(400).send("Fehler: PUBLIC_URL in den Umgebungsvariablen fehlt!");
  }

  try {
    await bot.telegram.setWebhook(url);
    res.send(`✅ Webhook erfolgreich gesetzt auf: ${url}`);
  } catch (e) {
    console.error("Webhook Error:", e.message);
    res.status(500).send(`❌ Fehler beim Setzen des Webhooks: ${e.message}`);
  }
});

// WICHTIG: Wir definieren hier KEIN server.post('/telegram').
// Das macht bereits deine index.js, um die Kontrolle zentral zu behalten.

module.exports = server;
