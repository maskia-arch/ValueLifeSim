const express = require('express');
const bot = require('./bot');

const server = express();
server.use(express.json());

server.post('/telegram', (req, res) => {
  bot.handleUpdate(req.body, res);
});

server.get('/health', (req, res) => res.send({ status: "ok", version: "0.0.1" }));

server.get('/setWebhook', async (req, res) => {
  const url = `${process.env.PUBLIC_URL}/telegram`;
  try {
    await bot.telegram.setWebhook(url);
    res.send(`Webhook set to ${url}`);
  } catch (e) {
    res.status(500).send(e.message);
  }
});

module.exports = server;
