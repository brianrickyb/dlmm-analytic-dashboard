import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { AuthResult, VerifyTokenFn } from '../middleware/requireAuth.js';

export function createSupabaseAdmin(url: string, secretKey: string): SupabaseClient {
  return createClient(url, secretKey);
}

export function createVerifyToken(admin: SupabaseClient): VerifyTokenFn {
  return async (token: string): Promise<AuthResult> => {
    try {
      const { data, error } = await admin.auth.getUser(token);
      if (error || !data.user) {
        return { kind: 'invalid' };
      }
      return { kind: 'ok', user: { id: data.user.id, email: data.user.email ?? '' } };
    } catch {
      return { kind: 'unavailable' };
    }
  };
}
