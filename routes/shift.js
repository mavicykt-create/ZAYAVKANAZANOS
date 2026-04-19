const express = require('express');
const { getDB } = require('../services/database');
const { requireAuth, requireAdmin } = require('../middleware/auth');
const router = express.Router();

// Получить текущее время в Якутске (UTC+9)
function getYakutskTime() {
  const now = new Date();
  // Якутск UTC+9
  const yakutskOffset = 9 * 60; // минуты
  const localOffset = now.getTimezoneOffset(); // минуты от UTC
  const diff = yakutskOffset + localOffset;
  const yakutskTime = new Date(now.getTime() + diff * 60 * 1000);
  return yakutskTime;
}

function formatYakutskTime(date) {
  const h = String(date.getHours()).padStart(2, '0');
  const m = String(date.getMinutes()).padStart(2, '0');
  return `${h}:${m}`;
}

// Начало смены
router.post('/start', requireAuth, (req, res) => {
  const userId = req.session.userId;
  const db = getDB();

  // Получаем имя пользователя
  const user = db.prepare('SELECT login FROM users WHERE id = ?').get(userId);
  if (!user) {
    return res.status(404).json({ error: 'Пользователь не найден' });
  }

  // Получаем время в Якутске
  const yakutskTime = getYakutskTime();
  const timeStr = formatYakutskTime(yakutskTime);
  const dateStr = yakutskTime.toISOString().split('T')[0];

  // Определяем статус: до 9:15 - on_time, после - late
  const hours = yakutskTime.getHours();
  const minutes = yakutskTime.getMinutes();
  const totalMinutes = hours * 60 + minutes;
  const limitMinutes = 9 * 60 + 15; // 9:15

  let status = 'on_time';
  if (totalMinutes > limitMinutes) {
    status = 'late';
  }

  // Проверяем есть ли уже запись на сегодня
  const existing = db.prepare(
    'SELECT id FROM shift_start WHERE user_id = ? AND date = ?'
  ).get(userId, dateStr);

  if (existing) {
    return res.status(400).json({ 
      error: 'Вы уже отметили начало смены сегодня',
      startTime: timeStr,
      status
    });
  }

  // Создаем запись
  db.prepare(`
    INSERT INTO shift_start (user_id, user_name, start_time_yakutsk, status, date)
    VALUES (?, ?, ?, ?, ?)
  `).run(userId, user.login, timeStr, status, dateStr);

  res.json({
    success: true,
    startTime: timeStr,
    status,
    statusText: status === 'on_time' ? 'Вовремя' : 'Опоздание'
  });
});

// Получить мою смену на сегодня
router.get('/my-today', requireAuth, (req, res) => {
  const userId = req.session.userId;
  const db = getDB();

  const yakutskTime = getYakutskTime();
  const dateStr = yakutskTime.toISOString().split('T')[0];

  const shift = db.prepare(`
    SELECT * FROM shift_start 
    WHERE user_id = ? AND date = ?
  `).get(userId, dateStr);

  if (!shift) {
    // Проверяем, не прошло ли уже 2 часа с 9:15
    const hours = yakutskTime.getHours();
    const minutes = yakutskTime.getMinutes();
    const totalMinutes = hours * 60 + minutes;
    const noShowLimit = 9 * 60 + 15 + 120; // 11:15

    if (totalMinutes > noShowLimit) {
      return res.json({ status: 'no_show', message: 'Не выход' });
    }

    return res.json({ status: 'not_started' });
  }

  res.json(shift);
});

// Получить график всех сотрудников (админ)
router.get('/schedule', requireAuth, requireAdmin, (req, res) => {
  const db = getDB();
  const { date } = req.query;

  const queryDate = date || getYakutskTime().toISOString().split('T')[0];

  const shifts = db.prepare(`
    SELECT 
      ss.id,
      ss.user_id,
      ss.user_name,
      ss.start_time_yakutsk,
      ss.status,
      ss.date,
      CASE 
        WHEN ss.status = 'on_time' THEN 'Вовремя'
        WHEN ss.status = 'late' THEN 'Опоздание'
        ELSE 'Неизвестно'
      END as status_text
    FROM shift_start ss
    WHERE ss.date = ?
    ORDER BY ss.start_time_yakutsk
  `).all(queryDate);

  // Находим сотрудников без отметки
  const allUsers = db.prepare(`
    SELECT id, login FROM users 
    WHERE is_active = 1 AND role = 'staff'
  `).all();

  const presentUserIds = new Set(shifts.map(s => s.user_id));
  const absentUsers = allUsers.filter(u => !presentUserIds.has(u.id));

  res.json({
    date: queryDate,
    shifts,
    absent: absentUsers.map(u => ({
      user_id: u.id,
      user_name: u.login,
      status: 'no_show',
      status_text: 'Не выход'
    }))
  });
});

// Получить историю смен за период (админ)
router.get('/history', requireAuth, requireAdmin, (req, res) => {
  const db = getDB();
  const { startDate, endDate } = req.query;

  const shifts = db.prepare(`
    SELECT 
      ss.*,
      CASE 
        WHEN ss.status = 'on_time' THEN 'Вовремя'
        WHEN ss.status = 'late' THEN 'Опоздание'
        WHEN ss.status = 'no_show' THEN 'Не выход'
        ELSE 'Неизвестно'
      END as status_text
    FROM shift_start ss
    WHERE ss.date BETWEEN ? AND ?
    ORDER BY ss.date DESC, ss.start_time_yakutsk
  `).all(startDate, endDate);

  res.json(shifts);
});

module.exports = router;
