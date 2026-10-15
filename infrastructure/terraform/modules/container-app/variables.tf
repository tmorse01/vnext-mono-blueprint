variable "name" { type = string }
variable "resource_group_name" { type = string }
variable "container_app_environment_id" { type = string }
variable "image" { type = string }
variable "target_port" { type = number }
variable "external" {
  type    = bool
  default = true
}
variable "min_replicas" {
  type    = number
  default = 1
}
variable "max_replicas" {
  type    = number
  default = 3
}
variable "cpu" {
  type    = number
  default = 0.5
}
variable "memory" {
  type    = string
  default = "1Gi"
}
variable "environment" {
  type    = map(string)
  default = {}
}
variable "tags" {
  type    = map(string)
  default = {}
}
