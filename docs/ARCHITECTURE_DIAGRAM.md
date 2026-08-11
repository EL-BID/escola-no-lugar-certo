# Azure Architecture Diagram - Edu Brazil Web Platform

## Overview
This document describes the production architecture deployed on Microsoft Azure for the Edu Brazil Web Platform, a GeoDjango-based education data visualization system.

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              Azure Cloud (Brazil South)                      │
│                                                                              │
│  ┌────────────────────────────────────────────────────────────────────────┐ │
│  │                    Resource Group: rg-edubrazilweb-prod                │ │
│  │                                                                          │ │
│  │  ┌──────────────────────────────────────────────────────────────────┐  │ │
│  │  │                         Frontend Layer                            │  │ │
│  │  │                                                                    │  │ │
│  │  │  ┌──────────────────────────────────────────────────────────┐    │  │ │
│  │  │  │  Azure Storage Account (stedubrazilwebprod)             │    │  │ │
│  │  │  │  ┌────────────────────────────────────────────────┐     │    │  │ │
│  │  │  │  │  Static Website Hosting                       │     │    │  │ │
│  │  │  │  │  - React + TypeScript + Vite                  │     │    │  │ │
│  │  │  │  │  - Leaflet Maps (Hexagon Visualization)       │     │    │  │ │
│  │  │  │  │  - Tailwind CSS + shadcn/ui                   │     │    │  │ │
│  │  │  │  │  - index.html, error_404 → index.html         │     │    │  │ │
│  │  │  │  └────────────────────────────────────────────────┘     │    │  │ │
│  │  │  │                                                          │    │  │ │
│  │  │  │  Public Endpoint: https://[storage-account].z15...     │    │  │ │
│  │  │  └──────────────────────────────────────────────────────────┘    │  │ │
│  │  │                              │                                    │  │ │
│  │  │                              │ HTTPS API Calls                    │  │ │
│  │  │                              ▼                                    │  │ │
│  │  └──────────────────────────────────────────────────────────────────┘  │ │
│  │                                                                          │ │
│  │  ┌──────────────────────────────────────────────────────────────────┐  │ │
│  │  │                      Application Layer                            │  │ │
│  │  │                                                                    │  │ │
│  │  │  ┌──────────────────────────────────────────────────────────┐    │  │ │
│  │  │  │  Container App Environment (acae-edubrazilweb-prod)     │    │  │ │
│  │  │  │                                                          │    │  │ │
│  │  │  │  ┌────────────────────────────────────────────────┐     │    │  │ │
│  │  │  │  │  Container App: aca-backend-edubrazilweb-prod │     │    │  │ │
│  │  │  │  │                                               │     │    │  │ │
│  │  │  │  │  Image: edu-brazil-backend:latest             │     │    │  │ │
│  │  │  │  │  Resources: 0.5 CPU, 1Gi Memory               │     │    │  │ │
│  │  │  │  │  Port: 8000                                   │     │    │  │ │
│  │  │  │  │                                               │     │    │  │ │
│  │  │  │  │  ┌─────────────────────────────────────┐      │     │    │  │ │
│  │  │  │  │  │  Django + GeoDjango Backend       │      │     │    │  │ │
│  │  │  │  │  │  - Django REST Framework          │      │     │    │  │ │
│  │  │  │  │  │  - PostGIS Integration            │      │     │    │  │ │
│  │  │  │  │  │  - Education Data API             │      │     │    │  │ │
│  │  │  │  │  │  - Geospatial Query Engine        │      │     │    │  │ │
│  │  │  │  │  │  - H3 Hexagon Aggregation         │      │     │    │  │ │
│  │  │  │  │  └─────────────────────────────────────┘      │     │    │  │ │
│  │  │  │  │                                               │     │    │  │ │
│  │  │  │  │  Environment Variables:                       │     │    │  │ │
│  │  │  │  │  - DJANGO_SECRET_KEY (from secrets)           │     │    │  │ │
│  │  │  │  │  - DATABASE_URL (PostgreSQL connection)       │     │    │  │ │
│  │  │  │  │  - DJANGO_DEBUG=false                         │     │    │  │ │
│  │  │  │  │  - CORS_ALLOWED_ORIGINS=*                     │     │    │  │ │
│  │  │  │  │  - ALLOWED_HOSTS=*                            │     │    │  │ │
│  │  │  │  └────────────────────────────────────────────────┘     │    │  │ │
│  │  │  │                                                          │    │  │ │
│  │  │  │  Public Endpoint: https://aca-backend-...azurecontainer │    │  │ │
│  │  │  │                                                          │    │  │ │
│  │  │  │  ┌────────────────────────────────────────────────┐     │    │  │ │
│  │  │  │  │  Log Analytics Workspace                       │     │    │  │ │
│  │  │  │  │  (law-edubrazilweb-prod)                       │     │    │  │ │
│  │  │  │  │  - Retention: 30 days                          │     │    │  │ │
│  │  │  │  │  - Application Logs & Metrics                  │     │    │  │ │
│  │  │  │  └────────────────────────────────────────────────┘     │    │  │ │
│  │  │  └──────────────────────────────────────────────────────────┘    │  │ │
│  │  │                              │                                    │  │ │
│  │  │                              │ PostgreSQL Protocol (SSL)          │  │ │
│  │  │                              ▼                                    │  │ │
│  │  └──────────────────────────────────────────────────────────────────┘  │ │
│  │                                                                          │ │
│  │  ┌──────────────────────────────────────────────────────────────────┐  │ │
│  │  │                        Database Layer                             │  │ │
│  │  │                                                                    │  │ │
│  │  │  ┌──────────────────────────────────────────────────────────┐    │  │ │
│  │  │  │  PostgreSQL Flexible Server                             │    │  │ │
│  │  │  │  (pg-edubrazilweb-prod)                                 │    │  │ │
│  │  │  │                                                          │    │  │ │
│  │  │  │  Version: 13                                             │    │  │ │
│  │  │  │  SKU: B_Standard_B1ms                                    │    │  │ │
│  │  │  │  Storage: 64 GB (65536 MB)                               │    │  │ │
│  │  │  │  Availability Zone: 1                                    │    │  │ │
│  │  │  │  Backup Retention: 7 days                                │    │  │ │
│  │  │  │                                                          │    │  │ │
│  │  │  │  ┌────────────────────────────────────────────────┐     │    │  │ │
│  │  │  │  │  Database: geo_prod                           │     │    │  │ │
│  │  │  │  │  - PostGIS Extension Enabled                  │     │    │  │ │
│  │  │  │  │  - Education Data Tables                      │     │    │  │ │
│  │  │  │  │  - Geographic Data (States, Cities)           │     │    │  │ │
│  │  │  │  │  - School Data                                │     │    │  │ │
│  │  │  │  │  - H3 Hexagon Aggregations                    │     │    │  │ │
│  │  │  │  │  Charset: UTF8, Collation: en_US.utf8         │     │    │  │ │
│  │  │  │  └────────────────────────────────────────────────┘     │    │  │ │
│  │  │  │                                                          │    │  │ │
│  │  │  │  Firewall: Public IP range allowed                       │    │  │ │
│  │  │  │  SSL Mode: Required                                      │    │  │ │
│  │  │  └──────────────────────────────────────────────────────────┘    │  │ │
│  │  └──────────────────────────────────────────────────────────────────┘  │ │
│  │                                                                          │ │
│  │  ┌──────────────────────────────────────────────────────────────────┐  │ │
│  │  │                    Container Registry                             │  │ │
│  │  │                                                                    │  │ │
│  │  │  ┌──────────────────────────────────────────────────────────┐    │  │ │
│  │  │  │  Azure Container Registry                               │    │  │ │
│  │  │  │  (acredubrazilwebprod)                                  │    │  │ │
│  │  │  │                                                          │    │  │ │
│  │  │  │  SKU: Basic                                              │    │  │ │
│  │  │  │  Admin Enabled: true                                     │    │  │ │
│  │  │  │                                                          │    │  │ │
│  │  │  │  Container Images:                                       │    │  │ │
│  │  │  │  - edu-brazil-backend:latest                             │    │  │ │
│  │  │  │                                                          │    │  │ │
│  │  │  │  ┌────────────────────────────────────────────────┐     │    │  │ │
│  │  │  │  │  Built from: /backend/Dockerfile              │     │    │  │ │
│  │  │  │  │  Base: Python 3.11                            │     │    │  │ │
│  │  │  │  │  Includes: Django, PostGIS, gunicorn          │     │    │  │ │
│  │  │  │  └────────────────────────────────────────────────┘     │    │  │ │
│  │  │  └──────────────────────────────────────────────────────────┘    │  │ │
│  │  └──────────────────────────────────────────────────────────────────┘  │ │
│  │                                                                          │ │
│  └────────────────────────────────────────────────────────────────────────┘ │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘

                                     ▲
                                     │
                                     │ HTTPS
                                     │
                        ┌────────────┴────────────┐
                        │   End Users / Clients   │
                        │   - Web Browsers        │
                        │   - API Consumers       │
                        └─────────────────────────┘
