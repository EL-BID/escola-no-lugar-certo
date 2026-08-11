# Simplified Deployment Guide

## Overview

This project uses a **simplified deployment strategy**: 
- **main branch** → **production environment** on Azure

No staging environment. Keep it simple!

## Infrastructure Setup

### Prerequisites

- Azure CLI installed and logged in
- Terraform >= 1.5
- Docker installed locally
- Bun or npm for frontend builds

### Initial Deployment

1. **Configure production variables**

   Edit `infra/prod.tfvars` with your settings. The defaults are good to start.

2. **Initialize and apply Terraform**

   ```bash
   cd infra
   terraform init
   terraform plan -var-file=prod.tfvars
   terraform apply -var-file=prod.tfvars
   ```

   This creates:
   - Resource Group
   - Azure Container Registry (ACR)
   - Container Apps Environment
   - Container App for backend
   - PostgreSQL Flexible Server with PostGIS
   - Storage Account for frontend static site

3. **Get the outputs**

   ```bash
   terraform output
   ```

   Note down:
   - `acr_login_server` - your container registry URL
   - `backend_container_app_fqdn` - your API URL
   - `static_website_primary_endpoint` - your frontend URL

### Build and Deploy Backend

1. **Login to ACR**

   ```bash
   az acr login --name $(terraform output -raw acr_login_server | cut -d. -f1)
   ```

2. **Build and push the image**

   ```bash
   cd ../backend
   docker build -t $(cd ../infra && terraform output -raw acr_login_server)/edu-brazil-backend:latest .
   docker push $(cd ../infra && terraform output -raw acr_login_server)/edu-brazil-backend:latest
   ```

3. **Update the Container App** (first time only, then CI/CD handles it)

   ```bash
   az containerapp update \
     --name aca-backend-edubrazilweb-prod \
     --resource-group rg-edubrazilweb-prod \
     --image $(cd infra && terraform output -raw acr_login_server)/edu-brazil-backend:latest
   ```

4. **Run migrations**

   ```bash
   az containerapp exec \
     --name aca-backend-edubrazilweb-prod \
     --resource-group rg-edubrazilweb-prod \
     --command "python manage.py migrate --noinput"
   ```

### Deploy Frontend

1. **Build the frontend**

   ```bash
   cd frontend
   bun install
   VITE_API_URL=https://$(cd ../infra && terraform output -raw backend_container_app_fqdn) bun run build
   ```

2. **Upload to Azure Storage**

   ```bash
   az storage blob upload-batch \
     --account-name stedubrazilwebprod \
     --auth-mode key \
     -d '$web' \
     -s dist \
     --overwrite
   ```

## CI/CD Setup

### Required GitHub Secrets

Go to your GitHub repository → Settings → Secrets and variables → Actions

1. **AZURE_SUBSCRIPTION_ID**
   ```
   4ea61dcd-fb23-4fbb-9568-9d2109d1a088
   ```

2. **AZURE_CREDENTIALS_PROD**
   
   Create a service principal:
   ```bash
   az ad sp create-for-rbac \
     --name "github-actions-edubrazilweb-prod" \
     --role contributor \
     --scopes /subscriptions/4ea61dcd-fb23-4fbb-9568-9d2109d1a088/resourceGroups/rg-edubrazilweb-prod \
     --sdk-auth
   ```
   
   Copy the entire JSON output as the secret value.

### How CI/CD Works

Once secrets are configured:

1. **Push to main branch** → Automatic deployment to production
2. **Open a PR** → Runs tests and validation (no deployment)
3. **Manual trigger** → Go to Actions tab → Deploy to Production → Run workflow

The workflow:
- ✅ Runs backend tests
- 🐳 Builds and pushes Docker image to ACR
- 🚀 Deploys to Container Apps
- 🔄 Runs database migrations
- 🎨 Builds and deploys frontend
- 📊 Reports deployment status

## Daily Workflow

### Making Changes

