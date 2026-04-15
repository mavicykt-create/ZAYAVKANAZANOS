import { all, get, run } from '../../db.js';
import { addDays, nowTs, startOfWeek } from '../utils/format.js';
import { HttpError } from '../utils/http.js';

export async function getWeeklyCalendar(anchorDate = null) {
  const start = startOfWeek(anchorDate || new Date().toISOString().slice(0, 10));
  const end = addDays(start, 6);
  const rows = await all(
    `SELECT id, date, title, text FROM weekly_calendar_items
     WHERE date >= ? AND date <= ?
     ORDER BY date ASC, id ASC`,
    [start, end],
  );
  const days = [];
  for (let i = 0; i < 7; i += 1) {
    const date = addDays(start, i);
    days.push({
      date,
      items: rows
        .filter((item) => item.date === date)
        .map((item) => ({
          id: Number(item.id),
          title: item.title,
          text: item.text,
        })),
    });
  }
  return { startDate: start, endDate: end, days };
}

export async function createCalendarItem(userId, payload) {
  const date = String(payload.date || '').trim();
  const title = String(payload.title || '').trim();
  const text = String(payload.text || '').trim();
  if (!date || !title) throw new HttpError(400, 'Дата и заголовок обязательны');
  const ts = nowTs();
  const result = await run(
    `INSERT INTO weekly_calendar_items (date, title, text, created_by, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [date, title, text, Number(userId), ts, ts],
  );
  return Number(result.lastID);
}

export async function updateCalendarItem(itemId, payload) {
  const row = await get(`SELECT id FROM weekly_calendar_items WHERE id = ?`, [Number(itemId)]);
  if (!row) throw new HttpError(404, 'Запись не найдена');
  const date = payload.date !== undefined ? String(payload.date || '').trim() : null;
  const title = payload.title !== undefined ? String(payload.title || '').trim() : null;
  const text = payload.text !== undefined ? String(payload.text || '').trim() : null;
  await run(
    `UPDATE weekly_calendar_items
     SET date = COALESCE(?, date),
         title = COALESCE(?, title),
         text = COALESCE(?, text),
         updated_at = ?
     WHERE id = ?`,
    [date || null, title || null, text || null, nowTs(), Number(itemId)],
  );
}

export async function deleteCalendarItem(itemId) {
  await run(`DELETE FROM weekly_calendar_items WHERE id = ?`, [Number(itemId)]);
}
