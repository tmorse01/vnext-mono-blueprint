output "id" { value = azurerm_container_app.main.id }
output "principal_id" { value = azurerm_container_app.main.identity[0].principal_id }
output "latest_revision_fqdn" { value = azurerm_container_app.main.latest_revision_fqdn }
