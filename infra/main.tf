locals {
  suffix      = "${var.project_name}-${var.environment}"
  name_prefix = "${replace(var.project_name, "_", "-")}-${var.environment}"
  common_tags = merge({
    project     = var.project_name,
    environment = var.environment,
  }, var.tags)

  # derive DEBUG if not explicitly set
  django_debug = var.django_debug_override != null ? var.django_debug_override : (var.environment == "local" ? "true" : "false")

  redis_connection_string = var.enable_redis ? "rediss://:${azurerm_redis_cache.cache[0].primary_access_key}@${azurerm_redis_cache.cache[0].hostname}:${azurerm_redis_cache.cache[0].ssl_port}/0" : null
}

resource "azurerm_resource_group" "rg" {
  name     = "rg-${local.suffix}"
  location = var.location
  tags     = local.common_tags
}

# Container Registry
resource "azurerm_container_registry" "acr" {
  name                = replace("acr${local.suffix}", "-", "")
  resource_group_name = azurerm_resource_group.rg.name
  location            = azurerm_resource_group.rg.location
  sku                 = var.acr_sku
  admin_enabled       = true # simplify initial rollout; consider MI auth later
  tags                = local.common_tags
}

# Log Analytics + ACA Environment
resource "azurerm_log_analytics_workspace" "law" {
  name                = "law-${local.suffix}"
  location            = azurerm_resource_group.rg.location
  resource_group_name = azurerm_resource_group.rg.name
  sku                 = "PerGB2018"
  retention_in_days   = 30
  tags                = local.common_tags
}

resource "azurerm_container_app_environment" "aca_env" {
  name                       = "acae-${local.suffix}"
  location                   = azurerm_resource_group.rg.location
  resource_group_name        = azurerm_resource_group.rg.name
  log_analytics_workspace_id = azurerm_log_analytics_workspace.law.id
  tags                       = local.common_tags
}

# PostgreSQL Flexible Server
resource "azurerm_postgresql_flexible_server" "db" {
  name                   = "pg-${local.suffix}"
  location               = azurerm_resource_group.rg.location
  resource_group_name    = azurerm_resource_group.rg.name
  administrator_login    = var.db_admin_user
  administrator_password = var.db_admin_password
  version                = var.db_version
  sku_name               = var.db_sku_name
  storage_mb             = var.db_storage_mb
  zone                   = 1
  backup_retention_days  = 7
  tags                   = local.common_tags
}

resource "azurerm_postgresql_flexible_server_configuration" "extensions" {
  name      = "azure.extensions"
  server_id = azurerm_postgresql_flexible_server.db.id
  value     = "POSTGIS"
}

resource "azurerm_postgresql_flexible_server_database" "appdb" {
  name      = var.db_name
  server_id = azurerm_postgresql_flexible_server.db.id
  charset   = "UTF8"
  collation = "en_US.utf8"
}

resource "azurerm_postgresql_flexible_server_firewall_rule" "allow_public_range" {
  name             = "allow-public-range"
  server_id        = azurerm_postgresql_flexible_server.db.id
  start_ip_address = var.db_firewall_start_ip
  end_ip_address   = var.db_firewall_end_ip
}

# Redis cache for cross-replica and warm-restart persistence of API cache keys
resource "azurerm_redis_cache" "cache" {
  count = var.enable_redis ? 1 : 0

  name                = substr(replace("redis-${local.suffix}", "-", ""), 0, 63)
  location            = azurerm_resource_group.rg.location
  resource_group_name = azurerm_resource_group.rg.name
  capacity            = var.redis_capacity
  family              = var.redis_family
  sku_name            = var.redis_sku_name

  minimum_tls_version  = "1.2"
  non_ssl_port_enabled = false

  tags = local.common_tags
}

resource "random_string" "sa_suffix" {
  length  = 6
  special = false
  upper   = false
}

# Storage Account for frontend static site
resource "azurerm_storage_account" "sa" {
  name                            = substr(replace("st${local.suffix}${random_string.sa_suffix.result}", "-", ""), 0, 24)
  resource_group_name             = azurerm_resource_group.rg.name
  location                        = azurerm_resource_group.rg.location
  account_tier                    = "Standard"
  account_replication_type        = "LRS"
  allow_nested_items_to_be_public = true

  dynamic "custom_domain" {
    for_each = var.storage_custom_domain != null && trimspace(var.storage_custom_domain) != "" ? [1] : []
    content {
      name          = var.storage_custom_domain
      use_subdomain = var.storage_custom_domain_use_subdomain
    }
  }

  tags = local.common_tags
}

