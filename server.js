import { startServer } from './src/server/app.js';

startServer().catch((error) => {
  console.error('Startup error:', error);
  process.exit(1);
});
