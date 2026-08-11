output "resource_group_name" {
  value = azurerm_resource_group.rg.name
}

output "location" {
  value = azurerm_resource_group.rg.location
}

output "acr_login_server" {
  value = azurerm_container_registry.acr.login_server
}

output "backend_container_app_fqdn" {
  value = azurerm_container_app.backend.latest_revision_fqdn
}

output "postgres_fqdn" {
  value = azurerm_postgresql_flexible_server.db.fqdn
}

output "postgres_database" {
  value = azurerm_postgresql_flexible_server_database.appdb.name
}

output "storage_account_name" {
  value = azurerm_storage_account.sa.name
}

output "static_website_primary_endpoint" {
  value = azurerm_storage_account_static_website.static
}

output "redis_enabled" {
  value = var.enable_redis
}

output "redis_hostname" {
  value = var.enable_redis ? azurerm_redis_cache.cache[0].hostname : null
}

output "redis_ssl_port" {
  value = var.enable_redis ? azurerm_redis_cache.cache[0].ssl_port : null
}