variable "aws_region" {
  type    = string
  default = "us-east-1"
}

variable "project_name" {
  type    = string
  default = "finals-buddy"
}

variable "instance_type" {
  description = "t3.medium: k3s needs roughly 512Mi before Prometheus and Grafana are counted, which is what ruled out the 1GB Oracle box."
  type        = string
  default     = "t3.medium"
}

variable "admin_cidr" {
  description = "Operator IP/32, allowed to reach Grafana."
  type        = string
}

variable "github_repo" {
  description = "Repo allowed to assume the deploy role, as owner/repo."
  type        = string
}

variable "repo_url" {
  description = "Public clone URL the instance pulls manifests from."
  type        = string
}

variable "domain_name" {
  description = "Hostname Caddy obtains a certificate for. DNS must point here before cutover."
  type        = string
}
