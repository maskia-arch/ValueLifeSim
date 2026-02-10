require('dotenv').config();
const server = require('./src/server');
const config = require('./src/config');

const PORT = config.port;

server.listen(PORT, () => {
  console.log(`ValueLifeSim v${config.version} online on port ${PORT}`);
});
