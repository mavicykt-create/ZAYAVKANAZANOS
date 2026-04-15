import { run } from '../../db.js';
import { scoreFor } from '../constants/scores.js';
import { dayKeyFromTimestamp, nowTs } from '../utils/format.js';

export async function logUserAction(userId, action, options = {}) {
  const ts = nowTs();
  const payload = options.payload || {};
  const scoreDelta = options.scoreDelta !== undefined ? Number(options.scoreDelta) : scoreFor(action);
  const moduleName = options.module || '';
  const entityId = options.entityId !== undefined ? String(options.entityId) : '';

  await run(
    `INSERT INTO user_actions_log (user_id, action, module, entity_id, payload_json, score_delta, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [Number(userId), action, moduleName, entityId, JSON.stringify(payload), scoreDelta, ts],
  );

  const dayKey = dayKeyFromTimestamp(ts);
  await run(
    `INSERT INTO user_daily_stats (user_id, date, actions_count, work_score, updated_at)
     VALUES (?, ?, 1, ?, ?)
     ON CONFLICT(user_id, date) DO UPDATE SET
       actions_count = actions_count + 1,
       work_score = work_score + excluded.work_score,
       updated_at = excluded.updated_at`,
    [Number(userId), dayKey, scoreDelta, ts],
  );
}
