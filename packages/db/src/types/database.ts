import type { ColumnType, Generated } from 'kysely';

/** SQL DECIMAL is transported as text at the application boundary. */
export type DecimalString = string & { readonly __decimalString: unique symbol };
export function asDecimalString(value: string): DecimalString {
  if (!/^-?\d+(\.\d+)?$/u.test(value)) throw new Error('Decimal value must be a base-10 decimal string.');
  return value as DecimalString;
}
export type UtcDateTime = ColumnType<Date, Date | string, Date | string>;
export type DbJson = ColumnType<string, string, string>;
export type RowVersion = ColumnType<Uint8Array, never, never>;

export interface BusinessUnitTable {
  id: string;
  code: string;
  name: string;
  isActive: boolean;
  createdAt: Generated<UtcDateTime>;
  updatedAt: UtcDateTime;
}

export interface OrganizationTable {
  id: string;
  name: string;
  legalName: string | null;
  organizationType: string;
  externalReference: string | null;
  createdAt: Generated<UtcDateTime>;
  updatedAt: UtcDateTime;
}

export interface PersonTable {
  id: string;
  givenName: string;
  familyName: string;
  email: string | null;
  phone: string | null;
  createdAt: Generated<UtcDateTime>;
  updatedAt: UtcDateTime;
}

export interface OrganizationPersonTable {
  organizationId: string;
  personId: string;
  relationshipRole: string;
  isPrimary: boolean;
  createdAt: Generated<UtcDateTime>;
}

export interface LoanProgramTable {
  id: string;
  code: string;
  name: string;
  productFamily: 'construction' | 'dscr';
  isActive: boolean;
}

export interface LoanProductTable {
  id: string;
  programId: string;
  code: string;
  name: string;
  isActive: boolean;
}

export interface ProductVersionTable {
  id: string;
  productId: string;
  versionNumber: number;
  effectiveFrom: UtcDateTime;
  effectiveTo: UtcDateTime | null;
  terms: DbJson;
  createdAt: Generated<UtcDateTime>;
}

export interface BusinessUnitProductTable {
  businessUnitId: string;
  productId: string;
  isEnabled: boolean;
  defaultProductVersionId: string | null;
}

export interface LoanTable {
  id: string;
  businessUnitId: string;
  loanNumber: string;
  status: string;
  createdAt: Generated<UtcDateTime>;
  updatedAt: UtcDateTime;
}

export interface LoanOrganizationTable {
  loanId: string;
  organizationId: string;
  relationshipRole: string;
}

export interface LoanScenarioTable {
  id: string;
  loanId: string;
  productVersionId: string;
  name: string;
  status: string;
  interestRate: DecimalString | null;
  termMonths: number | null;
  metadataRevisionId: string | null;
  version: RowVersion;
  createdByUserId: string | null;
  createdAt: Generated<UtcDateTime>;
  updatedAt: UtcDateTime;
}

export interface ScenarioRevisionTable {
  id: string;
  scenarioId: string;
  revisionNumber: number;
  snapshot: DbJson;
  actorUserId: string | null;
  createdAt: Generated<UtcDateTime>;
}

export interface ConstructionScenarioDetailTable {
  scenarioId: string;
  projectType: 'ground_up' | 'renovation';
  requestedLoanAmount: DecimalString;
  asIsValue: DecimalString | null;
  afterRepairValue: DecimalString | null;
  totalProjectCost: DecimalString | null;
  constructionMonths: number;
  units: number;
}

export interface DscrScenarioDetailTable {
  scenarioId: string;
  requestedLoanAmount: DecimalString;
  purchasePrice: DecimalString | null;
  propertyValue: DecimalString | null;
  monthlyRent: DecimalString | null;
  monthlyExpenses: DecimalString | null;
  monthlyTaxes: DecimalString | null;
  monthlyInsurance: DecimalString | null;
  monthlyHoa: DecimalString | null;
  dscr: DecimalString | null;
  units: number;
}

export interface PricingConfigurationTable {
  id: string;
  code: string;
  name: string;
  isActive: boolean;
}

export interface PricingVersionTable {
  id: string;
  pricingConfigurationId: string;
  versionNumber: number;
  parameters: DbJson;
  createdAt: Generated<UtcDateTime>;
}

export interface PricingResultTable {
  id: string;
  scenarioId: string;
  productVersionId: string;
  pricingVersionId: string;
  metadataRevisionId: string | null;
  inputs: DbJson;
  result: DbJson;
  rate: DecimalString | null;
  points: DecimalString | null;
  createdAt: Generated<UtcDateTime>;
}

