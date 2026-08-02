import { describe, expect, it } from 'vitest';
import { createVerifyToken } from './supabaseAdmin.js';
import type { SupabaseClient } from '@supabase/supabase-js';

function fakeAdmin(
  getUser: (token: string) => Promise<{ data: { user: { id: string; email?: string } | null }; error: { message: string } | null }>,
): SupabaseClient {
  return { auth: { getUser } } as unknown as SupabaseClient;
}

describe('createVerifyToken', () => {
  it('returns ok with the user id/email when Supabase confirms the token', async () => {
    const admin = fakeAdmin(async (token) => {
      expect(token).toBe('good-token');
      return { data: { user: { id: 'user-1', email: 'me@example.com' } }, error: null };
    });
    const verifyToken = createVerifyToken(admin);

    const result = await verifyToken('good-token');

    expect(result).toEqual({ kind: 'ok', user: { id: 'user-1', email: 'me@example.com' } });
  });

  it('returns invalid when Supabase returns an error', async () => {
    const admin = fakeAdmin(async () => ({ data: { user: null }, error: { message: 'invalid JWT' } }));
    const verifyToken = createVerifyToken(admin);

    const result = await verifyToken('bad-token');

    expect(result).toEqual({ kind: 'invalid' });
  });

  it('returns invalid when Supabase returns no error but also no user', async () => {
    const admin = fakeAdmin(async () => ({ data: { user: null }, error: null }));
    const verifyToken = createVerifyToken(admin);

    const result = await verifyToken('weird-token');

    expect(result).toEqual({ kind: 'invalid' });
  });

  it('returns unavailable when the Supabase call throws (network failure)', async () => {
    const admin = fakeAdmin(async () => {
      throw new Error('ECONNREFUSED');
    });
    const verifyToken = createVerifyToken(admin);

    const result = await verifyToken('any-token');

    expect(result).toEqual({ kind: 'unavailable' });
  });

  it('falls back to an empty string email when Supabase omits it', async () => {
    const admin = fakeAdmin(async () => ({ data: { user: { id: 'user-2' } }, error: null }));
    const verifyToken = createVerifyToken(admin);

    const result = await verifyToken('token');

    expect(result).toEqual({ kind: 'ok', user: { id: 'user-2', email: '' } });
  });
});
