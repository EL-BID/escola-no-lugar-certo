# CI/CD Setup Guide for edu-brazil-web

This guide will help you set up continuous integration and deployment using GitHub Actions for production.

## 📋 Overview

Your CI/CD pipeline is configured with:
- **Main Branch** → Automatic deployment to production environment
- **Pull Requests** → Automated testing and validation

## 🏗️ Simplified Branch Strategy

```
feature branches → main (production)
     ↓               ↓
   PR checks    Production Env
```

### Development Flow

1. Create feature branches from `main`
2. Open Pull Request to `main` (triggers tests)
3. After review and approval, merge to `main`
4. Automatic deployment to production

**No staging environment** - Keep it simple and iterate fast!


## 🔐 Required GitHub Secrets

You need to configure these secrets in your GitHub repository:

### Navigate to Settings
1. Go to your GitHub repository
2. Click **Settings** → **Secrets and variables** → **Actions**
3. Click **New repository secret**

### Required Secrets

#### 1. `AZURE_SUBSCRIPTION_ID`
Use `az account list` command to get the subscription ID and copy it as the secret value.

#### 2. `AZURE_CREDENTIALS_PROD`
Use `az ad sp create-for-rbac` command to create the service principal and copy the entire JSON output and paste it as the secret value.

## 🚀 Initial Setup Steps

### 1. Deploy Infrastructure with Terraform

Create production infrastructure:

```bash
cd infra
terraform init
terraform plan -var-file=prod.tfvars
terraform apply -var-file=prod.tfvars
```

Get resource names from outputs:
```bash
terraform output
```

### 2. Configure GitHub Secrets

Follow the secrets configuration above to set up `AZURE_SUBSCRIPTION_ID` and `AZURE_CREDENTIALS_PROD`.

### 3. Build and Push Initial Backend Image

Before the first deployment, you need to push an initial backend image:

```bash
# Login to Azure
az login

# Login to ACR
az acr login --name acredubrazilwebprod

# Build and push backend image
cd backend
docker build -t acredubrazilwebprod.azurecr.io/edu-brazil-backend:latest .
docker push acredubrazilwebprod.azurecr.io/edu-brazil-backend:latest

# Update the Container App manually for first time
az containerapp update \
  --name aca-backend-edubrazilweb-prod \
  --resource-group rg-edubrazilweb-prod \
  --image acredubrazilwebprod.azurecr.io/edu-brazil-backend:latest
```

### 4. Test the CI/CD Pipeline

Make a small change and push to main:

```bash
# Make a small change
echo "# Test CI/CD" >> README.md

# Commit and push to main branch
git add README.md
git commit -m "test: CI/CD pipeline"
git push origin main
```

Go to GitHub Actions tab to watch the deployment.

## 📊 Monitoring Deployments

### GitHub Actions UI

1. Go to your repository on GitHub
2. Click **Actions** tab
3. See workflow runs, logs, and results

### Deployment Summary

After each deployment, check the workflow summary for:
- Backend image tag deployed
- Backend URL
- Frontend URL
- Deployment status

### Azure Portal Monitoring

**Container Apps**:
- Go to Azure Portal → Container Apps
- Check the "Log stream" for real-time logs
- Use "Console" to execute commands in the running container

**Storage Account (Frontend)**:
- Go to Azure Portal → Storage Accounts → Static website
- View the frontend at the primary endpoint

## 🔧 Workflow Configuration Details

### Workflow Triggers

**deploy-production.yml**:
- Triggers on push to `main` branch
- Manual trigger via workflow_dispatch

**pr-checks.yml**:
- Triggers on pull requests to `main`
- Runs tests without deploying

### Workflow Steps

1. **Test Backend** - Runs Django tests
2. **Build and Push Backend Image** - Builds Docker image and pushes to ACR
3. **Deploy Backend** - Updates Container App with new image
4. **Run Migrations** - Executes database migrations
5. **Test Frontend** - Lints and builds frontend
6. **Deploy Frontend** - Uploads to Azure Storage

### Environment Variables

The frontend is built with the API URL configured for production:

```
VITE_API_URL=<backend_url>
```

## 🐛 Troubleshooting

### Image Pull Errors

