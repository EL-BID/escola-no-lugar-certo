# Azure Deployment Strategy for edu-brazil-web

This document describes a practical, production-ready deployment strategy on Azure for the full-stack application (GeoDjango backend + React/Vite frontend), using Terraform for infrastructure-as-code.

## Overview

- Infrastructure: Azure Resource Group, Azure Container Registry (ACR), Azure Container Apps (backend), Azure Database for PostgreSQL Flexible Server (with PostGIS), Azure Storage Static Website (frontend), Log Analytics.
- Container images: Build locally or in CI, push to ACR.
- Backend: Deployed as a container in Azure Container Apps, configured via environment variables and secrets.
- Frontend: Deployed to Azure Storage Static Website (optionally fronted by CDN); served over HTTPS.
- State: Terraform-managed; per-environment tfvars for local/prod.

## Architecture

- Resource Group: One per environment (`rg-edu-brazil-<env>-<region>`).
- Networking: Public endpoints to simplify initial rollout. You can later migrate PostgreSQL to VNet + ACA VNet integration.
- Observability: Log Analytics workspace connected to Container Apps environment.
- Security: System-assigned identity for Container App; secrets (like Django SECRET_KEY, DB password) stored in Container App as secrets, not in code.

## Prerequisites

- Azure subscription and permissions to create resources.
- CLI tooling: Azure CLI, Terraform (>= 1.5), Docker, and Bun/npm for frontend build.
- A Django container image (see Backend Dockerfile example below) and a frontend build step.

## Infrastructure with Terraform

Terraform files live in `infra/` and provision:

- Azure Resource Group
- Azure Container Registry (ACR)
- Log Analytics Workspace + Container Apps Environment
- Azure Container App (backend) with external ingress on port 8000
- PostgreSQL Flexible Server + database and firewall rules
- Azure Cache for Redis (optional, enabled by default)
- Azure Storage Account with Static Website for the frontend

Environments are configured via `*.tfvars` (examples included):
- `local.tfvars` — developer sandbox
- `prod.tfvars` — production

Basic workflow:

```bash
# From repo root
cd infra
terraform init
terraform plan -var-file=prod.tfvars
terraform apply -var-file=prod.tfvars
```

Outputs will include:
- ACR login server
- Container App FQDN for the backend API
- Static website endpoint for the frontend
- PostgreSQL server host and database name

## Safe Production Rollout (Data Protection First)

Use this runbook when deploying Redis/cache wiring and related container app settings.

### 1) Pre-Deploy Guardrails

```bash
cd infra

# Validate syntax
terraform validate

# Create a full plan file (reconciled production settings)
terraform plan -var-file=prod.tfvars -out=tfplan.reconciled-full

# Optional: archive plan file under docs evidence
mv tfplan.reconciled-full ../docs/reengineering/idb-stability-fix/artifacts/terraform-plans/
```

### 2) Hard Data-Safety Checks (Must Pass)

```bash
# Parse saved plan and ensure no delete/replace actions
terraform show -json ../docs/reengineering/idb-stability-fix/artifacts/terraform-plans/tfplan.reconciled-full > /tmp/tfplan.reconciled-full.json
jq '[.resource_changes[] | select((.change.actions | index("delete")) or (.change.actions | index("replace")))] | length' /tmp/tfplan.reconciled-full.json

# Confirm DB and Storage are no-op
jq -r '.resource_changes[] | select((.address=="azurerm_postgresql_flexible_server.db") or (.address=="azurerm_postgresql_flexible_server_database.appdb") or (.address=="azurerm_storage_account.sa")) | "\(.address) :: \(.change.actions|join(","))"' /tmp/tfplan.reconciled-full.json
```

Expected results:
- destructive action count = `0`
- DB and Storage actions = `no-op`

### 3) Backup and Recovery Anchors

```bash
# Save current terraform state snapshot
terraform state pull > /tmp/infra.state.before.json

# Save current outputs for reference
terraform output -json > /tmp/infra.outputs.before.json

# Capture UTC timestamp for PostgreSQL point-in-time restore anchor
date -u +"%Y-%m-%dT%H:%M:%SZ"
```

Notes:
- Azure PostgreSQL Flexible Server already keeps automated backups according to retention settings.
- The UTC timestamp above is your rollback restore anchor if recovery is needed.

### 4) Apply the Reviewed Plan (Not Fresh Apply)

```bash
terraform apply ../docs/reengineering/idb-stability-fix/artifacts/terraform-plans/tfplan.reconciled-full
```

Applying a reviewed plan file prevents accidental drift-driven changes from a newly generated plan.

### 5) Post-Deploy Validation

