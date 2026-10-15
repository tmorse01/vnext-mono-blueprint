import { describe, expect, it } from 'vitest';
import { integrationsDatabaseEnvironment } from './database.js';

describe('integrations database configuration', () => {
  it('uses a dedicated service URL when configured', () => {
    const env = integrationsDatabaseEnvironment({ DB_URL: 'mssql://shared:pass@db.test/vnext', INTEGRATIONS_DB_URL: 'mssql://integrations:isolated@db.test/vnext' });
    expect(env.DB_URL).toBe('mssql://integrations:isolated@db.test/vnext');
  });

  it('requires dedicated username and password as a pair', () => {
    expect(() => integrationsDatabaseEnvironment({ INTEGRATIONS_DB_PASSWORD: 'secret' })).toThrow(/configured together/u);
  });
});