```bash
# 1. Create a feature branch
git checkout -b feature/my-feature

# 2. Make your changes
# ... edit files ...

# 3. Test locally
cd backend && python manage.py test
cd ../frontend && bun run build

# 4. Commit and push
git add .
git commit -m "feat: add my feature"
git push origin feature/my-feature

# 5. Open a Pull Request to main
# GitHub will run tests automatically

# 6. After review, merge to main
# GitHub Actions will automatically deploy to production
```

### Quick Commands

**Check production logs:**
```bash
az containerapp logs show \
  --name aca-backend-edubrazilweb-prod \
  --resource-group rg-edubrazilweb-prod \
  --follow
```

**Run Django management commands:**
```bash
az containerapp exec \
  --name aca-backend-edubrazilweb-prod \
  --resource-group rg-edubrazilweb-prod \
  --command "python manage.py <command>"
```

**Update environment variables:**
```bash
az containerapp update \
  --name aca-backend-edubrazilweb-prod \
  --resource-group rg-edubrazilweb-prod \
  --set-env-vars "KEY=value"
```

## Rollback Strategy

If something breaks in production:

### Option 1: Revert the commit
```bash
git revert HEAD
git push origin main
# GitHub Actions will automatically deploy the previous version
```

### Option 2: Deploy a previous image
```bash
# List available images
az acr repository show-tags \
  --name acredubrazilwebprod \
  --repository edu-brazil-backend

# Deploy a specific tag
az containerapp update \
  --name aca-backend-edubrazilweb-prod \
  --resource-group rg-edubrazilweb-prod \
  --image acredubrazilwebprod.azurecr.io/edu-brazil-backend:<previous-tag>
```

## Monitoring

### Application URLs

After deployment, your app is available at:

- **Frontend**: Check Terraform output for `static_website_primary_endpoint`
- **Backend API**: Check Terraform output for `backend_container_app_fqdn`
- **Admin Panel**: `https://<backend-fqdn>/admin/`

### Azure Portal

Monitor your resources:
1. Go to [Azure Portal](https://portal.azure.com)
2. Navigate to Resource Group `rg-edubrazilweb-prod`
3. Check:
   - Container Apps → Logs
   - PostgreSQL → Monitoring
   - Storage Account → Metrics

## Troubleshooting

### Container App not starting

```bash
# Check logs
az containerapp logs show \
  --name aca-backend-edubrazilweb-prod \
  --resource-group rg-edubrazilweb-prod \
  --tail 100

# Check revisions
az containerapp revision list \
  --name aca-backend-edubrazilweb-prod \
  --resource-group rg-edubrazilweb-prod
```

### Database connection issues

```bash
# Test connection from container
az containerapp exec \
  --name aca-backend-edubrazilweb-prod \
  --resource-group rg-edubrazilweb-prod \
  --command "python manage.py check --database default"
```

### Frontend not updating

```bash
# Clear and re-upload
az storage blob delete-batch \
  --account-name stedubrazilwebprod \
  --source '$web'

cd frontend && bun run build
az storage blob upload-batch \
  --account-name stedubrazilwebprod \
  -d '$web' \
  -s dist \
  --overwrite
```

## Cost Optimization

Current setup is optimized for low cost:
- **Container App**: Scales to zero when not in use
- **Database**: B_Standard_B2s tier (can upgrade later)
- **Storage**: LRS (Locally Redundant Storage)

Estimated monthly cost: **~$50-80 USD** depending on usage

## Next Steps

Once comfortable with this setup, consider:

1. **Custom domain**: Add your own domain name
2. **CDN**: Add Azure CDN for better frontend performance
3. **SSL certificates**: Use Azure-managed SSL certificates
4. **Monitoring**: Add Application Insights
5. **Backups**: Configure automated database backups
6. **Scaling**: Adjust Container App scaling rules based on traffic

## Questions?

Check the detailed docs:
- [DEPLOYMENT_AZURE.md](./DEPLOYMENT_AZURE.md) - Original detailed guide
- [API_ENDPOINTS.md](./API_ENDPOINTS.md) - API documentation
- [ARCHITECTURE_DIAGRAM.md](./ARCHITECTURE_DIAGRAM.md) - System architecture

---

**Remember**: Push to `main` = Deploy to production. Keep it simple! 🚀
