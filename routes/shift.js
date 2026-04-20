const express = require('express');
const { getDB } = require('../services/database');
const { requireAuth, requireAdmin } = require('../middleware/auth');
const router = express.Router();

// Получить текущее время в Якутске (UTC+9)
function getYakutskTime() {
  const now = new Date();
  // Якутск UTC+9 - используем явное смещение
  const yakutskOffset = 9 * 60; // минуты от UTC
  const localOffset = now.getTimezoneOffset(); // минуты от UTC (может быть отрицательным)
  const diff = yakutskOffset + localOffset;
  const yakutskTime = new Date(now.getTime() + diff * 60 * 1000);
  return yakutskTime;
}

function formatYakutskTime(date) {
  const h = String(date.getHours()).padStart(2, '0');
  const m = String(date.getMinutes()).padStart(2, '0');
  return `${h}:${m}`;
}

function getYakutskDateString(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

// Проверить, является ли день выходным (воскресенье или праздник)
function isDayOff(date) {
  const db = getDB();
  const dateStr = getYakutskDateString(date);
  
  // Воскресенье = 0
  if (date.getDay() === 0) return { isOff: true, reason: 'Воскресенье' };
  
  // Проверяем праздники
  const holiday = db.prepare('SELECT * FROM holidays WHERE date = ?').get(dateStr);
  if (holiday) return { isOff: true, reason: holiday.name };
  
  return { isOff: false, reason: null };
}

// Начало смены
router.post('/start', requireAuth, (req, res) => {
  const userId = req.session.userId;
  const db = getDB();

  // Получаем время в Якутске
  const yakutskTime = getYakutskTime();
  const timeStr = formatYakutskTime(yakutskTime);
  const dateStr = getYakutskDateString(yakutskTime);

  // Проверяем выходной
  const dayOff = isDayOff(yakutskTime);
  if (dayOff.isOff) {
    return res.status(400).json({ 
      error: `Сегодня выходной: ${dayOff.reason}`,
      isDayOff: true,
      reason: dayOff.reason
    });
  }

  // Получаем имя пользователя
  const user = db.prepare('SELECT login FROM users WHERE id = ?').get(userId);
  if (!user) {
    return res.status(404).json({ error: 'Пользователь не найден' });
  }

  // Определяем статус
  const hours = yakutskTime.getHours();
  const minutes = yakutskTime.getMinutes();
  const totalMinutes = hours * 60 + minutes;
  
  const lateLimit = 9 * 60 + 20; // 9:20
  const noShowLimit = 12 * 60;   // 12:00
  const resetLimit = 17 * 60;    // 17:00

  // Если после 17:00 - смена обнуляется (новый день по сути)
  if (totalMinutes >= resetLimit) {
    return res.status(400).json({ 
      error: 'Смена закрыта (после 17:00). Новая смена начнется завтра.',
      isReset: true
    });
  }

  let status = 'on_time';
  if (totalMinutes > lateLimit && totalMinutes <= noShowLimit) {
    status = 'late';
  } else if (totalMinutes > noShowLimit) {
    status = 'no_show';
  }

  // Проверяем есть ли уже запись на сегодня
  const existing = db.prepare(
    'SELECT id, status FROM shift_start WHERE user_id = ? AND date = ?'
  ).get(userId, dateStr);

  if (existing) {
    return res.status(400).json({ 
      error: 'Вы уже отметили начало смены сегодня',
      startTime: timeStr,
      status: existing.status
    });
  }

  // Создаем запись
  db.prepare(`
    INSERT INTO shift_start (user_id, user_name, start_time_yakutsk, status, date)
    VALUES (?, ?, ?, ?, ?)
  `).run(userId, user.login, timeStr, status, dateStr);

  // Начисляем баллы за дисциплину
  const { awardScore } = require('../services/scoreService');
  const scoreResult = awardScore(userId, status === 'on_time' ? 'shift_on_time' : status === 'late' ? 'shift_late' : 'shift_no_show');

  res.json({
    success: true,
    startTime: timeStr,
    status,
    statusText: status === 'on_time' ? 'Вовремя' : status === 'late' ? 'Опоздание' : 'Не выход'
  });
});

// Получить мою смену на сегодня
router.get('/my-today', requireAuth, (req, res) => {
  const userId = req.session.userId;
  const db = getDB();

  const yakutskTime = getYakutskTime();
  const dateStr = getYakutskDateString(yakutskTime);

  // Проверяем выходной
  const dayOff = isDayOff(yakutskTime);
  if (dayOff.isOff) {
    return res.json({ status: 'day_off', reason: dayOff.reason, message: `Сегодня выходной: ${dayOff.reason}` });
  }

  const shift = db.prepare(`
    SELECT * FROM shift_start 
    WHERE user_id = ? AND date = ?
  `).get(userId, dateStr);

  if (!shift) {
    const hours = yakutskTime.getHours();
    const minutes = yakutskTime.getMinutes();
    const totalMinutes = hours * 60 + minutes;
    const resetLimit = 17 * 60; // 17:00
    
    // Если после 17:00 - смена обнуляется
    if (totalMinutes >= resetLimit) {
      return res.json({ status: 'reset', message: 'Смена закрыта (после 17:00)' });
    }
    
    // Проверяем не выход (после 12:00)
    const noShowLimit = 12 * 60; // 12:00
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

  const yakutskTime = getYakutskTime();
  const queryDate = date || getYakutskDateString(yakutskTime);

  // Проверяем выходной
  const checkDate = date ? new Date(date + 'T00:00:00') : yakutskTime;
  const dayOff = isDayOff(checkDate);

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
        WHEN ss.status = 'no_show' THEN 'Не выход'
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
    isDayOff: dayOff.isOff,
    dayOffReason: dayOff.reason,
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
        WHEN ss.status = 'day_off' THEN 'Выходной'
        ELSE 'Неизвестно'
      END as status_text
    FROM shift_start ss
    WHERE ss.date BETWEEN ? AND ?
    ORDER BY ss.date DESC, ss.start_time_yakutsk
  `).all(startDate, endDate);

  res.json(shifts);
});

// ===== АДМИН: Постановка "Не выход" =====
router.post('/set-no-show', requireAuth, requireAdmin, (req, res) => {
  const { userId, date } = req.body;
  const db = getDB();
  const adminId = req.session.userId;

  const user = db.prepare('SELECT login FROM users WHERE id = ?').get(userId);
  if (!user) {
    return res.status(404).json({ error: 'Пользователь не найден' });
  }

  const targetDate = date || getYakutskDateString(getYakutskTime());

  // Удаляем существующую запись если есть
  db.prepare('DELETE FROM shift_start WHERE user_id = ? AND date = ?').run(userId, targetDate);

  // Создаем запись "Не выход"
  db.prepare(`
    INSERT INTO shift_start (user_id, user_name, start_time_yakutsk, status, date)
    VALUES (?, ?, '12:00', 'no_show', ?)
  `).run(userId, user.login, targetDate);

  res.json({ success: true, message: `Установлен "Не выход" для ${user.login} на ${targetDate}` });
});

// ===== АДМИН: Изменение времени отметки =====
router.post('/update-time', requireAuth, requireAdmin, (req, res) => {
  const { userId, date, newTime, newStatus } = req.body;
  const db = getDB();

  if (!userId || !date || !newTime) {
    return res.status(400).json({ error: 'Укажите userId, date и newTime' });
  }

  const user = db.prepare('SELECT login FROM users WHERE id = ?').get(userId);
  if (!user) {
    return res.status(404).json({ error: 'Пользователь не найден' });
  }

  // Парсим новое время
  const [hours, minutes] = newTime.split(':').map(Number);
  const totalMinutes = hours * 60 + minutes;
  const lateLimit = 9 * 60 + 20; // 9:20
  const noShowLimit = 12 * 60;   // 12:00

  let status = newStatus;
  if (!status) {
    if (totalMinutes <= lateLimit) status = 'on_time';
    else if (totalMinutes <= noShowLimit) status = 'late';
    else status = 'no_show';
  }

  // Обновляем или создаем запись
  db.prepare(`
    INSERT OR REPLACE INTO shift_start (user_id, user_name, start_time_yakutsk, status, date)
    VALUES (?, ?, ?, ?, ?)
  `).run(userId, user.login, newTime, status, date);

  res.json({ success: true, message: 'Время обновлено', newTime, status });
});

// ===== ПРАЗДНИЧНЫЕ ДНИ =====

// Получить все праздники
router.get('/holidays', requireAuth, (req, res) => {
  const db = getDB();
  const { year } = req.query;
  
  let query = 'SELECT * FROM holidays';
  let params = [];
  
  if (year) {
    query += ' WHERE date LIKE ?';
    params.push(`${year}%`);
  }
  
  query += ' ORDER BY date';
  const holidays = db.prepare(query).all(...params);
  res.json(holidays);
});

// Добавить праздник (админ)
router.post('/holidays', requireAuth, requireAdmin, (req, res) => {
  const { date, name } = req.body;
  const db = getDB();

  if (!date || !name) {
    return res.status(400).json({ error: 'Укажите дату и название' });
  }

  try {
    const result = db.prepare(`
      INSERT INTO holidays (date, name) VALUES (?, ?)
    `).run(date, name);
    res.json({ id: result.lastInsertRowid, success: true });
  } catch (e) {
    res.status(400).json({ error: 'Эта дата уже добавлена' });
  }
});

// Удалить праздник (админ)
router.delete('/holidays/:id', requireAuth, requireAdmin, (req, res) => {
  const db = getDB();
  db.prepare('DELETE FROM holidays WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

module.exports = router;