```bash
# Backend health (API gate enforces frontend origin; include an approved Origin header)
curl -s -o /dev/null -w "health=%{http_code} total_s=%{time_total}\n" \
  -H "Origin: https://escolanolugarcerto.iadb.org" \
  https://aca-backend-edubrazilweb-prod.wonderfulpond-07f886cb.eastus2.azurecontainerapps.io/api/v1/health/

# Redis outputs
terraform output redis_enabled
terraform output redis_hostname
terraform output redis_ssl_port
```

### 6) Precompute Critical Hexagon Rollups

```bash
az containerapp exec \
  --name aca-backend-edubrazilweb-prod \
  --resource-group rg-edubrazilweb-prod \
  --command "python manage.py precompute_hexagon_rollups --state-code 13 --state-code 15"

az containerapp exec \
  --name aca-backend-edubrazilweb-prod \
  --resource-group rg-edubrazilweb-prod \
  --command "python manage.py precompute_hexagon_rollups --state-code 15 --municipality-code 1500602 --resolution 5 --resolution 6 --resolution 7"
```

Rollups are stored in PostgreSQL and are required for coarse map resolutions.
Redis cache warming is not a substitute for this step.

### 7) Rollback (No Data Deletion)

If behavior is degraded, switch backend cache mode back to local memory quickly:

```bash
az containerapp update \
  --name aca-backend-edubrazilweb-prod \
  --resource-group rg-edubrazilweb-prod \
  --set-env-vars DJANGO_CACHE_BACKEND=locmem
```

If database recovery is ever required, restore PostgreSQL using point-in-time restore anchored to the recorded UTC timestamp.

## Building and Pushing the Backend Image

You can build/push locally or via CI (e.g., GitHub Actions). Replace placeholders with actual values from `terraform output`.

```bash
# Login to Azure and ACR
az acr login --name <acr_name>

# Build image (run at repo root, where Dockerfile is present)
docker build -t <acr_login_server>/edu-brazil-backend:<tag> -f backend/Dockerfile .

# Push to ACR
docker push <acr_login_server>/edu-brazil-backend:<tag>
```

Update `backend_image_tag` in your tfvars (or set it via `-var`) and re-apply Terraform to roll out the new image to Container Apps.

### Backend Dockerfile (reference)

You can adapt from the PRD (GeoDjango + Gunicorn), for example:

```
# backend/Dockerfile
FROM python:3.11-slim

RUN apt-get update && apt-get install -y \
    binutils libproj-dev gdal-bin gcc \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY backend/requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

# Copy backend code
COPY backend/ /app/

# Pre-collect static files (served by WhiteNoise inside container)
# If settings guard collectstatic with env, ensure STATIC_ROOT is set
RUN python manage.py collectstatic --noinput || true

EXPOSE 8000
CMD ["gunicorn", "geo_edu_brazil.wsgi:application", "--bind", "0.0.0.0:8000", "--workers", "4"]
```

Note: adjust paths if your `requirements.txt` lives elsewhere; install OS dependencies for GeoDjango.

## Deploying the Frontend

1) Build locally (from `frontend/`):

```bash
bun install
bun run build
```

2) Upload build output (`frontend/dist`) to the Storage Static Website (replace resource group and account name):

```bash
# Get storage account name from terraform outputs
az storage blob upload-batch \
  --account-name <storage_account_name> \
  -d '$web' \
  -s frontend/dist
```

3) Point your DNS to the static website endpoint or attach Azure CDN (optional; toggle via Terraform variable in the future).

## Database Initialization

Enable PostGIS extensions after the PostgreSQL server is created:

```sql
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS postgis_raster;
CREATE EXTENSION IF NOT EXISTS postgis_topology;
```

Apply Django migrations and (optionally) load data:

```bash
# Exec into the running container app (requires Azure CLI extension)
az containerapp exec \
  --name <container_app_name> \
  --resource-group <rg_name> \
  --command "/bin/sh -lc 'python manage.py migrate && python manage.py collectstatic --noinput'"
```

## Django Settings: Production and Local

There are two good patterns you can choose from. If you prefer to avoid code changes now, use Pattern A. For a cleaner long-term approach, use Pattern B.

### Pattern A: Single settings module with environment variables

