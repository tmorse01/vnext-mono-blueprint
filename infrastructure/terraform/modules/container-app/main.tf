resource "azurerm_container_app" "main" {
  name                         = var.name
  container_app_environment_id = var.container_app_environment_id
  resource_group_name          = var.resource_group_name
  revision_mode                = "Single"
  tags                         = var.tags

  identity { type = "SystemAssigned" }

  ingress {
    external_enabled = var.external
    target_port      = var.target_port
    transport        = "auto"
    traffic_weight {
      percentage      = 100
      latest_revision = true
    }
  }

  template {
    min_replicas = var.min_replicas
    max_replicas = var.max_replicas
    container {
      name   = var.name
      image  = var.image
      cpu    = var.cpu
      memory = var.memory
      dynamic "env" {
        for_each = var.environment
        content {
          name  = env.key
          value = env.value
        }
      }
      liveness_probe {
        transport        = "HTTP"
        port             = var.target_port
        path             = "/health/live"
        initial_delay    = 15
        interval_seconds = 30
      }
      readiness_probe {
        transport        = "HTTP"
        port             = var.target_port
        path             = "/health/ready"
        initial_delay    = 5
        interval_seconds = 15
      }
    }
  }
}
