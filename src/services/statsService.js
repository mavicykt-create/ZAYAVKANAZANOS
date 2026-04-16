import { getDb } from '../db/connection.js';
import { todayIso } from '../utils/date.js';

const SCORES = {
  complete_category: 10,
  increment: 1,
  decrement: 1,
  complete_price_page: 8,
  toggle_problem: 1,
  toggle_price: 1,
  print: 2,
  complete_order: 10,
  hide_product_check: 1,
  issue_penalty: -5
};

export async function logAction({ userId = null, action, module, entityId = null, payload = null }) {
  const db = await getDb();
  const scoreDelta = SCORES[action] ?? 0;
  await db.run(
    `INSERT INTO user_actions_log (user_id, action, module, entity_id, payload_json, score_delta)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [userId, action, module, entityId, payload ? JSON.stringify(payload) : null, scoreDelta]
  );

  if (userId) {
    const statDate = todayIso();
    await db.run(
      `INSERT INTO user_daily_stats (user_id, stat_date, work_score, actions_count)
       VALUES (?, ?, ?, 1)
       ON CONFLICT(user_id, stat_date)
       DO UPDATE SET
         work_score = work_score + excluded.work_score,
         actions_count = actions_count + 1`,
      [userId, statDate, scoreDelta]
    );
  }
}

export async function getMonthlyRating() {
  const db = await getDb();
  return db.all(`
    SELECT u.login, SUM(s.work_score) AS work_score, SUM(s.actions_count) AS actions_count
    FROM user_daily_stats s
    JOIN users u ON u.id = s.user_id
    WHERE substr(s.stat_date, 1, 7) = substr(date('now'), 1, 7)
    GROUP BY s.user_id
    ORDER BY work_score DESC, actions_count DESC, u.login ASC
  `);
}
