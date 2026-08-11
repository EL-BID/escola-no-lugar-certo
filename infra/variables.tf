variable "azure_subscription_id" {
  description = "Azure Subscription ID"
  type        = string
}

variable "project_name" {
  description = "Project name used for resource naming"
  type        = string
  default     = "edu-brazil-web"
}

variable "environment" {
  description = "Deployment environment: local | staging | prod"
  type        = string
}

variable "location" {
  description = "Azure region"
  type        = string
  default     = "eastus2"
}

variable "tags" {
  description = "Common tags applied to resources"
  type        = map(string)
  default     = {}
}

variable "backend_image_tag" {
  description = "Container image tag for backend (edu-brazil-backend:<tag>)"
  type        = string
  default     = "latest"
}

variable "backend_allowed_hosts" {
  description = "Comma-separated ALLOWED_HOSTS passed to backend container"
  type        = string
  default     = "localhost,127.0.0.1"
}

variable "db_admin_user" {
  description = "PostgreSQL admin username"
  type        = string
  default     = "pgadmin"
}

variable "db_admin_password" {
  description = "PostgreSQL admin password"
  type        = string
  sensitive   = true
}

variable "db_name" {
  description = "Application database name"
  type        = string
  default     = "geodb"
}

variable "db_version" {
  description = "PostgreSQL version"
  type        = string
  default     = "16"
}

variable "db_sku_name" {
  description = "Flexible Server SKU (e.g., B_Standard_B1ms)"
  type        = string
  default     = "B_Standard_B1ms"
}

variable "db_storage_mb" {
  description = "Storage in MB for DB"
  type        = number
  default     = 32768
}

variable "db_firewall_start_ip" {
  description = "Start IP address to allow DB access (e.g., your public IP)."
  type        = string
  default     = "0.0.0.0"
}

variable "db_firewall_end_ip" {
  description = "End IP address to allow DB access (for single IP, set equal to start)."
  type        = string
  default     = "255.255.255.255"
}

variable "frontend_cors_origin" {
  description = "Frontend origin (for CORS/CSRF)"
  type        = string
  default     = "http://localhost:5173"
}

variable "csrf_trusted_origins" {
  description = "Comma-separated list of trusted origins for CSRF protection (should include frontend and backend URLs)"
  type        = string
  default     = "http://localhost:5173"
}

variable "django_settings_module" {
  description = "Django settings module to use (Pattern A default)"
  type        = string
  default     = "geo_edu_brazil.settings"
}

variable "django_debug_override" {
  description = "Override DEBUG (null to derive from environment)"
  type        = string
  default     = null
}

variable "api_frontend_only_enforced" {
  description = "Whether to enforce frontend-origin gate on API endpoints"
  type        = string
  default     = "true"
}

variable "api_frontend_only_path_prefixes" {
  description = "Comma-separated API path prefixes protected by the frontend-origin gate"
  type        = string
  default     = "/api/"
}

variable "api_throttle_anon_rate" {
  description = "DRF anonymous throttle rate (e.g., 120/min, 2000/day)"
  type        = string
  default     = "120/min"
}

variable "acr_sku" {
  description = "SKU for Azure Container Registry"
  type        = string
  default     = "Basic"
}

variable "storage_custom_domain" {
  description = "Optional custom domain for the frontend storage account static website"
  type        = string
  default     = null
}

variable "storage_custom_domain_use_subdomain" {
  description = "Whether indirect CNAME validation should be used for storage custom domain"
  type        = bool
  default     = false
}

variable "enable_redis" {
  description = "Whether to provision Azure Cache for Redis and wire backend cache to Redis"
  type        = bool
  default     = true
}

variable "redis_sku_name" {
  description = "Redis SKU (Basic, Standard, Premium)"
  type        = string
  default     = "Basic"
}

variable "redis_family" {
  description = "Redis family (C for Basic/Standard, P for Premium)"
  type        = string
  default     = "C"
}

variable "redis_capacity" {
  description = "Redis capacity index (e.g. 0=250MB, 1=1GB for family C)"
  type        = number
  default     = 1
}
