const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:4000';

async function postWithAuth(path: string, accessToken: string): Promise<{ url: string }> {
  const response = await fetch(new URL(path, API_BASE_URL).toString(), {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const body = await response.json();

  if (!response.ok) {
    throw new Error(typeof body?.error === 'string' ? body.error : 'Request failed.');
  }

  return body as { url: string };
}

export function createCheckoutSession(accessToken: string): Promise<{ url: string }> {
  return postWithAuth('/api/premium/checkout', accessToken);
}

export function createPortalSession(accessToken: string): Promise<{ url: string }> {
  return postWithAuth('/api/premium/portal', accessToken);
}