```

## Component Details

### 1. Frontend Layer
**Azure Storage Account with Static Website Hosting**
- **Name**: `stedubrazilwebprod` (24 chars max, no hyphens)
- **Type**: Standard LRS (Locally Redundant Storage)
- **Technology Stack**:
  - React 18 with TypeScript
  - Vite build tool
  - Leaflet.js for interactive maps
  - Tailwind CSS + shadcn/ui component library
  - Zustand for state management
- **Features**:
  - SPA routing with fallback to `index.html`
  - H3 hexagon-based data visualization
  - Interactive education analytics dashboard
  - Responsive design for mobile/desktop
- **Configuration**:
  - Index document: `index.html`
  - 404 fallback: `index.html` (for client-side routing)
  - Public blob access enabled

### 2. Application Layer
**Azure Container Apps Environment**
- **Name**: `acae-edubrazilweb-prod`
- **Monitoring**: Integrated with Log Analytics Workspace
- **Retention**: 30 days of logs and metrics

**Backend Container App**
- **Name**: `aca-backend-edubrazilweb-prod`
- **Image**: `acredubrazilwebprod.azurecr.io/edu-brazil-backend:latest`
- **Resources**:
  - CPU: 0.5 cores
  - Memory: 1 GiB
- **Ingress**:
  - External access enabled
  - Port: 8000
  - Transport: Auto (HTTP/HTTP2)
  - Traffic: 100% to latest revision
- **Technology Stack**:
  - Django 4.x with GeoDjango
  - Django REST Framework
  - PostGIS spatial database adapter
  - H3 (Uber's Hexagonal Hierarchical Spatial Index)
  - Python 3.11
  - Gunicorn WSGI server
- **Environment Configuration**:
  - `DJANGO_SECRET_KEY`: Auto-generated 50-char secure key
  - `DJANGO_DEBUG`: false (production mode)
  - `DJANGO_SETTINGS_MODULE`: `geo_edu_brazil.settings`
  - `ALLOWED_HOSTS`: `*` (all hosts)
  - `CORS_ALLOWED_ORIGINS`: `*` (all origins)
  - `CSRF_TRUSTED_ORIGINS`: Matches frontend origin
  - `DATABASE_URL`: PostgreSQL connection string with SSL
- **Security**:
  - Secrets stored in Container App secrets
  - Registry authentication via admin credentials
  - SSL/TLS enforced for database connections

### 3. Database Layer
**PostgreSQL Flexible Server**
- **Name**: `pg-edubrazilweb-prod`
- **Version**: PostgreSQL 13
- **SKU**: B_Standard_B1ms (Burstable, 1 vCore, 2 GiB RAM)
- **Storage**: 64 GB (65,536 MB)
- **High Availability**: Single zone (Availability Zone 1)
- **Backup**: 7-day retention
- **Database**: `geo_prod`
  - Charset: UTF8
  - Collation: en_US.utf8
- **Extensions**:
  - PostGIS (spatial database)
  - pg_trgm (trigram matching)
- **Data Model**:
  - States and municipalities with geometries
  - Schools with geospatial coordinates
  - Education statistics (enrollment, infrastructure)
  - Pre-computed H3 hexagon aggregations (resolutions 5-9)
- **Security**:
  - Firewall rules for public access (configurable IP ranges)
  - SSL mode required
  - Admin credentials stored securely

### 4. Container Registry
**Azure Container Registry**
- **Name**: `acredubrazilwebprod`
- **SKU**: Basic
- **Admin Access**: Enabled
- **Images**:
  - `edu-brazil-backend:latest`
- **Build Source**: `/backend/Dockerfile`
- **Base Image**: Python 3.11-slim
- **Dependencies**:
  - GDAL/GEOS/PROJ (geospatial libraries)
  - PostGIS database adapter
  - Django and DRF
  - H3 Python bindings

### 5. Monitoring & Logging
**Log Analytics Workspace**
- **Name**: `law-edubrazilweb-prod`
- **SKU**: PerGB2018 (pay-as-you-go)
- **Retention**: 30 days
- **Data Collection**:
  - Container application logs
  - HTTP request/response metrics
  - Performance counters
  - Custom application telemetry

## Infrastructure as Code

### Technology
- **Tool**: Terraform
- **Provider**: Azure RM (azurerm)
- **State Management**: Local tfstate files

### Configuration Files
- `main.tf`: Resource definitions
- `variables.tf`: Input variable declarations
- `outputs.tf`: Output values (FQDNs, endpoints)
- `prod.tfvars`: Production environment values
- `providers.tf`: Azure provider configuration

### Key Variables
```hcl
project_name          = "edubrazilweb"
environment           = "prod"
location              = "brazilsouth"
db_admin_user         = "pgadmin"
db_name               = "geo_prod"
db_sku_name           = "B_Standard_B1ms"
frontend_cors_origin  = "*"
```

## Deployment Workflow

### 1. Infrastructure Provisioning
```bash
cd infra/
terraform init
terraform plan -out=tfplan -var-file=prod.tfvars
terraform apply tfplan
```

### 2. Container Image Build & Push
```bash
# Login to ACR
az acr login --name acredubrazilwebprod

