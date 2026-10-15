output "resource_group_name" { value = azurerm_resource_group.main.name }
output "sql_server_fqdn" { value = azurerm_mssql_server.main.fully_qualified_domain_name }
output "app_urls" { value = { for name, app in module.app : name => app.latest_revision_fqdn } }
output "archive_container" { value = module.archive.container_name }
output "application_insights_connection_string" {
  value     = module.observability.app_insights_connection_string
  sensitive = true
}
