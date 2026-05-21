variable "region" {
  description = "Alibaba Cloud region for ECS."
  type        = string
  default     = "ap-southeast-3"
}

variable "zone_id" {
  description = "Zone ID, for example ap-southeast-3a. Leave empty to use the first available zone."
  type        = string
  default     = ""
}

variable "instance_type" {
  description = "ECS instance type."
  type        = string
  default     = "ecs.e-c1m2.large"
}

variable "system_disk_size" {
  description = "System disk size in GB."
  type        = number
  default     = 40
}

variable "ssh_public_key" {
  description = "SSH public key for ECS login."
  type        = string
}

variable "dashscope_api_key" {
  description = "DashScope API key injected into the showcase service."
  type        = string
  sensitive   = true
}

variable "repo_url" {
  description = "Git repository URL containing AI_Model_Studio_Portal."
  type        = string
  default     = "https://github.com/khawzk/ModelStudio.git"
}

variable "app_subdir" {
  description = "Subdirectory containing server.py."
  type        = string
  default     = "AI_Model_Studio_Portal"
}

variable "allowed_cidr" {
  description = "CIDR allowed to access the showcase and SSH. Tighten this before production."
  type        = string
  default     = "0.0.0.0/0"
}
