# Infrastructure as Code (Azure) — Terraform

This folder provisions Azure resources for the full-stack app using Terraform.

## ⚡ Status

✅ **Production Infrastructure Deployed**
- Resource Group: `rg-edubrazilweb-prod`
- All resources provisioned and running
- Automated CI/CD connected via GitHub Actions

## ⚡ Quick Start

For a complete guide, see [docs/SIMPLIFIED_DEPLOYMENT.md](../docs/SIMPLIFIED_DEPLOYMENT.md)

```bash
cd infra
terraform init
terraform plan -var-file=prod.tfvars
terraform apply -var-file=prod.tfvars
```

## 🏗️ What Gets Created

- Resource Group: `rg-edubrazilweb-prod`
- Azure Container Registry (ACR): For Docker images
- Log Analytics Workspace: For monitoring
- Container Apps Environment: Managed container hosting
- Azure Container App: Backend API
- PostgreSQL Flexible Server: Database with PostGIS
- Azure Cache for Redis: Persistent backend cache for heavy API responses
- Azure Storage: Static website for frontend

## 📋 Configuration

Edit `prod.tfvars` to customize:
- Location (default: brazilsouth)
- Database size and SKU
- Redis cache sizing (`enable_redis`, `redis_sku_name`, `redis_family`, `redis_capacity`)
- Backend rollout pinning and host policy (`backend_image_tag`, `backend_allowed_hosts`)
- Frontend custom domain reconciliation (`storage_custom_domain`, `storage_custom_domain_use_subdomain`)
- Tags and naming

## 🚀 After Infrastructure Setup

1. **Build and push backend image to ACR**
2. **Enable PostGIS extensions on database**
3. **Run database migrations**
4. **Build and upload frontend to Storage**

See [docs/SIMPLIFIED_DEPLOYMENT.md](../docs/SIMPLIFIED_DEPLOYMENT.md) for detailed steps.

## 🔧 Common Commands

```bash
# View outputs (ACR name, URLs, etc.)
terraform output

# Update infrastructure
terraform apply -var-file=prod.tfvars

# Destroy resources (careful!)
terraform destroy -var-file=prod.tfvars
```

## 📝 Notes

- Initial setup uses public endpoints for simplicity
- PostGIS extensions must be enabled manually after DB creation
- Container App auto-scales from 0-10 replicas based on load
- Consider VNet integration for production security
