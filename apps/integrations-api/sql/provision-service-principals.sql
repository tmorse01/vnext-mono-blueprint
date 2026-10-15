/*
 * Run by a database administrator after creating SQL Server logins named
 * vnext_lending_api and vnext_integrations_api. Runtime principals are not
 * migration/seed principals.
 */
IF SUSER_ID(N'vnext_lending_api') IS NULL OR SUSER_ID(N'vnext_integrations_api') IS NULL
  THROW 51000, 'Create both service logins before provisioning database users.', 1;
GO

IF DATABASE_PRINCIPAL_ID(N'vnext_lending_api') IS NULL
  CREATE USER [vnext_lending_api] FOR LOGIN [vnext_lending_api];
IF DATABASE_PRINCIPAL_ID(N'vnext_integrations_api') IS NULL
  CREATE USER [vnext_integrations_api] FOR LOGIN [vnext_integrations_api];
GO

IF DATABASE_PRINCIPAL_ID(N'vnext_lending_runtime') IS NULL
  CREATE ROLE [vnext_lending_runtime];
IF DATABASE_PRINCIPAL_ID(N'vnext_integrations_runtime') IS NULL
  CREATE ROLE [vnext_integrations_runtime];
GO

IF NOT EXISTS (SELECT 1 FROM sys.database_role_members WHERE role_principal_id = DATABASE_PRINCIPAL_ID(N'vnext_lending_runtime') AND member_principal_id = DATABASE_PRINCIPAL_ID(N'vnext_lending_api'))
  ALTER ROLE [vnext_lending_runtime] ADD MEMBER [vnext_lending_api];
IF NOT EXISTS (SELECT 1 FROM sys.database_role_members WHERE role_principal_id = DATABASE_PRINCIPAL_ID(N'vnext_integrations_runtime') AND member_principal_id = DATABASE_PRINCIPAL_ID(N'vnext_integrations_api'))
  ALTER ROLE [vnext_integrations_runtime] ADD MEMBER [vnext_integrations_api];
GO

GRANT SELECT, INSERT, UPDATE ON SCHEMA::[core] TO [vnext_lending_runtime];
GRANT SELECT, INSERT, UPDATE ON SCHEMA::[lending] TO [vnext_lending_runtime];
GRANT SELECT, INSERT, UPDATE ON SCHEMA::[config] TO [vnext_lending_runtime];
GRANT SELECT, INSERT, UPDATE ON SCHEMA::[iam] TO [vnext_lending_runtime];
GRANT SELECT, INSERT ON SCHEMA::[audit] TO [vnext_lending_runtime];
GRANT UPDATE ON OBJECT::[audit].[ArchiveOutbox] TO [vnext_lending_runtime];
DENY UPDATE, DELETE ON OBJECT::[audit].[AuditEvent] TO [vnext_lending_runtime];
DENY UPDATE, DELETE ON OBJECT::[lending].[ScenarioRevision] TO [vnext_lending_runtime];
DENY UPDATE, DELETE ON OBJECT::[lending].[PricingResult] TO [vnext_lending_runtime];
GRANT SELECT, INSERT, UPDATE ON OBJECT::[integrations].[IntegrationDelivery] TO [vnext_integrations_runtime];
GO
