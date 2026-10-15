import { describe, expect, it } from 'vitest';
import { lendingDatabaseEnvironment } from './database.js';

describe('lending database configuration', () => {
  it('overrides shared URL credentials while keeping the local endpoint', () => {
    const env = lendingDatabaseEnvironment({ DB_URL: 'mssql://shared:shared-pass@db.test:1433/vnext', LENDING_DB_USER: 'lending-user', LENDING_DB_PASSWORD: 'secret:@/' });
    const url = new URL(env.DB_URL!);
    expect(url.hostname).toBe('db.test');
    expect(url.username).toBe('lending-user');
    expect(url.password).toBe('secret:@/');
    expect(url.pathname).toBe('/vnext');
  });

  it('requires dedicated username and password as a pair', () => {
    expect(() => lendingDatabaseEnvironment({ LENDING_DB_USER: 'lending-user' })).toThrow(/configured together/u);
  });
});
