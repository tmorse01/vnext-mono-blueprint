import { sql, type Kysely } from 'kysely';
import type { Database } from './types/database.js';

const expected: Record<string, string[]> = {
  'core.BusinessUnit': ['id', 'code', 'name', 'isActive', 'createdAt', 'updatedAt'],
  'core.Organization': ['id', 'name', 'legalName', 'organizationType', 'externalReference', 'createdAt', 'updatedAt'],
  'core.Person': ['id', 'givenName', 'familyName', 'email', 'phone', 'createdAt', 'updatedAt'],
  'core.OrganizationPerson': ['organizationId', 'personId', 'relationshipRole', 'isPrimary', 'createdAt'],
  'lending.LoanProgram': ['id', 'code', 'name', 'productFamily', 'isActive'],
  'lending.LoanProduct': ['id', 'programId', 'code', 'name', 'isActive'],
  'lending.ProductVersion': ['id', 'productId', 'versionNumber', 'effectiveFrom', 'effectiveTo', 'terms', 'createdAt'],
  'lending.BusinessUnitProduct': ['businessUnitId', 'productId', 'isEnabled', 'defaultProductVersionId'],
  'lending.Loan': ['id', 'businessUnitId', 'loanNumber', 'status', 'createdAt', 'updatedAt'],
  'lending.LoanOrganization': ['loanId', 'organizationId', 'relationshipRole'],
  'lending.LoanScenario': ['id', 'loanId', 'productVersionId', 'name', 'status', 'interestRate', 'termMonths', 'metadataRevisionId', 'version', 'createdByUserId', 'createdAt', 'updatedAt'],
  'lending.ScenarioRevision': ['id', 'scenarioId', 'revisionNumber', 'snapshot', 'actorUserId', 'createdAt'],
  'lending.ConstructionScenarioDetail': ['scenarioId', 'projectType', 'requestedLoanAmount', 'asIsValue', 'afterRepairValue', 'totalProjectCost', 'constructionMonths', 'units'],
  'lending.DscrScenarioDetail': ['scenarioId', 'requestedLoanAmount', 'purchasePrice', 'propertyValue', 'monthlyRent', 'monthlyExpenses', 'monthlyTaxes', 'monthlyInsurance', 'monthlyHoa', 'dscr', 'units'],
  'lending.PricingConfiguration': ['id', 'code', 'name', 'isActive'],
  'lending.PricingVersion': ['id', 'pricingConfigurationId', 'versionNumber', 'parameters', 'createdAt'],
  'lending.PricingResult': ['id', 'scenarioId', 'productVersionId', 'pricingVersionId', 'metadataRevisionId', 'inputs', 'result', 'rate', 'points', 'createdAt'],
  'iam.AppUser': ['id', 'email', 'passwordHash', 'displayName', 'isActive', 'createdAt', 'updatedAt'],
  'iam.Role': ['id', 'code', 'name'],
  'iam.Permission': ['id', 'key', 'description'],
  'iam.UserRole': ['userId', 'roleId'],
  'iam.RolePermission': ['roleId', 'permissionId'],
  'iam.UserSession': ['id', 'userId', 'tokenHash', 'expiresAt', 'createdAt', 'revokedAt'],
  'config.MetadataRevision': ['id', 'productFamily', 'businessUnitId', 'revisionNumber', 'state', 'document', 'version', 'createdByUserId', 'createdAt', 'publishedAt'],
  'config.MetadataPublication': ['productFamily', 'scopeKey', 'businessUnitId', 'metadataRevisionId', 'publishedAt'],
  'config.MetadataBusinessUnitOverride': ['id', 'businessUnitId', 'productFamily', 'settings', 'version', 'updatedAt'],
  'audit.AuditEvent': ['id', 'occurredAt', 'actorId', 'actorType', 'action', 'entityType', 'entityId', 'businessUnitId', 'changes', 'metadataRevisionId', 'productVersionId', 'pricingVersionId', 'correlationId', 'traceId', 'application', 'deploymentVersion'],
  'audit.ArchiveOutbox': ['eventId', 'state', 'attemptCount', 'availableAt', 'lastAttemptAt', 'deliveredAt', 'archiveUri', 'checksum', 'lastError'],
  'integrations.IntegrationDelivery': ['id', 'provider', 'idempotencyKey', 'payloadHash', 'state', 'responseStatus', 'responseBody', 'createdAt', 'updatedAt'],
};

export async function checkSchema(db: Kysely<Database>): Promise<void> {
  const result = await sql<{ tableName: string; columnName: string }>`
    SELECT s.name + '.' + t.name AS tableName, c.name AS columnName
    FROM sys.tables t
    JOIN sys.schemas s ON s.schema_id = t.schema_id
    JOIN sys.columns c ON c.object_id = t.object_id
    WHERE s.name IN ('core', 'lending', 'config', 'iam', 'audit', 'integrations')
  `.execute(db);
  const actual = new Map<string, Set<string>>();
  for (const row of result.rows) {
    const names = actual.get(row.tableName) ?? new Set<string>();
    names.add(row.columnName);
    actual.set(row.tableName, names);
  }
  const differences: string[] = [];
  for (const [table, columns] of Object.entries(expected)) {
    const found = actual.get(table);
    if (!found) {
      differences.push(`missing table ${table}`);
      continue;
    }
    for (const column of columns) if (!found.has(column)) differences.push(`missing column ${table}.${column}`);
    for (const column of found) if (!columns.includes(column)) differences.push(`unexpected column ${table}.${column}`);
  }
  for (const table of actual.keys()) if (!(table in expected)) differences.push(`unexpected table ${table}`);
  if (differences.length) throw new Error(`Database schema drift detected:\n${differences.join('\n')}`);
}
