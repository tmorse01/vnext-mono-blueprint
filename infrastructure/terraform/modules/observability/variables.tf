variable "name" { type = string }
variable "location" { type = string }
variable "resource_group_name" { type = string }
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
variable "app_insights_retention_days" {
  type    = number
  default = 90
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

variable "retention_policy_note" {
  type        = string
  default     = "Proposed technical defaults only; confirm retention policy with the system owner."
  description = "Documentation marker. Values are not a legal retention decision."
}
