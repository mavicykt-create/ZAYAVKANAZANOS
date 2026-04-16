import { initDb } from '../db/schema.js';
await initDb();
console.log('Database initialized');
