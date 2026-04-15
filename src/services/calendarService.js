import { getDb } from '../db/connection.js';
import { weekDates } from '../utils/date.js';

export async function getWeekCalendar() {
  const db = await getDb();
  const dates = weekDates();
  const placeholders = dates.map(() => '?').join(',');
  const items = await db.all(
    `SELECT * FROM weekly_calendar_items WHERE date IN (${placeholders}) ORDER BY date ASC, id ASC`,
    dates
  );
  return dates.map((date) => ({ date, items: items.filter((item) => item.date === date) }));
}

export async function saveCalendarItem({ id, date, title, text }) {
  const db = await getDb();
  if (id) {
    await db.run(
      'UPDATE weekly_calendar_items SET date = ?, title = ?, text = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [date, title, text, id]
    );
    return db.get('SELECT * FROM weekly_calendar_items WHERE id = ?', [id]);
  }
  const result = await db.run(
    'INSERT INTO weekly_calendar_items (date, title, text) VALUES (?, ?, ?)',
    [date, title, text]
  );
  return db.get('SELECT * FROM weekly_calendar_items WHERE id = ?', [result.lastID]);
}

export async function deleteCalendarItem(id) {
  const db = await getDb();
  await db.run('DELETE FROM weekly_calendar_items WHERE id = ?', [id]);
}
