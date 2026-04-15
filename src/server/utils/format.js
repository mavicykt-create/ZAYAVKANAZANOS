export function cleanText(value) {
  return String(value ?? '').trim();
}

export function first(nodeValue, fallback = '') {
  if (Array.isArray(nodeValue)) return cleanText(nodeValue[0] ?? fallback);
  return cleanText(nodeValue ?? fallback);
}

export function nowTs() {
  return Date.now();
}

export function dayKeyFromTimestamp(ts) {
  const date = new Date(Number(ts));
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function monthKeyFromTimestamp(ts) {
  return dayKeyFromTimestamp(ts).slice(0, 7);
}

export function addDays(dateString, plusDays) {
  const date = new Date(`${dateString}T00:00:00`);
  date.setDate(date.getDate() + Number(plusDays));
  return date.toISOString().slice(0, 10);
}

export function startOfWeek(dateString) {
  const date = new Date(`${dateString}T00:00:00`);
  const day = date.getDay();
  const shift = day === 0 ? -6 : 1 - day;
  date.setDate(date.getDate() + shift);
  return date.toISOString().slice(0, 10);
}
