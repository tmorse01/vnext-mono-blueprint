resource "azurerm_log_analytics_workspace" "main" {
  name                       = var.name
  location                   = var.location
  resource_group_name        = var.resource_group_name
  sku                        = "PerGB2018"
  retention_in_days          = var.workspace_retention_days
  internet_ingestion_enabled = true
  internet_query_enabled     = true
  tags                       = var.tags

}

resource "azurerm_application_insights" "main" {
  name                = "${var.name}-appi"
  location            = var.location
  resource_group_name = var.resource_group_name
  workspace_id        = azurerm_log_analytics_workspace.main.id
  application_type    = "web"
  retention_in_days   = var.app_insights_retention_days
  disable_ip_masking  = false
  tags                = var.tags

}

# Explicit table settings prevent the workspace default from silently defining history.
resource "azurerm_log_analytics_workspace_table" "operational" {
  for_each = toset(["AppRequests", "AppDependencies", "AppTraces", "AppExceptions"])

  name                    = each.value
  workspace_id            = azurerm_log_analytics_workspace.main.id
  plan                    = "Analytics"
  retention_in_days       = var.interactive_retention_days
  total_retention_in_days = var.total_retention_days

}

resource "azurerm_monitor_action_group" "ops" {
  name                = "${var.name}-ops"
  resource_group_name = var.resource_group_name
  short_name          = "vnextops"
  tags                = var.tags

  dynamic "email_receiver" {
    for_each = var.alert_email_addresses
    content {
      name          = "operations-${email_receiver.key}"
      email_address = email_receiver.value
    }
  }
}

resource "azurerm_monitor_scheduled_query_rules_alert_v2" "archive_lag" {
  name                 = "${var.name}-audit-archive-lag"
  resource_group_name  = var.resource_group_name
  location             = var.location
  evaluation_frequency = "PT5M"
  window_duration      = "PT30M"
  scopes               = [azurerm_log_analytics_workspace.main.id]
  severity             = 2
  enabled              = var.enable_alerts
  description          = "Find repeated or delayed audit archive delivery signals. SQL outbox age remains the authoritative lag measure."
  display_name         = "Audit archive delivery errors"
  criteria {
    query                   = <<-KQL
      AppTraces
      | where TimeGenerated > ago(30m)
      | where Message has_any ("audit_archive_retry", "audit_archive_failed")
      | summarize failures = count()
      | where failures > 0
    KQL
    time_aggregation_method = "Count"
    threshold               = 0
    operator                = "GreaterThan"
    resource_id_column      = "_ResourceId"
    failing_periods {
      minimum_failing_periods_to_trigger_alert = 1
      number_of_evaluation_periods             = 1
    }
  }
  action {
    action_groups = [azurerm_monitor_action_group.ops.id]
  }
  tags = var.tags
}
