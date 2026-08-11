# GeoDjango Brazil Education Infrastructure

A full-stack application for analyzing Brazilian education infrastructure using spatial data and H3 hexagonal indexing.

## 🚀 Quick Start

**Want to get started quickly?** Check out our [Simplified Deployment Guide](./docs/SIMPLIFIED_DEPLOYMENT.md)!

## Project Overview

This application provides:

- **Backend**: GeoDjango REST API with spatial capabilities
- **Frontend**: React + TypeScript dashboard with interactive maps
- **Infrastructure**: Azure deployment with Terraform
- **CI/CD**: Automated GitHub Actions pipelines

### Key Features

- **Spatial Data Management**: States, municipalities, and H3 hexagonal grids
- **Education Analytics**: Enrollment data, school infrastructure, and demographic analysis
- **Geographic Intelligence**: PostGIS integration for spatial queries and analysis
- **Interactive Dashboard**: React-based frontend with Mapbox visualization
- **Automated Deployment**: Push to main → Auto-deploy to production

## 📚 Documentation

- **[Simplified Deployment Guide](./docs/SIMPLIFIED_DEPLOYMENT.md)** - Quick start for deployment
- **[CI/CD Setup](./docs/CI_CD_SETUP.md)** - GitHub Actions configuration
- **[Azure Deployment](./docs/DEPLOYMENT_AZURE.md)** - Detailed infrastructure guide
- **[API Endpoints](./docs/API_ENDPOINTS.md)** - API documentation
- **[Architecture](./docs/ARCHITECTURE_DIAGRAM.md)** - System architecture

## 🏗️ Architecture

### Deployment Strategy

**Simple and Direct**: `main` branch → Production

- ✅ **Fully Automated CI/CD**: GitHub Actions pipelines configured
- ✅ **Pull Request Checks**: Automated testing on all PRs
- ✅ **Auto-deployment**: Push to main → Auto-deploy to production
- ✅ **Azure Infrastructure**: Provisioned with Terraform
- No staging environment - Keep it simple and fast!

### Technology Stack
- **Framework**: Django 5.2.7 with GeoDjango spatial extensions
- **Database**: PostgreSQL 18.0 with PostGIS 3.6 (8,500+ coordinate systems)
- **Python**: 3.13.7 with virtual environment
- **Spatial Indexing**: H3 v4 hexagonal spatial indexing
- **Data Processing**: GeoPandas, Pandas, PyArrow for efficient data handling
- **API Framework**: Django REST Framework 3.16.1

### Core Dependencies
```bash
Django==5.2.7
psycopg2-binary==2.9.10
geopandas==1.0.1
pandas==2.2.3
pyarrow==18.1.0
h3==4.0.0b5
djangorestframework==3.16.1
```

## Database Schema

### Core Models

1. **State**: Brazilian states with official codes and geometry
2. **Municipality**: Brazilian municipalities with IBGE codes and spatial data
3. **Hexagon**: H3 hexagonal grid cells for spatial aggregation
4. **EducationData**: Education metrics linked to hexagonal areas
5. **School**: Individual school records with location and infrastructure data

### Spatial Capabilities
- PostGIS geometry fields for precise spatial operations
- H3 hexagonal indexing for efficient spatial aggregation
- Multi-level resolution support (H3 levels 6-9)
- Spatial relationships and proximity analysis

## Quick Start

### 1. Environment Setup
```bash
# Clone the repository
git clone git@github.com:idbcloud4lac/edu-brazil-web.git
cd edu-brazil-web/backend

# Activate virtual environment
source .venv/bin/activate

# Install dependencies
pip install -r requirements.txt
```

### 2. Database Configuration
```bash
# Ensure PostgreSQL with PostGIS is running
brew services start postgresql

# Create and migrate database
python manage.py migrate

# Create superuser for admin access
python manage.py createsuperuser
```

### 3. Data Import Pipeline

#### Import Brazilian Geographic Data
```bash
# Import states and municipalities from GeoJSON
python manage.py import_geo_data data/estados.geojson data/municipios.geojson
```

#### Import Education Data
```bash
# Import education data with H3 hexagon mapping
python manage.py import_education_data data/education_data.parquet --state-code PA --resolution 7
```

