resource "azurerm_storage_account" "archive" {
  name                            = var.name
  resource_group_name             = var.resource_group_name
  location                        = var.location
  account_tier                    = "Standard"
  account_replication_type        = var.replication_type
  account_kind                    = "StorageV2"
  min_tls_version                 = "TLS1_2"
  allow_nested_items_to_be_public = false
  shared_access_key_enabled       = false
  public_network_access_enabled   = var.public_network_access_enabled
  tags                            = var.tags

  blob_properties {
    versioning_enabled = true
    delete_retention_policy { days = var.soft_delete_days }
    container_delete_retention_policy { days = var.soft_delete_days }
  }

}

resource "azurerm_storage_container" "audit" {
  name                  = "audit-archive"
  storage_account_id    = azurerm_storage_account.archive.id
  container_access_type = "private"
}

# Deliberately no immutable retention lock: configure and validate the policy through a
# separately reviewed change after the archive format and recovery procedure are proven.
