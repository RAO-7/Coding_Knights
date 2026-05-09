require('dotenv').config();
const http = require('http');
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');

const { createWebSocketServer } = require('./websocket/wsServer');
const { startSimulator } = require('./simulator/engine');
const { initDatabase } = require('./playback/store');
const apiRouter = require('./api/routes');

const PORT = process.env.PORT || 3001;

async function bootstrap() {
  const app = express();

  app.use(helmet({ contentSecurityPolicy: false }));
  app.use(cors({ origin: '*' }));
  app.use(morgan('dev'));
  app.use(express.json());

  app.use('/api', apiRouter);

  app.get('/health', (req, res) => {
    res.json({ status: 'ok', time: new Date().toISOString() });
  });

  const server = http.createServer(app);

  initDatabase();

  const wss = createWebSocketServer(server);

  startSimulator(wss);

  server.listen(PORT, () => {
    console.log(`\n🚢  Fleet Command Backend running on port ${PORT}`);
    console.log(`   REST  → http://localhost:${PORT}/api`);
    console.log(`   WS    → ws://localhost:${PORT}`);
    console.log(`   Tick  → ${process.env.TICK_RATE_MS || 1000}ms\n`);
  });
}

bootstrap().catch((err) => {
  console.error('Fatal startup error:', err);
  process.exit(1);
});