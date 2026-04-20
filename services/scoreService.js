const { getDB } = require('./database');

// ===== ЕДИНАЯ ТОЧКА НАЧИСЛЕНИЯ БАЛЛОВ =====
// Использование: awardScore(userId, 'carry_category', { entityId: categoryId })
// userId — кто выполнил
// actionType — тип действия (должен быть в score_weights)
// context — { entityId, label, meta } необязательно

function awardScore(userId, actionType, context = {}) {
  const db = getDB();
  const { entityId, label, meta } = context;
  const today = new Date().toISOString().split('T')[0];

  // Cleanup: удаляем старые записи (старше 30 дней) ~1 раз в день
  db.prepare("DELETE FROM score_dedup WHERE date < date('now', '-30 days')").run();
  db.prepare("DELETE FROM score_daily_caps WHERE date < date('now', '-30 days')").run();

  // 1. Получаем настройки веса
  const weight = db.prepare(
    'SELECT * FROM score_weights WHERE action_type = ? AND is_active = 1'
  ).get(actionType);
  if (!weight) return { awarded: false, reason: 'no_weight' };

  // 2. Защита от накрутки — дедупликация по entityId или user+date
  const dedupKey = entityId ? `${entityId}` : `${actionType}`;
  const exists = db.prepare(
    'SELECT 1 FROM score_dedup WHERE user_id = ? AND action_type = ? AND entity_id = ? AND date = ?'
  ).get(userId, actionType, dedupKey, today);
  if (exists) return { awarded: false, reason: 'duplicate' };

  // 3. Дневной лимит
  if (weight.daily_limit > 0) {
    const cap = db.prepare(
      'SELECT count FROM score_daily_caps WHERE user_id = ? AND action_type = ? AND date = ?'
    ).get(userId, actionType, today);
    if (cap && cap.count >= weight.daily_limit) {
      return { awarded: false, reason: 'daily_limit', rawPoints: weight.points };
    }
  }

  // 4. Получаем имя пользователя
  const user = db.prepare('SELECT login FROM users WHERE id = ?').get(userId);
  const userName = user ? user.login : 'unknown';

  // 5. Стрики — только для положительных баллов и НЕ для штрафов дисциплины
  let multiplier = 1.0;
  let streakDays = 0;
  
  if (weight.points > 0 && weight.basket !== 'discipline') {
    const streak = db.prepare(
      'SELECT consecutive_on_time_days FROM score_streaks WHERE user_id = ?'
    ).get(userId);
    streakDays = streak ? streak.consecutive_on_time_days : 0;
    if (streakDays >= 10) multiplier = 1.25;
    else if (streakDays >= 5) multiplier = 1.1;
  }

  // Штрафы дисциплины НЕ умножаются и сбрасывают стрики
  if (weight.basket === 'discipline' && weight.points < 0) {
    multiplier = 1.0;
  }

  const finalPoints = Math.round(weight.points * multiplier);

  // 6. Записываем дедупликацию
  if (entityId) {
    db.prepare(
      'INSERT OR IGNORE INTO score_dedup (user_id, action_type, entity_id, date) VALUES (?,?,?,?)'
    ).run(userId, actionType, `${entityId}`, today);
  }

  // 7. Обновляем дневной счётчик
  if (weight.daily_limit > 0) {
    db.prepare(`
      INSERT INTO score_daily_caps (user_id, action_type, count, date)
      VALUES (?, ?, 1, ?)
      ON CONFLICT(user_id, action_type, date) DO UPDATE SET count = count + 1
    `).run(userId, actionType, today);
  }

  // 8. Сохраняем историю
  const historyLabel = label || weight.label;
  db.prepare(`
    INSERT INTO score_history (user_id, user_name, action_type, basket, label, points, raw_points, streak_multiplier, context)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(userId, userName, actionType, weight.basket, historyLabel, finalPoints, weight.points, multiplier, meta ? JSON.stringify(meta) : null);

  // 9. Обновляем стрики (только для дисциплины — начало смены)
  if (actionType === 'shift_on_time') {
    incrementStreak(db, userId, today);
  } else if (actionType === 'shift_late' || actionType === 'shift_no_show') {
    resetStreak(db, userId);
  }

  return {
    awarded: true,
    points: finalPoints,
    rawPoints: weight.points,
    multiplier,
    streakDays,
    basket: weight.basket
  };
}

// ===== УПРАВЛЕНИЕ СТРИКАМИ =====

function incrementStreak(db, userId, today) {
  const existing = db.prepare('SELECT * FROM score_streaks WHERE user_id = ?').get(userId);
  if (!existing) {
    db.prepare(`
      INSERT INTO score_streaks (user_id, consecutive_on_time_days, last_shift_date, total_multiplier)
      VALUES (?, 1, ?, 1.0)
    `).run(userId, today);
    return;
  }

  // Проверяем что не дублируем тот же день
  if (existing.last_shift_date === today) return;

  // Проверяем что следующий день (без пропусков)
  const lastDate = existing.last_shift_date ? new Date(existing.last_shift_date) : null;
  const todayDate = new Date(today);
  const diffDays = lastDate ? Math.floor((todayDate - lastDate) / (1000 * 60 * 60 * 24)) : 999;

  if (diffDays === 1) {
    // Следующий день — увеличиваем стрик
    const newStreak = existing.consecutive_on_time_days + 1;
    let newMultiplier = 1.0;
    if (newStreak >= 10) newMultiplier = 1.25;
    else if (newStreak >= 5) newMultiplier = 1.1;

    db.prepare(`
      UPDATE score_streaks
      SET consecutive_on_time_days = ?, last_shift_date = ?, total_multiplier = ?, updated_at = CURRENT_TIMESTAMP
      WHERE user_id = ?
    `).run(newStreak, today, newMultiplier, userId);
  } else {
    // Пропуск или первый раз — сбрасываем в 1
    db.prepare(`
      UPDATE score_streaks
      SET consecutive_on_time_days = 1, last_shift_date = ?, total_multiplier = 1.0, updated_at = CURRENT_TIMESTAMP
      WHERE user_id = ?
    `).run(today, userId);
  }
}

function resetStreak(db, userId) {
  db.prepare(`
    INSERT INTO score_streaks (user_id, consecutive_on_time_days, last_shift_date, total_multiplier)
    VALUES (?, 0, NULL, 1.0)
    ON CONFLICT(user_id) DO UPDATE SET
    consecutive_on_time_days = 0, last_shift_date = NULL, total_multiplier = 1.0, updated_at = CURRENT_TIMESTAMP
  `).run(userId);
}

// ===== АДМИН: РЕЙТИНГ =====

function getScoreboard(startDate, endDate) {
  const db = getDB();

  // Суммы по корзинам для каждого пользователя
  const rows = db.prepare(`
    SELECT
      sh.user_id,
      sh.user_name,
      sh.basket,
      SUM(sh.points) as total_points,
      SUM(CASE WHEN sh.points > 0 THEN sh.points ELSE 0 END) as positive_points,
      COUNT(*) as action_count
    FROM score_history sh
    WHERE date(sh.created_at) BETWEEN ? AND ?
    GROUP BY sh.user_id, sh.basket
    ORDER BY sh.user_id, sh.basket
  `).all(startDate, endDate);

  // Общие суммы
  const totals = db.prepare(`
    SELECT
      sh.user_id,
      sh.user_name,
      SUM(sh.points) as grand_total,
      SUM(CASE WHEN sh.points > 0 THEN sh.points ELSE 0 END) as total_positive,
      SUM(CASE WHEN sh.points < 0 THEN sh.points ELSE 0 END) as total_negative,
      COUNT(*) as total_actions
    FROM score_history sh
    WHERE date(sh.created_at) BETWEEN ? AND ?
    GROUP BY sh.user_id
    ORDER BY grand_total DESC
  `).all(startDate, endDate);

  // Стрики
  const streaks = db.prepare('SELECT * FROM score_streaks').all();

  return { rows, totals, streaks };
}

function getUserHistory(userId, limit = 100) {
  const db = getDB();
  return db.prepare(`
    SELECT * FROM score_history
    WHERE user_id = ?
    ORDER BY created_at DESC
    LIMIT ?
  `).all(userId, limit);
}

function getWeights() {
  const db = getDB();
  return db.prepare('SELECT * FROM score_weights ORDER BY basket, action_type').all();
}

function updateWeight(id, updates) {
  const db = getDB();
  const { points, daily_limit, is_active, label } = updates;
  db.prepare(`
    UPDATE score_weights
    SET points = COALESCE(?, points),
        daily_limit = COALESCE(?, daily_limit),
        is_active = COALESCE(?, is_active),
        label = COALESCE(?, label),
        updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(points, daily_limit, is_active, label, id);
}

module.exports = {
  awardScore,
  getScoreboard,
  getUserHistory,
  getWeights,
  updateWeight
};
