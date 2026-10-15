import { describe, expect, it } from 'vitest';
import { clearedSessionCookie, hashSessionToken, sessionCookie } from './auth.js';
import { localUserProvisioningAllowed } from './routes.js';
import { decodeListCursor, decimalForColumn, encodeListCursor } from './scenarios.js';

describe('session and cursor boundaries', () => {
  it('stores only a one-way hash of an opaque session token', () => {
    const token = 'opaque-session-token';
    expect(hashSessionToken(token)).not.toBe(token);
    expect(hashSessionToken(token)).toBe(hashSessionToken(token));
  });

  it('sets and clears an HttpOnly same-site cookie and secures production cookies', () => {
    expect(sessionCookie('a.b', false)).toContain('HttpOnly; SameSite=Lax');
    expect(sessionCookie('a.b', true)).toContain('; Secure');
    expect(clearedSessionCookie(true)).toContain('Max-Age=0; Secure');
  });

  it('refuses local credential bootstrap outside a local process', () => {
    expect(localUserProvisioningAllowed({ APP_ENV: 'local' })).toBe(true);
    expect(localUserProvisioningAllowed({ APP_ENV: 'production' })).toBe(false);
    expect(localUserProvisioningAllowed({ APP_ENV: 'local', NODE_ENV: 'production' })).toBe(false);
  });

  it('binds list cursors to the selected sort and direction', () => {
    const row = { id: 'a705c1a5-59cd-4690-8b35-321a68e73a34', name: 'Oakridge', loanAmount: '4250000.0000', updatedAt: new Date('2026-10-13T19:40:00.000Z') };
    const filters = { q: null, family: null, status: null };
    const cursor = encodeListCursor(row, 'loanAmount', 'desc', filters);
    expect(decodeListCursor(cursor, 'loanAmount', 'desc', filters)).toEqual({ value: '4250000.0000', id: row.id });
    expect(() => decodeListCursor(cursor, 'name', 'desc', filters)).toThrow(/cursor/i);
    expect(() => decodeListCursor(cursor, 'loanAmount', 'asc', filters)).toThrow(/cursor/i);
    expect(() => decodeListCursor(cursor, 'loanAmount', 'desc', { ...filters, family: 'dscr' })).toThrow(/cursor/i);
  });

  it('rejects decimals that do not fit the destination SQL precision', () => {
    expect(decimalForColumn('0.082500', 9, 6, 'rate')).toBe('0.082500');
    expect(() => decimalForColumn('0.0825001', 9, 6, 'rate')).toThrow(/precision/u);
    expect(() => decimalForColumn('1000000', 9, 6, 'rate')).toThrow(/precision/u);
  });
});