#### Import School Data
```bash
# Import all Brazilian schools from comprehensive parquet dataset
python manage.py import_schools --data-file data/schools_brazil.parquet

# Import schools for specific state with higher resolution hexagons
python manage.py import_schools --data-file data/schools_brazil.parquet --state-code PA --h3-resolution 8
```

#### Generate Sample Data (for testing)
```bash
# Create test hexagons around Belém coordinates
python manage.py generate_sample_hexagons --lat -1.4558 --lng -48.4902 --count 20
```

### 4. Admin Interface
```bash
# Start development server
python manage.py runserver

# Access admin at: http://127.0.0.1:8000/admin/
# Features:
# - Interactive maps for spatial data visualization
# - Spatial field editing with map widgets
# - Optimized displays for large datasets
# - H3 hexagon visualization and editing
```

## Data Import Commands

### `import_geo_data`
Imports Brazilian geographic boundaries from GeoJSON files.

**Usage:**
```bash
python manage.py import_geo_data <states_file> <municipalities_file>
```

**Features:**
- Automatic state code validation (IBGE standards)
- Municipality-state relationship mapping
- Spatial geometry processing and validation
- Batch processing for performance

### `import_education_data`
Processes education data with H3 hexagonal mapping.

**Usage:**
```bash
python manage.py import_education_data <data_file> --state-code <code> --resolution <level>
```

**Options:**
- `--state-code`: Filter by Brazilian state code (e.g., PA, SP, RJ)
- `--resolution`: H3 resolution level (6-9, default: 7)
- `--batch-size`: Processing batch size (default: 1000)

**Supported Formats:**
- Parquet files (preferred for large datasets)
- CSV files with proper encoding
- Excel files (.xlsx)

### `import_schools`
Imports individual school records with location data from Parquet/CSV/Excel files.

**Usage:**
```bash
# Import all Brazilian schools from parquet file
python manage.py import_schools --data-file path/to/schools.parquet

# Import schools for specific state only
python manage.py import_schools --data-file path/to/schools.parquet --state-code PA

# Import with higher H3 resolution (more precise hexagons)
python manage.py import_schools --data-file path/to/schools.parquet --h3-resolution 8

# Clear existing data before importing
python manage.py import_schools --data-file path/to/schools.parquet --clear-existing

# Dry run to see what would be imported
python manage.py import_schools --data-file path/to/schools.parquet --dry-run --state-code SP
```

**Supported Formats:**
- **Parquet files** (preferred) - with GeoPandas geometry support
- CSV files with proper encoding
- Excel files (.xlsx)

**Expected Data Columns:**
- `abbrev_state`: State abbreviation code (e.g., 'PA', 'SP')
- `name_muni`: Municipality name
- `code_school`: Unique school identifier
- `name_school`: School name
- `lat`, `lon`: Coordinates (or `geometry` column)
- `admin_category`: Administrative category (FEDERAL, ESTADUAL, MUNICIPAL, PRIVADA)
- `urban`: Urban/rural location indicator
- `size`: School size (PEQUENO, MEDIO, GRANDE)
- `QT_*`: Enrollment and infrastructure data

**Features:**
- **GeoPandas Support**: Handles parquet files with spatial geometry
- **Batch Processing**: Efficient processing of 200K+ records
- **State Filtering**: Import specific states or all at once
- **H3 Resolution Control**: Choose hexagon resolution (6-9) for spatial indexing
- **Coordinate Validation**: Validates and processes geographic coordinates
- **H3 Integration**: Automatically links schools to hexagonal areas
- **Municipality Mapping**: Links schools to municipalities in the database

### `generate_sample_hexagons`
Creates sample data for testing and development.

**Usage:**
```bash
python manage.py generate_sample_hexagons --lat <latitude> --lng <longitude> --count <number>
```

**Features:**
- Generates realistic education data
- Creates spatial hexagon network
- Useful for testing spatial queries
- Development and demonstration purposes

## Spatial Features

### H3 Hexagonal Indexing
- **Multi-Resolution**: Support for H3 levels 6-9
- **Efficient Aggregation**: Spatial data aggregation by hexagonal areas
- **Scalable Analysis**: Handle millions of data points efficiently
- **Geographic Intelligence**: Proximity analysis and spatial relationships

