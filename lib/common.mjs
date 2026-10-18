const limits = new Map();
export function reply(res, status, body) {
  res.setHeader('Cache-Control', 'no-store');
  return res.status(status).json(body);
}
export function guard(req, res) {
  if (req.method !== 'POST') { reply(res, 405, {error: 'POST required'}); return false; }
  const origin = req.headers.origin;
  if (origin) {
    try { if (new URL(origin).host !== req.headers.host) throw Error(); }
    catch { reply(res, 403, {error: 'Origin rejected'}); return false; }
  }
  const key = req.socket?.remoteAddress || 'instance';
  const now = Date.now();
  for (const [id, entry] of limits) if (entry.until <= now) limits.delete(id);
  if (limits.size >= 1000 && !limits.has(key)) { reply(res, 429, {error: 'Too many requests. Try again in a minute.'}); return false; }
  const entry = limits.get(key) || {count: 0, until: now + 60000};
  limits.set(key, entry);
  if (++entry.count > 20) { res.setHeader('Retry-After', '60'); reply(res, 429, {error: 'Request limit reached. Wait one minute, then retry.'}); return false; }
  return true;
}
export async function upstream(url, options = {}) {
  const timeout = AbortSignal.timeout(18000);
  const signal = options.signal ? AbortSignal.any([options.signal, timeout]) : timeout;
  const response = await fetch(url, {...options, signal});
  if (!response.ok) throw new Error(`Provider returned ${response.status}`);
  return response.json();
}