- Keep using `geo_edu_brazil/settings.py`.
- Drive differences via env vars (12-factor):
  - `DJANGO_DEBUG` (true/false)
  - `DJANGO_SECRET_KEY`
  - `ALLOWED_HOSTS` (comma-separated)
  - `CORS_ALLOWED_ORIGINS` (comma-separated)
  - `CSRF_TRUSTED_ORIGINS` (comma-separated, including https://<frontend-domain>)
  - `DATABASE_URL` (e.g., `postgres://user:pass@host:5432/dbname?sslmode=require`)
  - `DJANGO_SECURE_SSL_REDIRECT` (true/false)
  - `DJANGO_LOG_LEVEL` (INFO/WARN/DEBUG)

Recommended defaults per environment:

- Local
  - `DJANGO_DEBUG=true`
  - `ALLOWED_HOSTS=localhost,127.0.0.1`
  - `CORS_ALLOWED_ORIGINS=http://localhost:5173`
  - `DATABASE_URL=postgres://...` (or SQLite if you keep a dev-only fallback)

- Production
  - `DJANGO_DEBUG=false`
  - `ALLOWED_HOSTS=<prod-api-domain>`
  - `CORS_ALLOWED_ORIGINS=https://<prod-frontend-domain>`
  - `CSRF_TRUSTED_ORIGINS=https://<prod-frontend-domain>`
  - `SECURE_SSL_REDIRECT=true`

If the project already uses `python-decouple`, read env vars via `config('VAR', default=...)`. For `DATABASE_URL`, use `dj-database-url` or equivalent to parse into `DATABASES['default']`.

### Pattern B: Split settings modules

Create:

- `geo_edu_brazil/settings/base.py` — common settings
- `geo_edu_brazil/settings/local.py` — imports from base; `DEBUG=True` and local DB
- `geo_edu_brazil/settings/production.py` — hardened security, production hosts

Set `DJANGO_SETTINGS_MODULE` per environment:

- Local: `geo_edu_brazil.settings.local`
- Production: `geo_edu_brazil.settings.production`

If you go with Pattern B, reflect that choice in the Container App env var `DJANGO_SETTINGS_MODULE` and ensure each settings module reads sensitive values from environment variables.

## Environment Variables (Container App)

Terraform sets or expects the following (see `infra/main.tf`):

- Secrets
  - `DJANGO_SECRET_KEY` — generated if not provided
  - `POSTGRES_PASSWORD`
- Public env vars
  - `DJANGO_DEBUG` — false for production
  - `ALLOWED_HOSTS` — includes the Container App FQDN; customize as needed
  - `CORS_ALLOWED_ORIGINS` — set to your frontend endpoint
  - `CSRF_TRUSTED_ORIGINS` — set to your frontend endpoint
  - `DATABASE_URL` — constructed from DB outputs with `sslmode=require`
  - `DJANGO_SETTINGS_MODULE` — defaults to `geo_edu_brazil.settings` (Pattern A)

You can override any of these in tfvars.

Cache-related env vars provisioned by Terraform:
- `DJANGO_CACHE_BACKEND` (`redis` when `enable_redis=true`, else `locmem`)
- `DJANGO_CACHE_DEFAULT_TIMEOUT_SECONDS` (default `900`)
- `DJANGO_CACHE_KEY_PREFIX` (default `edu-brazil`)
- `REDIS_URL` (secret, injected only when Redis is enabled)

Ingress timeout ceiling to keep in mind:
- Azure Container Apps HTTP ingress has a request timeout of 240 seconds.
- Raising Gunicorn above 240 seconds can help backend processing, but it does not override the Container Apps ingress limit for browser-facing requests.
- For user-visible flows that can exceed 240 seconds, prefer progressive loading, background jobs, or polling instead of a single synchronous HTTP response.

## Rollout & Updates

- Backend: bump the image tag, push to ACR, update `backend_image_tag` and `terraform apply` to roll the revision.
- Frontend: build and upload to storage website; cache-bust with hashes in build filenames.

## CI/CD with GitHub Actions

✅ **Implemented!** The project now includes a comprehensive CI/CD pipeline using GitHub Actions.

### Workflows

- **deploy-production.yml**: Automatically deploys to production when pushing to `main` branch  
- **pr-checks.yml**: Runs tests and validation on all pull requests

### Key Features

- Automated backend Docker image build and push to ACR
- Automatic Container App updates with new images
- Frontend build and deployment to Azure Storage
- Database migration execution
- Parallel test execution for backend and frontend
- Deployment summaries with URLs and status

### Setup Guide

See [CI_CD_SETUP.md](./CI_CD_SETUP.md) for complete instructions on:
- Configuring GitHub Secrets
- Setting up branch strategy
- Service principal creation
- First-time deployment
- Troubleshooting

## Hardening & Next Steps

- Private networking: move PostgreSQL into a delegated subnet and integrate Container Apps into the same VNet.
- Redis cache: add Azure Cache for Redis and wire Django cache backend.
- Redis cache is now provisioned through Terraform (`enable_redis`) and wired to backend env/secret injection.
- WAF/CDN: front the frontend with Azure CDN + custom domain + SSL; front the backend with Front Door if exposing public APIs.
- Observability: add Application Insights / OpenTelemetry exporters.
- Approval gates: configure GitHub Environments with manual approval for production deployments.
- Automated testing: expand test coverage and add integration/E2E tests to CI pipeline.
