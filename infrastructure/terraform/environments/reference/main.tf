resource "azurerm_resource_group" "main" {
  name     = var.resource_group_name
  location = var.location
  tags     = local.tags
}

resource "azurerm_container_app_environment" "main" {
  name                       = "${var.name_prefix}-cae"
  location                   = azurerm_resource_group.main.location
  resource_group_name        = azurerm_resource_group.main.name
  log_analytics_workspace_id = module.observability.workspace_id
  tags                       = local.tags
}

resource "azurerm_mssql_server" "main" {
  name                          = var.sql_server_name
  resource_group_name           = azurerm_resource_group.main.name
  location                      = azurerm_resource_group.main.location
  version                       = "12.0"
  administrator_login           = var.sql_admin_login
  administrator_login_password  = var.sql_admin_password
  minimum_tls_version           = "1.2"
  public_network_access_enabled = var.sql_public_network_access_enabled
  tags                          = local.tags

}

resource "azurerm_mssql_database" "main" {
  name                 = var.sql_database_name
  server_id            = azurerm_mssql_server.main.id
  sku_name             = var.sql_sku_name
  zone_redundant       = false
  storage_account_type = "Local"
  tags                 = local.tags

}

resource "azurerm_key_vault" "main" {
  name                       = var.key_vault_name
  location                   = azurerm_resource_group.main.location
  resource_group_name        = azurerm_resource_group.main.name
  tenant_id                  = data.azurerm_client_config.current.tenant_id
  sku_name                   = "standard"
  soft_delete_retention_days = 90
  purge_protection_enabled   = true
  rbac_authorization_enabled = true
  tags                       = local.tags

}

data "azurerm_client_config" "current" {}

resource "azurerm_user_assigned_identity" "audit_archive" {
  name                = "${var.name_prefix}-archive"
  location            = azurerm_resource_group.main.location
  resource_group_name = azurerm_resource_group.main.name
  tags                = local.tags
}

resource "azurerm_role_assignment" "archive_blob_writer" {
  scope                = module.archive.storage_account_id
  role_definition_name = "Storage Blob Data Contributor"
  principal_id         = azurerm_user_assigned_identity.audit_archive.principal_id
}

# Enable resource locks only for shared/production environments. Preview stacks must
# remain deletable by their cleanup workflow.
resource "azurerm_management_lock" "production_data" {
  for_each = var.protect_resources ? {
    sql_server = azurerm_mssql_server.main.id
    sql_db     = azurerm_mssql_database.main.id
    key_vault  = azurerm_key_vault.main.id
    archive    = module.archive.storage_account_id
    logs       = module.observability.workspace_id
    insights   = module.observability.app_insights_id
  } : {}

  name       = "protect-${each.key}"
  scope      = each.value
  lock_level = "CanNotDelete"
  notes      = "Protected by environment policy; retention reductions require reviewed infrastructure changes."
}

module "observability" {
  source                      = "../../modules/observability"
  name                        = "${var.name_prefix}-ops"
  location                    = var.location
  resource_group_name         = azurerm_resource_group.main.name
  workspace_retention_days    = var.workspace_retention_days
  interactive_retention_days  = var.interactive_retention_days
  total_retention_days        = var.total_retention_days
  app_insights_retention_days = var.interactive_retention_days
  enable_alerts               = var.enable_alerts
  alert_email_addresses       = var.alert_email_addresses
  tags                        = local.tags
}

module "archive" {
  source                        = "../../modules/archive-storage"
  name                          = var.archive_storage_name
  resource_group_name           = azurerm_resource_group.main.name
  location                      = var.location
  replication_type              = var.archive_replication_type
  soft_delete_days              = var.archive_soft_delete_days
  public_network_access_enabled = var.archive_public_network_access_enabled
  tags                          = local.tags
}

locals {
  tags = merge(var.tags, { environment = var.environment_name, managed-by = "terraform" })
  app_definitions = {
    lending-web      = { image = var.lending_web_image, port = 8080, external = true }
    admin-web        = { image = var.admin_web_image, port = 8080, external = true }
    lending-api      = { image = var.lending_api_image, port = 3000, external = false }
    integrations-api = { image = var.integrations_api_image, port = 3000, external = true }
  }
}

module "app" {
  for_each                     = local.app_definitions
  source                       = "../../modules/container-app"
  name                         = "${var.name_prefix}-${each.key}"
  resource_group_name          = azurerm_resource_group.main.name
  container_app_environment_id = azurerm_container_app_environment.main.id
  image                        = each.value.image
  target_port                  = each.value.port
  external                     = each.value.external
  environment = each.key == "lending-api" ? {
    APPINSIGHTS_CONNECTION_STRING = module.observability.app_insights_connection_string
    } : contains(["lending-web", "admin-web"], each.key) ? {
    API_UPSTREAM = var.api_upstream
    } : each.key == "integrations-api" ? {
    LENDING_API_BASE_URL = var.api_upstream
  } : {}
  tags = local.tags
}
