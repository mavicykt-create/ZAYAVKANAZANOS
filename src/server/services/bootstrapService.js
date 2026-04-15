import { get, run } from '../../db.js';
import { config } from '../config.js';
import { FIXED_CATEGORIES } from '../constants/categories.js';
import { hashPassword } from './authService.js';
import { ensureDefaultAppState } from './appStateService.js';
import { nowTs } from '../utils/format.js';

export async function seedCategories() {
  for (const category of FIXED_CATEGORIES) {
    await run(
      `INSERT OR IGNORE INTO catalog_categories (id, name, sort_order) VALUES (?, ?, ?)`,
      [category.id, category.name, category.sortOrder],
    );
  }
}

export async function seedUsers() {
  const defaults = [
    { login: config.defaultAdminLogin, password: config.defaultAdminPassword, role: 'admin' },
    { login: config.defaultUserLogin, password: config.defaultUserPassword, role: 'staff' },
  ];
  for (const item of defaults) {
    const exists = await get(`SELECT id FROM users WHERE login = ?`, [item.login]);
    if (exists) continue;
    const ts = nowTs();
    await run(
      `INSERT INTO users (login, password_hash, role, is_active, last_login_at, created_at, updated_at)
       VALUES (?, ?, ?, 1, NULL, ?, ?)`,
      [item.login, hashPassword(item.password), item.role, ts, ts],
    );
  }
}

export async function seedDefaultState() {
  await ensureDefaultAppState({
    catalog_synced_at: '',
    sync_running: '0',
    sync_progress: '0',
    sync_stage: 'idle',
    sync_message: '',
    sync_last_started_at: '',
    sync_last_finished_at: '',
    sync_total_offers: '0',
    sync_processed_offers: '0',
  });
}
