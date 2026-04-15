import { all } from '../../db.js';

function monthRange(month) {
  const key = month || new Date().toISOString().slice(0, 7);
  const start = `${key}-01`;
  const date = new Date(`${start}T00:00:00`);
  date.setMonth(date.getMonth() + 1);
  const nextMonthStart = date.toISOString().slice(0, 10);
  return { month: key, start, nextMonthStart };
}

export async function getMonthlyRating(month) {
  const range = monthRange(month);
  const rows = await all(
    `SELECT u.id AS userId, u.login,
            COALESCE(SUM(s.actions_count), 0) AS actionsCount,
            COALESCE(SUM(s.work_score), 0) AS workScore
     FROM users u
     LEFT JOIN user_daily_stats s
       ON s.user_id = u.id
      AND s.date >= ?
      AND s.date < ?
     GROUP BY u.id, u.login
     ORDER BY workScore DESC, actionsCount DESC, u.login ASC`,
    [range.start, range.nextMonthStart],
  );
  return {
    month: range.month,
    items: rows.map((item, index) => ({
      rank: index + 1,
      userId: Number(item.userId),
      login: item.login,
      actionsCount: Number(item.actionsCount || 0),
      workScore: Number(item.workScore || 0),
    })),
  };
}

export async function getUserStats(userId, month) {
  const range = monthRange(month);
  const rows = await all(
    `SELECT action, COUNT(*) AS cnt, COALESCE(SUM(score_delta), 0) AS score
     FROM user_actions_log
     WHERE user_id = ? AND created_at >= strftime('%s', ? || 'T00:00:00') * 1000
       AND created_at < strftime('%s', ? || 'T00:00:00') * 1000
     GROUP BY action
     ORDER BY cnt DESC, action ASC`,
    [Number(userId), range.start, range.nextMonthStart],
  );
  return {
    month: range.month,
    userId: Number(userId),
    actions: rows.map((item) => ({
      action: item.action,
      count: Number(item.cnt || 0),
      score: Number(item.score || 0),
    })),
  };
}
