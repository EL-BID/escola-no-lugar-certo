# Brazilian Education Infrastructure - Backend

GeoDjango REST API with PostGIS spatial capabilities for Brazilian education data analysis.

## 🚀 Production Deployment

✅ **Live on Azure Container Apps**
- Automated deployment via GitHub Actions
- Push to `main` → Automatic Docker build and deploy
- API URL: https://aca-backend-edubrazilweb-prod.wonderfulpond-07f886cb.eastus2.azurecontainerapps.io
- Admin Panel: https://aca-backend-edubrazilweb-prod.wonderfulpond-07f886cb.eastus2.azurecontainerapps.io

## 🏗️ Technology Stack

- **Framework**: Django 5.2.7 with GeoDjango
- **Database**: PostgreSQL 18.0 with PostGIS 3.6
- **Python**: 3.13.7
- **API Framework**: Django REST Framework 3.16.1
- **Spatial Indexing**: H3 v4 hexagonal indexing
- **Data Processing**: GeoPandas, Pandas, PyArrow
- **Server**: Gunicorn WSGI server (production)

## 🚀 Quick Start

### Local Development

```bash
# Navigate to backend directory
cd backend

# Install dependencies (with virtual environment)
pip install -r requirements.txt

# Set up environment variables
cp .env.example .env  # Edit with your settings

# Run migrations
python manage.py migrate

# Create superuser
python manage.py createsuperuser

# Start development server
python manage.py runserver
```

### Environment Variables

Create a `.env` file:

```env
DJANGO_DEBUG=true
DJANGO_SECRET_KEY=your-secret-key-here
DATABASE_URL=postgres://user:password@localhost:5432/geo_edu_brazil
ALLOWED_HOSTS=localhost,127.0.0.1
CORS_ALLOWED_ORIGINS=http://localhost:5173
API_FRONTEND_ONLY_ENFORCED=false
API_FRONTEND_ONLY_ALLOWED_ORIGINS=http://localhost:5173
API_THROTTLE_ANON_RATE=120/min
DJANGO_CACHE_BACKEND=locmem
DJANGO_CACHE_DEFAULT_TIMEOUT_SECONDS=900
DJANGO_CACHE_KEY_PREFIX=edu-brazil
# Required only when DJANGO_CACHE_BACKEND=redis
REDIS_URL=rediss://:password@redis-host:6380/0
```

## 📁 Project Structure

```
backend/
├── brasil_edu/              # Main Django app
│   ├── models.py           # Data models (State, Municipality, Hexagon, etc.)
│   ├── serializers.py      # DRF serializers
│   ├── views.py            # API views
│   ├── urls.py             # URL routing
│   ├── admin.py            # Django admin configuration
│   └── management/         # Management commands
│       └── commands/
│           ├── import_geo_data.py
│           ├── import_education_data.py
│           ├── import_schools.py
│           └── generate_sample_hexagons.py
├── geo_edu_brazil/         # Project settings
│   ├── settings.py         # Django configuration
│   ├── urls.py             # Root URL configuration
│   └── wsgi.py            # WSGI application
├── Dockerfile             # Docker image definition
├── requirements.txt       # Python dependencies
└── manage.py             # Django management script
```

## 📊 Database Models

### Core Models

1. **State**: Brazilian states with official codes and geometry
   - Fields: name, code, region, geometry (MultiPolygon)

2. **Municipality**: Brazilian municipalities with IBGE codes
   - Fields: name, code, state (FK), geometry (MultiPolygon)

3. **Hexagon**: H3 hexagonal grid cells
   - Fields: h3_index, resolution, geometry (Polygon), center_point (Point)

4. **EducationData**: Education metrics per hexagon
   - Fields: hexagon (FK), enrollment, schools, infrastructure metrics

5. **School**: Individual school records
   - Fields: name, code, location (Point), admin_category, size, enrollment

## 🔧 Management Commands

### Import Geographic Data
```bash
python manage.py import_geo_data data/estados.geojson data/municipios.geojson
```

