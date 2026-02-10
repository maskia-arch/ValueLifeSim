require('dotenv').config();
const server = require('./src/server');

const PORT = process.env.PORT || 3000;

server.listen(PORT, () => {
  console.log(`ValueLifeSim v0.0.1 online on port ${PORT}`);
});
