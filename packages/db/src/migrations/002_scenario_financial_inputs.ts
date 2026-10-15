import { sql, type Kysely } from 'kysely';
import type { Database } from '../types/database.js';

export async function up(db: Kysely<Database>): Promise<void> {
  await sql`ALTER TABLE lending.LoanScenario ADD interestRate decimal(9,6) NULL, termMonths smallint NULL`.execute(db);
  await sql`ALTER TABLE lending.LoanScenario ADD CONSTRAINT CK_LoanScenario_termMonths CHECK (termMonths IS NULL OR termMonths BETWEEN 1 AND 600)`.execute(db);
  await sql`ALTER TABLE lending.ConstructionScenarioDetail ADD projectType varchar(16) NOT NULL CONSTRAINT DF_ConstructionScenario_projectType DEFAULT 'ground_up'`.execute(db);
  await sql`ALTER TABLE lending.ConstructionScenarioDetail ADD CONSTRAINT CK_ConstructionScenario_projectType CHECK (projectType IN ('ground_up','renovation'))`.execute(db);
  await sql`ALTER TABLE lending.DscrScenarioDetail ADD monthlyExpenses decimal(19,4) NULL CONSTRAINT CK_DscrScenario_monthlyExpenses CHECK (monthlyExpenses IS NULL OR monthlyExpenses >= 0)`.execute(db);
}

export async function down(db: Kysely<Database>): Promise<void> {
  await sql`ALTER TABLE lending.LoanScenario DROP CONSTRAINT CK_LoanScenario_termMonths`.execute(db);
  await sql`ALTER TABLE lending.LoanScenario DROP COLUMN interestRate, termMonths`.execute(db);
  await sql`ALTER TABLE lending.ConstructionScenarioDetail DROP CONSTRAINT CK_ConstructionScenario_projectType`.execute(db);
  await sql`ALTER TABLE lending.ConstructionScenarioDetail DROP CONSTRAINT DF_ConstructionScenario_projectType`.execute(db);
  await sql`ALTER TABLE lending.ConstructionScenarioDetail DROP COLUMN projectType`.execute(db);
  await sql`ALTER TABLE lending.DscrScenarioDetail DROP CONSTRAINT CK_DscrScenario_monthlyExpenses`.execute(db);
  await sql`ALTER TABLE lending.DscrScenarioDetail DROP COLUMN monthlyExpenses`.execute(db);
}
