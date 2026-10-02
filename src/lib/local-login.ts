const loopback = new Set(['localhost', '127.0.0.1', '[::1]', '::1']);
export function localLoginAllowed(request: Request, env: Record<string, string | undefined> = process.env) {
  if (env.LOCAL_LOGIN_HELPER !== 'true' || !loopback.has(env.HOST || '')) return false;
  try {
    const configured = new URL(env.NEXTAUTH_URL || '');
    const host = request.headers.get('host');
    if (!host || !loopback.has(configured.hostname)) return false;
    const url = new URL(request.url);
    const expectedPort = env.PORT || configured.port;
    const supplied = new URL(`${url.protocol}//${host}`);
    if (!['http:', 'https:'].includes(url.protocol) || !loopback.has(url.hostname) || !loopback.has(supplied.hostname) || supplied.port !== expectedPort || url.port !== expectedPort) return false;
    const site = request.headers.get('sec-fetch-site');
    if (site && site !== 'same-origin' && site !== 'none') return false;
    if (request.method === 'POST') {
      if (request.headers.get('origin') !== supplied.origin || request.headers.get('x-local-login') !== 'fill') return false;
      if (!request.headers.get('content-type')?.startsWith('application/json')) return false;
    }
    return true;
  } catch { return false; }
}
