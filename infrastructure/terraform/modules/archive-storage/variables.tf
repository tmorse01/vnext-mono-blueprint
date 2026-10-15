variable "name" { type = string }
variable "resource_group_name" { type = string }
variable "location" { type = string }
variable "replication_type" {
  type    = string
  default = "ZRS"
}
variable "soft_delete_days" {
  type    = number
  default = 30
}
variable "public_network_access_enabled" {
  type    = bool
  default = false
}
variable "tags" {
  type    = map(string)
  default = {}
}