resource "azurerm_storage_account_static_website" "static" {
  storage_account_id = azurerm_storage_account.sa.id
  index_document     = "index.html"
  error_404_document = "index.html"
}

# Secrets
resource "random_password" "django_secret_key" {
  length  = 50
  special = true
}

# Backend Container App
resource "azurerm_container_app" "backend" {
  name                         = "aca-backend-${local.name_prefix}"
  container_app_environment_id = azurerm_container_app_environment.aca_env.id
  resource_group_name          = azurerm_resource_group.rg.name
  revision_mode                = "Single"

  ingress {
    external_enabled = true
    target_port      = 8000
    transport        = "auto"

    traffic_weight {
      percentage      = 100
      latest_revision = true
    }
  }

  registry {
    server               = azurerm_container_registry.acr.login_server
    username             = azurerm_container_registry.acr.admin_username
    password_secret_name = "acr-password"
  }

  secret {
    name  = "acr-password"
    value = azurerm_container_registry.acr.admin_password
  }

  secret {
    name  = "django-secret-key"
    value = random_password.django_secret_key.result
  }

  secret {
    name  = "postgres-password"
    value = var.db_admin_password
  }

  dynamic "secret" {
    for_each = var.enable_redis ? [1] : []
    content {
      name  = "redis-url"
      value = local.redis_connection_string
    }
  }

  template {
    min_replicas = 0
    max_replicas = 10

    http_scale_rule {
      name                = "http-concurrency"
      concurrent_requests = 50
    }

    custom_scale_rule {
      name             = "cpu-utilization"
      custom_rule_type = "cpu"
      metadata = {
        type  = "Utilization"
        value = "70"
      }
    }

    container {
      name   = "backend"
      image  = "${azurerm_container_registry.acr.login_server}/edu-brazil-backend:${var.backend_image_tag}"
      cpu    = 2.0
      memory = "4Gi"

      env {
        name        = "DJANGO_SECRET_KEY"
        secret_name = "django-secret-key"
      }
      env {
        name  = "DJANGO_DEBUG"
        value = local.django_debug
      }
      env {
        name  = "DJANGO_SETTINGS_MODULE"
        value = var.django_settings_module
      }
      env {
        name  = "ALLOWED_HOSTS"
        value = var.backend_allowed_hosts
      }
      env {
        name  = "CORS_ALLOWED_ORIGINS"
        value = var.frontend_cors_origin
      }
      env {
        name  = "CSRF_TRUSTED_ORIGINS"
        value = var.csrf_trusted_origins
      }
      env {
        name  = "DATABASE_URL"
        value = "postgres://${var.db_admin_user}:${var.db_admin_password}@${azurerm_postgresql_flexible_server.db.fqdn}:5432/${var.db_name}?sslmode=require"
      }
      env {
        name  = "API_FRONTEND_ONLY_ENFORCED"
        value = var.api_frontend_only_enforced
      }
      env {
        name  = "API_FRONTEND_ONLY_ALLOWED_ORIGINS"
        value = var.frontend_cors_origin
      }
      env {
        name  = "API_FRONTEND_ONLY_PATH_PREFIXES"
        value = var.api_frontend_only_path_prefixes
      }
      env {
        name  = "API_THROTTLE_ANON_RATE"
        value = var.api_throttle_anon_rate
      }
      env {
        name  = "DJANGO_CACHE_BACKEND"
        value = var.enable_redis ? "redis" : "locmem"
      }
      env {
        name  = "DJANGO_CACHE_DEFAULT_TIMEOUT_SECONDS"
        value = "900"
      }
      env {
        name  = "DJANGO_CACHE_KEY_PREFIX"
        value = "edu-brazil"
      }

      dynamic "env" {
        for_each = var.enable_redis ? [1] : []
        content {
          name        = "REDIS_URL"
          secret_name = "redis-url"
        }
      }
    }
  }

  tags = local.common_tags
}
