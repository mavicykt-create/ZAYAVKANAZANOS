import { initDb } from '../db/schema.js';
import { runCatalogSync } from '../services/syncService.js';

await initDb();
console.log(await runCatalogSync());