# Build and push backend
cd backend/
docker build -t acredubrazilwebprod.azurecr.io/edu-brazil-backend:latest .
docker push acredubrazilwebprod.azurecr.io/edu-brazil-backend:latest
```

### 3. Frontend Deployment
```bash
cd frontend/
npm run build
az storage blob upload-batch \
  --account-name stedubrazilwebprod \
  --destination '$web' \
  --source dist/
```

### 4. Database Setup
```bash
# Run migrations
python manage.py migrate

# Import geospatial data
python manage.py import_geo_data

# Import education data
python manage.py import_education_data

# Generate hexagon aggregations
python manage.py generate_sample_hexagons
```

## Network & Security

### Traffic Flow
1. **User → Frontend**: Direct HTTPS to Azure Storage static website
2. **Frontend → Backend**: HTTPS API calls to Container App external endpoint
3. **Backend → Database**: PostgreSQL over SSL (port 5432)
4. **Container App → Registry**: Pulls images via admin credentials

### Security Features
- **SSL/TLS**: Enforced on all connections
- **Secrets Management**: Azure Container App secrets for sensitive data
- **Firewall**: Database firewall rules control access
- **CORS**: Configurable cross-origin policies
- **CSRF**: Django CSRF protection enabled

## Scalability & Performance

### Current Configuration (Production)
- **Backend**: 0.5 CPU, 1 GiB RAM, single replica
- **Database**: B_Standard_B1ms (burstable)
- **Frontend**: Standard LRS storage

### Scaling Strategy
- **Horizontal**: Add more Container App replicas
- **Vertical**: Increase CPU/memory per replica
- **Database**: Upgrade to General Purpose SKU for higher workloads
- **Storage**: Consider CDN for frontend static assets
- **Caching**: Redis cache for frequently accessed data

## Cost Optimization

### Resource Tiers
- **Container Registry**: Basic
- **Database**: Burstable B1ms (low baseline, can burst)
- **Storage**: Standard LRS (locally redundant)
- **Container Apps**: Pay per use (vCPU-second and GiB-second)
- **Log Analytics**: Pay per GB ingested

### Recommendations
- Use Azure Reserved Instances for production
- Implement auto-scaling rules
- Set up budget alerts
- Regular backup pruning
- Consider Azure Front Door for multi-region

## Key Endpoints

### Outputs from Deployment
```
resource_group_name           = rg-edubrazilweb-prod
location                      = brazilsouth
acr_login_server             = acredubrazilwebprod.azurecr.io
backend_container_app_fqdn   = aca-backend-edubrazilweb-prod.[region].azurecontainerapps.io
postgres_fqdn                = pg-edubrazilweb-prod.postgres.database.azure.com
postgres_database            = geo_prod
storage_account_name         = stedubrazilwebprod
static_website_primary_endpoint = https://stedubrazilwebprod.z15.web.core.windows.net/
```

## High-Level Data Flow

1. **User accesses application** → Azure Storage static website serves React SPA
2. **React app loads** → Initializes Leaflet map and UI components
3. **User interacts with map** → Frontend requests education data via API
4. **API call** → Backend Container App receives request
5. **Django processing** → GeoDjango queries PostGIS database
6. **Spatial query** → PostGIS returns aggregated H3 hexagon data
7. **Response** → Backend serializes data and returns JSON
8. **Visualization** → Frontend renders hexagons on map with color-coded metrics
9. **Logs** → All operations logged to Log Analytics Workspace

## Disaster Recovery

### Backup Strategy
- **Database**: Automated 7-day point-in-time restore
- **Container Images**: Stored in ACR with geo-replication option
- **Frontend Assets**: Can be redeployed from source control
- **Infrastructure**: Reproducible via Terraform

### Recovery Procedures
1. Database restore from automated backup
2. Container image pull from registry
3. Infrastructure recreation via `terraform apply`
4. Frontend redeployment from build

## Future Enhancements

- [ ] Azure Front Door for CDN and WAF
- [ ] Azure Key Vault for secret management
- [ ] Azure Monitor alerts and dashboards
- [ ] Multi-region deployment for HA
- [ ] Azure DevOps CI/CD pipelines
- [ ] Managed Identity authentication (remove admin credentials)
- [ ] Redis Cache for API response caching
- [ ] Database read replicas for query scaling

---

**Environment**: Production  
**Region**: Brazil South  
**Last Updated**: November 7, 2025  
**Terraform Version**: ~> 3.0  
**Azure Provider**: azurerm
