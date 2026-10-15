variable "name_prefix" { type = string }
variable "environment_name" {
  type    = string
  default = "reference"
}
variable "resource_group_name" { type = string }
variable "location" { type = string }
variable "sql_server_name" { type = string }
variable "sql_database_name" {
  type    = string
  default = "vnext"
}
variable "sql_admin_login" {
  type      = string
  sensitive = true
}
variable "sql_admin_password" {
  type      = string
  sensitive = true
}
variable "sql_sku_name" {
  type    = string
  default = "GP_S_Gen5_2"
}
variable "sql_public_network_access_enabled" {
  type    = bool
  default = false
}
variable "key_vault_name" { type = string }
variable "archive_storage_name" { type = string }
variable "archive_replication_type" {
  type    = string
  default = "ZRS"
}
variable "archive_soft_delete_days" {
  type    = number
  default = 30
}
variable "archive_public_network_access_enabled" {
  type    = bool
  default = false
}
variable "lending_web_image" { type = string }
variable "admin_web_image" { type = string }
variable "lending_api_image" { type = string }
variable "integrations_api_image" { type = string }
variable "api_upstream" {
  type        = string
  description = "Private HTTP(S) origin for the lending API, routed by both web containers at /api."
  validation {
    condition     = can(regex("^https?://[^/]+$", var.api_upstream))
    error_message = "api_upstream must be an HTTP or HTTPS origin without a path."
  }
}
variable "workspace_retention_days" {
  type    = number
  default = 90
}
variable "interactive_retention_days" {
  type    = number
  default = 90
}
variable "total_retention_days" {
  type    = number
  default = 730
}
variable "enable_alerts" {
  type    = bool
  default = false
}
variable "alert_email_addresses" {
  type    = list(string)
  default = []
}
variable "tags" {
  type    = map(string)
  default = {}
}
variable "protect_resources" {
  type        = bool
  default     = false
  description = "Enable CanNotDelete locks for shared or production state. Leave false for disposable previews."
}
