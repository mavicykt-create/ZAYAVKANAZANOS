import fs from 'fs';
import path from 'path';
import initSqlJs from 'sql.js';
import { env } from '../config/env.js';

let dbWrapperPromise;

function normalizeParams(params = []) {
  return Array.isArray(params) ? params : [params];
}

class SqlJsWrapper {
  constructor(db, filePath) {
    this.db = db;
    this.filePath = filePath;
  }

  persist() {
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
    const data = this.db.export();
    fs.writeFileSync(this.filePath, Buffer.from(data));
  }

  async exec(sql) {
    this.db.exec(sql);
    this.persist();
  }

  async run(sql, params = []) {
    const stmt = this.db.prepare(sql);
    stmt.bind(normalizeParams(params));
    while (stmt.step()) {
      // exhaust
    }
    stmt.free();
    const result = this.db.exec('SELECT last_insert_rowid() AS id, changes() AS changes');
    this.persist();
    const row = result?.[0]?.values?.[0] || [0, 0];
    return { lastID: row[0], changes: row[1] };
  }

  async get(sql, params = []) {
    const stmt = this.db.prepare(sql);
    stmt.bind(normalizeParams(params));
    const row = stmt.step() ? stmt.getAsObject() : undefined;
    stmt.free();
    return row;
  }

  async all(sql, params = []) {
    const stmt = this.db.prepare(sql);
    stmt.bind(normalizeParams(params));
    const rows = [];
    while (stmt.step()) rows.push(stmt.getAsObject());
    stmt.free();
    return rows;
  }
}

export async function getDb() {
  if (!dbWrapperPromise) {
    dbWrapperPromise = (async () => {
      fs.mkdirSync(path.dirname(env.dbPath), { recursive: true });
      const SQL = await initSqlJs();
      const fileBuffer = fs.existsSync(env.dbPath) ? fs.readFileSync(env.dbPath) : null;
      const db = fileBuffer ? new SQL.Database(fileBuffer) : new SQL.Database();
      return new SqlJsWrapper(db, env.dbPath);
    })();
  }
  return dbWrapperPromise;
}
