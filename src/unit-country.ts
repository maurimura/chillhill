import { normalizeCountry } from './config/units.ts';

/** Country only, supplied by our own edge. No GPS prompt, IP return or persistence. */
export async function requestUnitCountry(request: typeof fetch = fetch): Promise<string | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 2000);
  try {
    const response = await request('/api/preferences', {
      headers: { Accept: 'application/json' },
      cache: 'no-store',
      signal: controller.signal,
    });
    if (!response.ok || !response.headers.get('content-type')?.includes('application/json'))
      return null;
    const data = await response.json();
    return normalizeCountry(data?.country);
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}
