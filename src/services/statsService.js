import { db } from '../db.js';
import { nowIso } from '../utils/time.js';

const SCORE_MAP = {
  login: 0,
  increment: 1,
  decrement: 1,
  complete_category: 10,
  toggle_problem: 1,
  toggle_price: 1,
  print: 2,
  complete_order: 10,
  product_check_hide: 1,
  price_page_complete: 8
};

export function logAction(userId, actionType, payload = {}) {
  const createdAt = nowIso();
  const statDate = createdAt.slice(0, 10);
  const scoreDelta = SCORE_MAP[actionType] ?? 0;

  db.prepare(`
    INSERT INTO user_actions_log (user_id, action_type, payload_json, score_delta, created_at)
    VALUES (?, ?, ?, ?, ?)
  `).run(userId || null, actionType, JSON.stringify(payload), scoreDelta, createdAt);

  if (!userId) return;

  db.prepare(`
    INSERT INTO user_daily_stats (user_id, stat_date, action_count, work_score)
    VALUES (?, ?, 1, ?)
    ON CONFLICT(user_id, stat_date) DO UPDATE SET
      action_count = action_count + 1,
      work_score = work_score + excluded.work_score
  `).run(userId, statDate, scoreDelta);
}

export function getMonthlyLeaderboard() {
  return db.prepare(`
    SELECT u.id, u.login, COALESCE(SUM(s.work_score), 0) AS score, COALESCE(SUM(s.action_count), 0) AS actions
    FROM users u
    LEFT JOIN user_daily_stats s ON s.user_id = u.id
      AND substr(s.stat_date, 1, 7) = strftime('%Y-%m', 'now')
    WHERE u.is_active = 1
    GROUP BY u.id, u.login
    ORDER BY score DESC, actions DESC, u.login ASC
  `).all();
}