### PostGIS Capabilities
- **Spatial Queries**: Distance, intersection, containment operations
- **Geographic Projections**: Support for Brazilian coordinate systems
- **Spatial Indexing**: Optimized queries for large datasets
- **Advanced Analytics**: Spatial statistics and geometric operations

## API Development (Next Phase)

The project is ready for API implementation with:
- Django REST Framework integration
- Spatial serialization capabilities
- H3 hexagon API endpoints
- Education data aggregation services
- Geographic search and filtering

## File Structure

```
edu-brazil-web/backend/
├── brasil_edu/                 # Main Django app
│   ├── models.py              # Data models with spatial fields
│   ├── admin.py               # Admin interface configuration
│   ├── management/            # Management commands
│   │   └── commands/          
│   │       ├── import_geo_data.py
│   │       ├── import_education_data.py
│   │       ├── import_schools.py
│   │       └── generate_sample_hexagons.py
├── geo_edu_brazil/            # Project settings
│   ├── settings.py            # Django configuration
│   └── urls.py                # URL routing
├── requirements.txt           # Python dependencies
└── manage.py                  # Django management script
```

## Development Guidelines

### Data Processing
- Use batch processing for large datasets
- Implement proper error handling and validation
- Log import progress and statistics
- Support incremental data updates

### Spatial Data
- Validate coordinate systems and projections
- Use appropriate H3 resolution for use case
- Implement spatial indexing for performance
- Test spatial relationships and queries

### Performance
- Use database indexes for spatial fields
- Implement pagination for large result sets
- Optimize spatial queries with proper bounds
- Monitor database performance metrics

## Testing and Validation

### Sample Data Test
```bash
# Generate test data
python manage.py generate_sample_hexagons --lat -1.4558 --lng -48.4902 --count 20

# Verify in Django shell
python manage.py shell -c "
from brasil_edu.models import Hexagon, EducationData
print(f'Hexagons: {Hexagon.objects.count()}')
print(f'Education records: {EducationData.objects.count()}')
"
```

### Admin Interface Test
1. Start development server: `python manage.py runserver`
2. Access admin: http://127.0.0.1:8000/admin/
3. Verify spatial map widgets work correctly
4. Test data creation and editing functionality

## Next Steps

1. **API Development**: Implement REST endpoints for data access
2. **Real Data Import**: Process actual Brazilian education datasets
3. **Spatial Analytics**: Develop spatial analysis capabilities
4. **Frontend Integration**: Connect with dashboard frontend
5. **Performance Optimization**: Scale for production workloads

## Production Deployment

### Infrastructure Status

✅ **Production Environment**: Fully deployed on Azure
- **Backend API**: Running on Azure Container Apps
- **Frontend**: Deployed to Azure Storage Static Website
- **Database**: PostgreSQL with PostGIS on Azure
- **CI/CD**: GitHub Actions automated deployment

### CI/CD Workflows

**Automated Deployment** (`deploy-production.yml`):
- Triggers on push to `main` branch
- Runs backend and frontend tests
- Builds and pushes Docker image to ACR
- Deploys to Azure Container Apps
- Runs database migrations
- Builds and deploys frontend to Storage

**Pull Request Checks** (`pr-checks.yml`):
- Runs on all PRs to `main`
- Backend tests with Django test suite
- Frontend linting and build validation
- Docker image build verification
- Migration validation

### Deployment URLs

Access the deployed application:
- **Frontend**: https://stedubrazilwebprod559v8j.z20.web.core.windows.net/
- **Backend API**: https://aca-backend-edubrazilweb-prod.wonderfulpond-07f886cb.eastus2.azurecontainerapps.io
- **Admin Panel**: https://aca-backend-edubrazilweb-prod.wonderfulpond-07f886cb.eastus2.azurecontainerapps.io

## Support

For development questions or issues:
1. Check Django and GeoDjango documentation
2. Review H3 spatial indexing documentation
3. Consult PostGIS spatial database guides
4. Test with sample data generation commands
5. Review [CI/CD Setup Guide](./docs/CI_CD_SETUP.md) for deployment issues

---

**Status**: ✅ **Production Ready** - Full-stack application deployed on Azure with automated CI/CD