### Import Education Data
```bash
python manage.py import_education_data data/education_data.parquet --state-code PA --resolution 7
```

### Import Schools
```bash
# Import all schools
python manage.py import_schools --data-file data/schools_brazil.parquet

# Import for specific state
python manage.py import_schools --data-file data/schools_brazil.parquet --state-code PA

# Clear existing and re-import
python manage.py import_schools --data-file data/schools_brazil.parquet --clear-existing
```

### Generate Sample Data
```bash
python manage.py generate_sample_hexagons --lat -1.4558 --lng -48.4902 --count 20
```

### Warm API Cache for Heavy Regions
```bash
# Prewarm state-level cache keys for resolutions 5 and 6
python manage.py warm_aggregation_cache --state-code 13 --resolution 5 --resolution 6

# Prewarm a specific municipality together with state-level keys
python manage.py warm_aggregation_cache --state-code 15 --municipality-code 1500602 --resolution 7
```

## 🧪 Testing

```bash
# Run all tests
python manage.py test

# Run specific app tests
python manage.py test brasil_edu

# Run with coverage
coverage run --source='.' manage.py test
coverage report
```

## 🐳 Docker

### Build Image
```bash
docker build -t edu-brazil-backend:latest .
```

### Run Container
```bash
docker run -p 8000:8000 \
  -e DATABASE_URL=postgres://user:pass@host:5432/db \
  -e DJANGO_SECRET_KEY=your-secret-key \
  edu-brazil-backend:latest
```

## 🚢 Deployment

### Automated (Production)
Push to `main` branch triggers:
1. Run Django tests
2. Build Docker image
3. Push to Azure Container Registry
4. Deploy to Azure Container Apps
5. Run database migrations

### Manual Deploy
```bash
# Login to Azure
az login

# Login to ACR
az acr login --name acredubrazilwebprod

# Build and push
docker build -t acredubrazilwebprod.azurecr.io/edu-brazil-backend:latest .
docker push acredubrazilwebprod.azurecr.io/edu-brazil-backend:latest

# Update Container App
az containerapp update \
  --name aca-backend-edubrazilweb-prod \
  --resource-group rg-edubrazilweb-prod \
  --image acredubrazilwebprod.azurecr.io/edu-brazil-backend:latest

# Run migrations
az containerapp exec \
  --name aca-backend-edubrazilweb-prod \
  --resource-group rg-edubrazilweb-prod \
  --command "python manage.py migrate --noinput"
```

## 📡 API Endpoints

See [API_ENDPOINTS.md](../docs/API_ENDPOINTS.md) for detailed API documentation.

Key endpoints:
- `GET /api/v1/states/` - List all states
- `GET /api/v1/municipalities/` - List municipalities
- `GET /api/v1/hexagons/` - List hexagons with education data
- `GET /api/v1/schools/` - List schools
- `GET /api/v1/education-data/` - Education statistics

## 🔐 Security

Production security features:
- Django secret key from environment
- HTTPS-only cookies (production)
- CORS configured for frontend domain
- CSRF protection enabled
- SQL injection protection (Django ORM)
- XSS protection via Django templates

## 📊 Performance

Optimization features:
- PostGIS spatial indexing
- Database connection pooling
- Query result caching
- Batch processing for imports
- Efficient H3 hexagon indexing

## 🐛 Debugging

### Django Shell
```bash
python manage.py shell
```

### Check Configuration
```bash
python manage.py check
python manage.py check --database default
```

### Database Console
```bash
python manage.py dbshell
```

### View Migrations
```bash
python manage.py showmigrations
python manage.py sqlmigrate brasil_edu 0001
```

## 📚 Documentation

- [Django Documentation](https://docs.djangoproject.com/)
- [GeoDjango Documentation](https://docs.djangoproject.com/en/stable/ref/contrib/gis/)
- [PostGIS Documentation](https://postgis.net/documentation/)
- [H3 Documentation](https://h3geo.org/)
- [Django REST Framework](https://www.django-rest-framework.org/)

---

**Status**: ✅ Production ready and deployed on Azure Container Apps
