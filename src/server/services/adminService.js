import { all, get, run } from '../../db.js';
import { hashPassword } from './authService.js';
import { clearImageCache } from './imageService.js';
import { nowTs } from '../utils/format.js';
import { getSyncState } from './appStateService.js';
import { getCatalogStats } from './catalogService.js';
import { getLockedPricePages } from './priceCheckService.js';
import { pushSubscribersCount } from './pushService.js';

export async function listUsers() {
  const rows = await all(
    `SELECT id, login, role, is_active AS isActive, last_login_at AS lastLoginAt, created_at AS createdAt, updated_at AS updatedAt
     FROM users
     ORDER BY id ASC`,
  );
  return rows.map((item) => ({
    id: Number(item.id),
    login: item.login,
    role: item.role,
    isActive: Number(item.isActive) === 1,
    lastLoginAt: Number(item.lastLoginAt || 0) || null,
    createdAt: Number(item.createdAt || 0) || null,
    updatedAt: Number(item.updatedAt || 0) || null,
  }));
}

export async function createUser(payload) {
  const login = String(payload.login || '').trim();
  const password = String(payload.password || '').trim();
  const role = payload.role === 'admin' ? 'admin' : 'staff';
  if (!login || !password) throw new Error('Логин и пароль обязательны');
  const exists = await get(`SELECT id FROM users WHERE login = ?`, [login]);
  if (exists) throw new Error('Логин уже существует');
  const ts = nowTs();
  await run(
    `INSERT INTO users (login, password_hash, role, is_active, last_login_at, created_at, updated_at)
     VALUES (?, ?, ?, 1, NULL, ?, ?)`,
    [login, hashPassword(password), role, ts, ts],
  );
}

export async function updateUser(userId, payload) {
  const current = await get(`SELECT id, login, role, is_active AS isActive, password_hash AS passwordHash FROM users WHERE id = ?`, [Number(userId)]);
  if (!current) throw new Error('Пользователь не найден');
  const login = payload.login !== undefined ? String(payload.login || '').trim() : current.login;
  const role = payload.role !== undefined ? (payload.role === 'admin' ? 'admin' : 'staff') : current.role;
  const isActive = payload.isActive !== undefined ? (payload.isActive ? 1 : 0) : Number(current.isActive);
  const passwordHash = payload.password ? hashPassword(String(payload.password)) : current.passwordHash;
  if (!login) throw new Error('Логин не может быть пустым');
  const duplicate = await get(`SELECT id FROM users WHERE login = ? AND id != ?`, [login, Number(userId)]);
  if (duplicate) throw new Error('Логин уже занят');

  await run(
    `UPDATE users
     SET login = ?, role = ?, is_active = ?, password_hash = ?, updated_at = ?
     WHERE id = ?`,
    [login, role, isActive, passwordHash, nowTs(), Number(userId)],
  );
}

export async function toggleUserActive(userId) {
  const row = await get(`SELECT id, is_active AS isActive FROM users WHERE id = ?`, [Number(userId)]);
  if (!row) throw new Error('Пользователь не найден');
  const next = Number(row.isActive) === 1 ? 0 : 1;
  await run(`UPDATE users SET is_active = ?, updated_at = ? WHERE id = ?`, [next, nowTs(), Number(userId)]);
  return next === 1;
}

export async function buildAdminOverview() {
  const [catalogStats, syncState, lockedPages, users, pushSubs] = await Promise.all([
    getCatalogStats(),
    getSyncState(),
    getLockedPricePages(),
    all(`SELECT id, login, last_login_at AS lastLoginAt FROM users WHERE is_active = 1 ORDER BY login ASC`),
    pushSubscribersCount(),
  ]);
  const now = nowTs();
  const onlineUsers = users
    .filter((item) => Number(item.lastLoginAt || 0) > 0 && now - Number(item.lastLoginAt) < 6 * 60 * 60 * 1000)
    .map((item) => ({ id: Number(item.id), login: item.login, lastLoginAt: Number(item.lastLoginAt) }));

  return {
    onlineUsers,
    catalog: catalogStats,
    sync: syncState,
    priceLocks: lockedPages.length,
    pushSubscribers: pushSubs,
  };
}

export async function clearCatalogImageCache() {
  const removed = clearImageCache();
  await run(`UPDATE catalog_products SET cached_image = ''`);
  return removed;
}

export async function listProblemProducts() {
  const rows = await all(
    `SELECT p.id, p.name, p.vendor_code AS vendorCode, c.name AS categoryName
     FROM price_check_items i
     JOIN catalog_products p ON p.id = i.product_id
     JOIN catalog_categories c ON c.id = p.category_id
     WHERE i.problem_flag = 1 OR i.price_flag = 1
     ORDER BY p.name COLLATE NOCASE ASC`,
  );
  return rows.map((item) => ({
    id: Number(item.id),
    name: item.name,
    vendorCode: item.vendorCode,
    categoryName: item.categoryName,
  }));
}
