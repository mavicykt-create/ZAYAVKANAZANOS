export function nowIso() {
  return new Date().toISOString();
}
export function weekDates() {
  const now = new Date();
  const day = (now.getDay() + 6) % 7; // Mon=0
  const monday = new Date(now);
  monday.setHours(0,0,0,0);
  monday.setDate(now.getDate() - day);
  return Array.from({ length: 7 }).map((_, idx) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + idx);
    return d.toISOString().slice(0, 10);
  });
}
