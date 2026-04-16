export async function api(path, options = {}) {
  const response = await fetch(`/api${path}`, {
    method: options.method || 'GET',
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    credentials: 'include',
    body: options.body ? JSON.stringify(options.body) : undefined
  });

  const data = await response.json().catch(() => ({ ok: false, error: 'Ошибка ответа сервера' }));
  if (!response.ok || data.ok === false) {
    throw new Error(data.error || `Ошибка ${response.status}`);
  }
  return data;
}