export interface AppUserTable {
  id: string;
  email: string;
  passwordHash: string;
  displayName: string;
  isActive: boolean;
  createdAt: Generated<UtcDateTime>;
  updatedAt: UtcDateTime;
}

export interface RoleTable { id: string; code: string; name: string; }
export interface PermissionTable { id: string; key: string; description: string; }
export interface UserRoleTable { userId: string; roleId: string; }
export interface RolePermissionTable { roleId: string; permissionId: string; }
export interface UserSessionTable {
  id: string;
  userId: string;
  tokenHash: string;
  expiresAt: UtcDateTime;
  createdAt: Generated<UtcDateTime>;
  revokedAt: UtcDateTime | null;
}

export interface MetadataRevisionTable {
  id: string;
  productFamily: string;
  businessUnitId: string | null;
  revisionNumber: number;
  state: 'draft' | 'published' | 'superseded';
  document: DbJson;
  version: RowVersion;
  createdByUserId: string | null;
  createdAt: Generated<UtcDateTime>;
  publishedAt: UtcDateTime | null;
}

export interface MetadataPublicationTable {
  productFamily: string;
  scopeKey: string;
  businessUnitId: string | null;
  metadataRevisionId: string;
  publishedAt: UtcDateTime;
}

export interface MetadataBusinessUnitOverrideTable {
  id: string;
  businessUnitId: string;
  productFamily: string;
  settings: DbJson;
  version: RowVersion;
  updatedAt: UtcDateTime;
}

export interface AuditEventTable {
  id: string;
  occurredAt: UtcDateTime;
  actorId: string | null;
  actorType: string;
  action: string;
  entityType: string;
  entityId: string;
  businessUnitId: string | null;
  changes: DbJson;
  metadataRevisionId: string | null;
  productVersionId: string | null;
  pricingVersionId: string | null;
  correlationId: string | null;
  traceId: string | null;
  application: string;
  deploymentVersion: string | null;
}

export interface ArchiveOutboxTable {
  eventId: string;
  state: 'pending' | 'delivered' | 'failed';
  attemptCount: number;
  availableAt: UtcDateTime;
  lastAttemptAt: UtcDateTime | null;
  deliveredAt: UtcDateTime | null;
  archiveUri: string | null;
  checksum: string | null;
  lastError: string | null;
}

export interface IntegrationDeliveryTable {
  id: string;
  provider: string;
  idempotencyKey: string;
  payloadHash: string;
  state: 'received' | 'processing' | 'completed' | 'failed';
  responseStatus: number | null;
  responseBody: DbJson | null;
  createdAt: Generated<UtcDateTime>;
  updatedAt: UtcDateTime;
}

export interface Database {
  'core.BusinessUnit': BusinessUnitTable;
  'core.Organization': OrganizationTable;
  'core.Person': PersonTable;
  'core.OrganizationPerson': OrganizationPersonTable;
  'lending.LoanProgram': LoanProgramTable;
  'lending.LoanProduct': LoanProductTable;
  'lending.ProductVersion': ProductVersionTable;
  'lending.BusinessUnitProduct': BusinessUnitProductTable;
  'lending.Loan': LoanTable;
  'lending.LoanOrganization': LoanOrganizationTable;
  'lending.LoanScenario': LoanScenarioTable;
  'lending.ScenarioRevision': ScenarioRevisionTable;
  'lending.ConstructionScenarioDetail': ConstructionScenarioDetailTable;
  'lending.DscrScenarioDetail': DscrScenarioDetailTable;
  'lending.PricingConfiguration': PricingConfigurationTable;
  'lending.PricingVersion': PricingVersionTable;
  'lending.PricingResult': PricingResultTable;
  'iam.AppUser': AppUserTable;
  'iam.Role': RoleTable;
  'iam.Permission': PermissionTable;
  'iam.UserRole': UserRoleTable;
  'iam.RolePermission': RolePermissionTable;
  'iam.UserSession': UserSessionTable;
  'config.MetadataRevision': MetadataRevisionTable;
  'config.MetadataPublication': MetadataPublicationTable;
  'config.MetadataBusinessUnitOverride': MetadataBusinessUnitOverrideTable;
  'audit.AuditEvent': AuditEventTable;
  'audit.ArchiveOutbox': ArchiveOutboxTable;
  'integrations.IntegrationDelivery': IntegrationDeliveryTable;
}