**Problem**: Container App can't pull image from ACR

**Solution**:
```bash
# Verify ACR credentials in Container App
az containerapp show \
  --name aca-backend-edubrazilweb-prod \
  --resource-group rg-edubrazilweb-prod \
  --query "properties.configuration.registries"

# Update if needed
az containerapp update \
  --name aca-backend-edubrazilweb-prod \
  --resource-group rg-edubrazilweb-prod \
  --set-env-vars "REGISTRY_USERNAME=$(az acr credential show -n acredubrazilwebprod --query username -o tsv)"
```

### Migration Failures

**Problem**: Database migrations fail during deployment

**Solution**:
```bash
# Run migrations manually
az containerapp exec \
  --name aca-backend-edubrazilweb-prod \
  --resource-group rg-edubrazilweb-prod \
  --command "python manage.py migrate --noinput"
```

### Frontend Not Updating

**Problem**: Old frontend files still showing

**Solution**:
```bash
# Clear old files and re-upload
az storage blob delete-batch \
  --account-name stedubrazilwebprod \
  --source '$web'

# Re-upload from local
cd frontend
bun run build
az storage blob upload-batch \
  --account-name stedubrazilwebprod \
  --source dist \
  --destination '$web'
```

### GitHub Actions Secrets Issues

**Problem**: Workflow fails with authentication errors

**Solution**:
1. Verify secrets are set correctly in GitHub Settings
2. Regenerate service principal credentials:
   ```bash
   az ad sp credential reset --id <service-principal-id>
   ```
3. Update the `AZURE_CREDENTIALS_*` secret with new credentials

## 🎯 Best Practices

### 1. **Use Pull Requests**
- All changes should go through PR review
- The PR checks workflow will run tests
- Require PR approval before merging to main

### 2. **Monitor Deployments**
- Check GitHub Actions logs after each deployment
- Verify the application works after deployment
- Monitor Azure Container Apps logs

### 3. **Database Migrations**
- Test migrations locally first
- Use `python manage.py sqlmigrate` to review SQL
- Keep migrations backward compatible when possible

### 4. **Secrets Management**
- Never commit secrets to git
- Use GitHub Secrets for all sensitive values
- Rotate secrets periodically

### 5. **Rollback Strategy**
```bash
# If production deployment breaks, rollback:
# 1. Revert the commit
git revert HEAD
git push origin main

# 2. Or deploy previous image tag
az containerapp update \
  --name aca-backend-edubrazilweb-prod \
  --resource-group rg-edubrazilweb-prod \
  --image acredubrazilwebprod.azurecr.io/edu-brazil-backend:prod-<previous-sha>
```

## 📈 Next Steps

### Optional Enhancements

1. **Add Approval Gates for Production**
   - Configure GitHub Environments
   - Require manual approval before production deployment

2. **Add Slack/Email Notifications**
   - Configure notifications for deployment success/failure

3. **Add Performance Testing**
   - Run load tests after deployment

4. **Add Security Scanning**
   - Scan Docker images for vulnerabilities
   - Use Snyk or Trivy

5. **Add Database Backups Before Migrations**
   - Automatically backup database before running migrations

## ✅ Checklist

Before going live with CI/CD:

- [ ] Production infrastructure deployed with Terraform
- [ ] Main branch is protected (require PR reviews)
- [ ] All required GitHub Secrets configured
- [ ] Service principal created with correct permissions
- [ ] Initial backend image pushed to ACR
- [ ] Workflow files updated with correct resource names
- [ ] Test deployment to production successful
- [ ] Frontend connects to backend API correctly
- [ ] Database migrations working
- [ ] Monitoring and logging configured

## 📚 Additional Resources

- [GitHub Actions Documentation](https://docs.github.com/en/actions)
- [Azure Container Apps Documentation](https://learn.microsoft.com/en-us/azure/container-apps/)
- [Azure Container Registry Documentation](https://learn.microsoft.com/en-us/azure/container-registry/)
- [Django Deployment Checklist](https://docs.djangoproject.com/en/5.0/howto/deployment/checklist/)

---

**Questions or issues?** Review the troubleshooting section or check the GitHub Actions logs for detailed error messages.
