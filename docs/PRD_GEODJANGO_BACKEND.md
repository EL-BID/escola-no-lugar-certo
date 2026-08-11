# 📋 Product Requirements Document: GeoDjango Education Dashboard Backend

## 🎯 **PROJECT OVERVIEW**

### **Product Name**: Brazilian Education Infrastructure Dashboard - GeoDjango Backend API

### **Purpose**
Build a high-performance GeoDjango backend to replace the current file-based Dash application, providing REST APIs for education infrastructure analysis across Brazilian states with hexagonal spatial aggregation.

### **Success Criteria**
- ✅ Support 27 Brazilian states with real-time data switching
- ✅ Handle 100+ concurrent users
- ✅ Sub-second response times for spatial queries
- ✅ Seamless integration with existing Dash frontend
- ✅ Production-ready deployment with Docker

---

## 🏗️ **SYSTEM ARCHITECTURE**

### **Technology Stack**
- Backend: Django 5.2.7 with GeoDjango
- Database: PostgreSQL with PostGIS (GeoDjango PostGIS backend)
- Python: 3.11.x (requirements pinned; runtime not explicitly pinned in repo)
- Spatial: H3 hexagonal indexing (h3 4.0.0b5)
- API: Django REST Framework 3.16.1 + djangorestframework-gis
- Database Adapter: psycopg2-binary 2.9.10
- CORS: django-cors-headers 4.9.0
- Static Files: whitenoise 6.11.0
- Configuration: python-decouple 3.8
- Caching: Planned (Redis not wired yet)
- Deployment: Planned (Docker files not present yet)

#### Implementation status summary
- Core models (State, Municipality, Hexagon, EducationData, School) implemented with spatial fields and indexes.
- REST endpoints implemented for states, municipalities, hexagons (education-data + calculate-needs), analytics (summary + histogram), and schools.
- Management commands implemented: import_geo_data, import_education_data, import_schools.
- Base URL configured at /api/v1/.
- Redis caching, Docker stack, and OpenAPI docs are not yet implemented.

### **Core Components**
1. **Spatial Data Models** - States, municipalities, hexagons with H3 indexing
2. **Education Data Models** - Student enrollment, classroom metrics, teacher ratios
3. **REST API Endpoints** - Data retrieval for dashboard components
4. **Spatial Query Engine** - H3-based aggregation and filtering
5. **Data Import Pipeline** - ETL for parquet/geojson sources

---

## 📊 **DATABASE SCHEMA REQUIREMENTS**

### **Core Tables**

#### 1. **States Table**
```sql
CREATE TABLE states (
    id SERIAL PRIMARY KEY,
    code VARCHAR(2) UNIQUE NOT NULL,           -- 'PA', 'AC', 'AM', etc.
    name VARCHAR(100) NOT NULL,                -- 'Pará', 'Acre', 'Amazonas'
    abbrev VARCHAR(10),                        -- State abbreviation
    region VARCHAR(50),                        -- North, Northeast, etc.
    total_municipalities INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);
```

#### 2. **Municipalities Table**
```sql
CREATE TABLE municipalities (
    id SERIAL PRIMARY KEY,
    state_id INTEGER REFERENCES states(id) ON DELETE CASCADE,
    name VARCHAR(200) NOT NULL,                -- Municipality name
    code_ibge VARCHAR(20),                     -- IBGE municipality code
    geometry GEOMETRY(MULTIPOLYGON, 4326),     -- Geographic boundaries
    centroid GEOMETRY(POINT, 4326),           -- Geographic center
    area_km2 DECIMAL(12, 4),                  -- Area in square kilometers
    population INTEGER,                        -- Total population (if available)
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);
```

#### 3. **H3 Hexagons Table**
```sql
CREATE TABLE hexagons (
    id SERIAL PRIMARY KEY,
    h3_index VARCHAR(20) UNIQUE NOT NULL,      -- H3 hexagon identifier
    resolution INTEGER NOT NULL,               -- H3 resolution (5-8)
    state_id INTEGER REFERENCES states(id),
    municipality_id INTEGER REFERENCES municipalities(id),
    geometry GEOMETRY(POLYGON, 4326),          -- Hexagon polygon
    centroid GEOMETRY(POINT, 4326),           -- Hexagon center
    area_km2 DECIMAL(10, 6),                  -- Hexagon area
    created_at TIMESTAMP DEFAULT NOW()
);
```

#### 4. **Education Data Table**
```sql
CREATE TABLE education_data (
    id SERIAL PRIMARY KEY,
    hexagon_id INTEGER REFERENCES hexagons(id) ON DELETE CASCADE,
    
    -- Population by age group (adjusted estimates)
    pop_inf_cre DECIMAL(10, 2) DEFAULT 0,     -- 3 months - 3 years
    pop_inf_pre DECIMAL(10, 2) DEFAULT 0,     -- 4-5 years
    pop_fund_ai DECIMAL(10, 2) DEFAULT 0,     -- 6-10 years
    pop_fund_af DECIMAL(10, 2) DEFAULT 0,     -- 11-14 years
    pop_med DECIMAL(10, 2) DEFAULT 0,         -- 15-17 years
    
    -- Student enrollment (public schools)
    qt_mat_inf_cre INTEGER DEFAULT 0,         -- Creche enrollment
    qt_mat_inf_pre INTEGER DEFAULT 0,         -- Pre-school enrollment
    qt_mat_fund_ai INTEGER DEFAULT 0,         -- Elementary 1-5 enrollment
    qt_mat_fund_af INTEGER DEFAULT 0,         -- Elementary 6-9 enrollment
    qt_mat_med INTEGER DEFAULT 0,             -- High school enrollment
    
    -- Full-time students (integral time)
    qt_mat_inf_cre_int INTEGER DEFAULT 0,
    qt_mat_inf_pre_int INTEGER DEFAULT 0,
    qt_mat_fund_ai_int INTEGER DEFAULT 0,
    qt_mat_fund_af_int INTEGER DEFAULT 0,
    qt_mat_med_int INTEGER DEFAULT 0,
    
    -- Proportional enrollment by level
    qt_mat_inf_cre_prop DECIMAL(5, 4) DEFAULT 0,
    qt_mat_inf_pre_prop DECIMAL(5, 4) DEFAULT 0,
    qt_mat_fund_ai_prop DECIMAL(5, 4) DEFAULT 0,
    qt_mat_fund_af_prop DECIMAL(5, 4) DEFAULT 0,
    qt_mat_med_prop DECIMAL(5, 4) DEFAULT 0,
    
    -- Night shift students
    qt_mat_bas_n INTEGER DEFAULT 0,
    
    -- Infrastructure
    qt_salas_utilizadas INTEGER DEFAULT 0,    -- Used classrooms
    
    -- Private school data
    private_qt_mat_inf_cre INTEGER DEFAULT 0,
    private_qt_mat_inf_pre INTEGER DEFAULT 0,
    private_qt_mat_fund_ai INTEGER DEFAULT 0,
    private_qt_mat_fund_af INTEGER DEFAULT 0,
    private_qt_mat_med INTEGER DEFAULT 0,
    
    -- Metadata
    data_year INTEGER DEFAULT 2024,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);
```

#### 5. **Schools Table** (Optional - for detailed analysis)
```sql
CREATE TABLE schools (
    id SERIAL PRIMARY KEY,
    code_school VARCHAR(20) UNIQUE NOT NULL,   -- School code
    name_school VARCHAR(300) NOT NULL,         -- School name
    state_id INTEGER REFERENCES states(id),
    municipality_id INTEGER REFERENCES municipalities(id),
    hexagon_id INTEGER REFERENCES hexagons(id),
    
    -- Location
    geometry GEOMETRY(POINT, 4326),           -- School location
    address TEXT,
    urban BOOLEAN DEFAULT TRUE,
    
    -- Administration
    admin_category VARCHAR(50),               -- Public/Private
    tp_dependencia INTEGER,                   -- Administrative dependency
    size VARCHAR(20),                         -- School size category
    
    -- Infrastructure
    qt_salas_utilizadas INTEGER DEFAULT 0,
    qt_salas_utilizadas_dentro INTEGER DEFAULT 0,
    qt_salas_utilizadas_fora INTEGER DEFAULT 0,
    
    -- Enrollment (mirrors education_data structure)
    qt_mat_inf_cre INTEGER DEFAULT 0,
    qt_mat_inf_pre INTEGER DEFAULT 0,
    qt_mat_fund_ai INTEGER DEFAULT 0,
    qt_mat_fund_af INTEGER DEFAULT 0,
    qt_mat_med INTEGER DEFAULT 0,
    
    -- Teachers and classes
    qt_doc_bas INTEGER DEFAULT 0,
    qt_tur_bas INTEGER DEFAULT 0,
    
    -- Ratios
    ratio_mat_doc_bas DECIMAL(8, 2),
    ratio_mat_salas DECIMAL(8, 2),
    
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);
```

### **Indexes for Performance**
```sql
-- H3 spatial indexes
CREATE INDEX idx_hexagons_h3 ON hexagons(h3_index);
CREATE INDEX idx_hexagons_resolution ON hexagons(resolution);
CREATE INDEX idx_hexagons_state ON hexagons(state_id);
CREATE INDEX idx_hexagons_municipality ON hexagons(municipality_id);
CREATE INDEX idx_hexagons_geom ON hexagons USING GIST(geometry);

-- Education data indexes
CREATE INDEX idx_education_hexagon ON education_data(hexagon_id);
CREATE INDEX idx_education_year ON education_data(data_year);

-- Municipality spatial indexes
CREATE INDEX idx_municipalities_geom ON municipalities USING GIST(geometry);
CREATE INDEX idx_municipalities_state ON municipalities(state_id);

-- Schools indexes
CREATE INDEX idx_schools_geom ON schools USING GIST(geometry);
CREATE INDEX idx_schools_hexagon ON schools(hexagon_id);
CREATE INDEX idx_schools_municipality ON schools(municipality_id);
```

---

## 🔌 **API ENDPOINTS SPECIFICATION**

### **Base URL**: `/api/v1/`

Note: In the current dataset and implementation, `state.code` values are numeric strings corresponding to IBGE state codes (e.g., "42" for Santa Catarina).

### **1. State Management**

#### `GET /states/`
**Purpose**: List all available states
```json
{
  "count": 27,
  "results": [
    {
  "id": 1,
  "code": "42",
  "name": "Santa Catarina",
  "region": "South",
  "total_municipalities": 295
    }
  ]
}
```

#### `GET /states/{state_code}/`
**Purpose**: Get detailed state information
```json
{
  "id": 1,
  "code": "42",
  "name": "Santa Catarina",
  "region": "South",
  "total_municipalities": 295,
  "municipalities": [
    {"id": 1, "name": "Florianópolis"},
    {"id": 2, "name": "Joinville"}
  ]
}
```

### **2. Municipality Management**

#### `GET /states/{state_code}/municipalities/`
**Purpose**: List municipalities for state switching
```json
{
  "count": 295,
  "results": [
    {
      "id": 1,
      "name": "Florianópolis",
      "code_ibge": "4205407",
      "population": 516524
    }
  ]
}

#### `GET /municipalities/`
**Purpose**: List municipalities (optionally filter by state)**

Query parameters:
- `state`: State code (e.g., 42)

Example: `/municipalities/?state=42`
```

#### `GET /municipalities/{id}/geometry/`
**Purpose**: Get municipality boundaries for map display
```json
{
  "id": 1,
  "name": "Belém",
  "geometry": {
    "type": "MultiPolygon",
    "coordinates": [...]
  }
}
```

### **3. Hexagon Data (Core Dashboard API)**

#### `GET /hexagons/education-data/`
**Purpose**: Get aggregated education data for dashboard calculations (GeoJSON Features)
**Query Parameters**:
- `state`: State code (required)
- `municipality`: Municipality name (optional)
- `resolution`: H3 resolution (5-8, default: 7)
- `education_levels`: Comma-separated list (INF_CRE,INF_PRE,FUND_AI,FUND_AF,MED)

```json
{
  "count": 1500,
  "metadata": {
    "state": "42",
    "municipality": "Florianópolis",
    "resolution": 7,
    "total_hexagons": 1500
  },
  "results": [
    {
      "type": "Feature",
      "geometry": {
        "type": "Polygon",
        "coordinates": [ [ [ -48.492, -27.598 ], [ -48.491, -27.599 ] ] ]
      },
      "properties": {
        "hexagon_id": 1,
        "h3_index": "87283082b9fffff",
        "municipality_name": "Florianópolis",
        "education_data": {
          "pop_inf_cre": 45.2,
          "pop_inf_pre": 52.1,
          "pop_fund_ai": 120.5,
          "pop_fund_af": 98.3,
          "pop_med": 75.8,
          "qt_mat_inf_cre": 35,
          "qt_mat_inf_pre": 42,
          "qt_mat_fund_ai": 98,
          "qt_mat_fund_af": 76,
          "qt_mat_med": 58,
          "qt_mat_inf_cre_int": 12,
          "qt_mat_inf_pre_int": 15,
          "qt_mat_fund_ai_int": 25,
          "qt_mat_fund_af_int": 18,
          "qt_mat_med_int": 12,
          "qt_mat_inf_cre_prop": 0.0856,
          "qt_mat_inf_pre_prop": 0.1025,
          "qt_mat_fund_ai_prop": 0.2390,
          "qt_mat_fund_af_prop": 0.1854,
          "qt_mat_med_prop": 0.1415,
          "qt_mat_bas_n": 8,
          "qt_salas_utilizadas": 15,
          "private_qt_mat_inf_cre": 8,
          "private_qt_mat_inf_pre": 12,
          "private_qt_mat_fund_ai": 22,
          "private_qt_mat_fund_af": 18,
          "private_qt_mat_med": 15
        }
      }
    }
  ]
}
```

#### `POST /hexagons/calculate-needs/`
**Purpose**: Calculate classroom needs based on user parameters (population is read from persisted EducationData)
**Request Body**:
```json
{
  "state": "42",
  "municipality": "Florianópolis",
  "resolution": 7,
  "education_levels": ["INF_CRE", "INF_PRE", "FUND_AI"],
  "parameters": {
    "pop_not_in_school_pct_inf_cre": 15.2,
    "students_private_pct_inf_cre": 8.5,
    "students_integral_pct_inf_cre": 25.0,
    "students_nocturnal_pct_inf_cre": 0.0,
    "students_per_classroom_inf_cre": 15
  }
}
```

**Response**:
```json
{
  "results": [
    {
      "hexagon_id": 1,
      "h3_index": "87283082b9fffff",
      "calculations": {
        "qt_salas_necesarias_total_inf_cre": 8.5,
        "qt_salas_actuales_inf_cre": 5.0,
        "qt_salas_necesarias_extra_inf_cre": 4.0
      }
    }
  ],
  "summary": {
    "total_new_classrooms_needed": 156,
    "total_hexagons_analyzed": 1500
  }
}
```

### **4. Analytics Endpoints**

#### `GET /analytics/summary/`
**Purpose**: Dashboard summary statistics
```json
{
  "state": "42",
  "municipality": "Florianópolis",
  "summary": {
    "total_population": {
      "inf_cre": 12500,
      "inf_pre": 15200,
      "fund_ai": 35800,
      "fund_af": 28900,
      "med": 22100
    },
    "total_enrollment": {
      "inf_cre": 9800,
      "inf_pre": 12100,
      "fund_ai": 28500,
      "fund_af": 22200,
      "med": 16800
    },
    "infrastructure": {
      "total_classrooms": 2850,
      "avg_students_per_classroom": 42.5
    }
  }
}
```

#### `GET /analytics/histogram/`
**Purpose**: Data for range slider and histogram
```json
{
  "state": "42",
  "municipality": "Florianópolis",
  "education_levels": ["INF_CRE"],
  "histogram": {
    "bins": [0, 5, 10, 15, 20, 25, 30],
    "counts": [120, 250, 180, 95, 45, 15, 8],
    "min_value": 0,
    "max_value": 30
  }
}
```

### **5. School Data (Detailed Analysis)**

#### `GET /schools/`
**Purpose**: Get individual school data for detailed analysis
**Query Parameters**:
- `state`: State code
- `municipality`: Municipality name
- `hexagon`: H3 index
- `limit`: Results per page

```json
{
  "count": 245,
  "results": [
    {
      "id": 1,
      "code_school": "15000001",
      "name_school": "E.M. Padre Eutíquio",
  "municipality_name": "Florianópolis",
      "location": {
        "lat": -1.4558,
        "lon": -48.4902
      },
      "admin_category": "Municipal",
      "urban": true,
      "infrastructure": {
        "qt_salas_utilizadas": 12,
        "ratio_mat_salas": 35.8
      },
      "enrollment": {
        "qt_mat_fund_ai": 285,
        "qt_mat_fund_af": 145
      }
    }
  ]
}
```

---

## 🔧 **DJANGO MODELS SPECIFICATION**

### **1. Core Models**

```python
# models.py
from django.contrib.gis.db import models
from django.contrib.gis.geos import Point, Polygon
import h3

class State(models.Model):
  code = models.CharField(max_length=2, unique=True)
  name = models.CharField(max_length=100)
  abbrev = models.CharField(max_length=10, blank=True)
  region = models.CharField(max_length=50)
  code_region = models.CharField(max_length=2, blank=True)
  total_municipalities = models.IntegerField(default=0)
  created_at = models.DateTimeField(auto_now_add=True)
  updated_at = models.DateTimeField(auto_now=True)
    
    class Meta:
        db_table = 'states'
        ordering = ['name']
    
    def __str__(self):
        return f"{self.name} ({self.code})"

class Municipality(models.Model):
    state = models.ForeignKey(State, on_delete=models.CASCADE, related_name='municipalities')
    name = models.CharField(max_length=200)
    code_ibge = models.CharField(max_length=20, null=True, blank=True)
    geometry = models.MultiPolygonField(srid=4326)
    centroid = models.PointField(srid=4326, null=True, blank=True)
    area_km2 = models.DecimalField(max_digits=12, decimal_places=4, null=True, blank=True)
    population = models.IntegerField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    class Meta:
        db_table = 'municipalities'
        unique_together = ['state', 'name']
        ordering = ['name']
    
    def save(self, *args, **kwargs):
        if self.geometry and not self.centroid:
            self.centroid = self.geometry.centroid
        super().save(*args, **kwargs)

class Hexagon(models.Model):
    h3_index = models.CharField(max_length=20, unique=True, db_index=True)
    resolution = models.IntegerField()
    state = models.ForeignKey(State, on_delete=models.CASCADE)
    municipality = models.ForeignKey(Municipality, on_delete=models.CASCADE, null=True, blank=True)
    geometry = models.PolygonField(srid=4326)
    centroid = models.PointField(srid=4326)
    area_km2 = models.DecimalField(max_digits=10, decimal_places=6)
    created_at = models.DateTimeField(auto_now_add=True)
    
  class Meta:
    db_table = 'hexagons'
    indexes = [
      models.Index(fields=['h3_index']),
      models.Index(fields=['resolution']),
      models.Index(fields=['state']),
      models.Index(fields=['municipality']),
    ]
    
  @classmethod
  def create_from_h3(cls, h3_index, state, municipality=None):
    """Create hexagon from H3 index (h3 v4 API)"""
    coords = h3.cell_to_boundary(h3_index)
    coords_lonlat = [(c[1], c[0]) for c in coords] + [(coords[0][1], coords[0][0])]
    polygon = Polygon(coords_lonlat)
    lat, lon = h3.cell_to_latlng(h3_index)
    centroid = Point(lon, lat)
    return cls.objects.create(
      h3_index=h3_index,
      resolution=h3.get_resolution(h3_index),
      state=state,
      municipality=municipality,
      geometry=polygon,
      centroid=centroid,
      area_km2=h3.cell_area(h3_index, unit='km^2')
    )

class EducationData(models.Model):
    hexagon = models.OneToOneField(Hexagon, on_delete=models.CASCADE, related_name='education_data')
    
    # Population estimates
    pop_inf_cre = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    pop_inf_pre = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    pop_fund_ai = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    pop_fund_af = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    pop_med = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    
    # Student enrollment
    qt_mat_inf_cre = models.IntegerField(default=0)
    qt_mat_inf_pre = models.IntegerField(default=0)
    qt_mat_fund_ai = models.IntegerField(default=0)
    qt_mat_fund_af = models.IntegerField(default=0)
    qt_mat_med = models.IntegerField(default=0)
    
    # Full-time students
    qt_mat_inf_cre_int = models.IntegerField(default=0)
    qt_mat_inf_pre_int = models.IntegerField(default=0)
    qt_mat_fund_ai_int = models.IntegerField(default=0)
    qt_mat_fund_af_int = models.IntegerField(default=0)
    qt_mat_med_int = models.IntegerField(default=0)
    
    # Proportional enrollment
    qt_mat_inf_cre_prop = models.DecimalField(max_digits=5, decimal_places=4, default=0)
    qt_mat_inf_pre_prop = models.DecimalField(max_digits=5, decimal_places=4, default=0)
    qt_mat_fund_ai_prop = models.DecimalField(max_digits=5, decimal_places=4, default=0)
    qt_mat_fund_af_prop = models.DecimalField(max_digits=5, decimal_places=4, default=0)
    qt_mat_med_prop = models.DecimalField(max_digits=5, decimal_places=4, default=0)
    
    # Night shift
    qt_mat_bas_n = models.IntegerField(default=0)
    
    # Infrastructure
    qt_salas_utilizadas = models.IntegerField(default=0)
    
    # Private schools
    private_qt_mat_inf_cre = models.IntegerField(default=0)
    private_qt_mat_inf_pre = models.IntegerField(default=0)
    private_qt_mat_fund_ai = models.IntegerField(default=0)
    private_qt_mat_fund_af = models.IntegerField(default=0)
    private_qt_mat_med = models.IntegerField(default=0)
    
    data_year = models.IntegerField(default=2024)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    class Meta:
        db_table = 'education_data'
        indexes = [
            models.Index(fields=['data_year']),
        ]
```

### **2. Serializers**

```python
# serializers.py
from rest_framework import serializers
from rest_framework_gis.serializers import GeoFeatureModelSerializer
from .models import State, Municipality, Hexagon, EducationData

class StateSerializer(serializers.ModelSerializer):
    class Meta:
        model = State
        fields = ['id', 'code', 'name', 'region', 'total_municipalities']

class MunicipalitySerializer(serializers.ModelSerializer):
    class Meta:
        model = Municipality
        fields = ['id', 'name', 'code_ibge', 'population']

class MunicipalityGeometrySerializer(GeoFeatureModelSerializer):
    class Meta:
        model = Municipality
        geo_field = 'geometry'
        fields = ['id', 'name']

class EducationDataSerializer(serializers.ModelSerializer):
    class Meta:
        model = EducationData
        exclude = ['id', 'hexagon', 'created_at', 'updated_at']

class HexagonEducationSerializer(GeoFeatureModelSerializer):
  education_data = EducationDataSerializer(read_only=True)
  municipality_name = serializers.CharField(source='municipality.name', read_only=True)
  hexagon_id = serializers.IntegerField(source='id', read_only=True)
    
  class Meta:
    model = Hexagon
    geo_field = 'geometry'
    fields = ['hexagon_id', 'h3_index', 'municipality_name', 'education_data']
```

### **3. ViewSets**

```python
# views.py
from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from django.contrib.gis.geos import Polygon
from django.db.models import Q, Sum, Avg
from .models import State, Municipality, Hexagon, EducationData
from .serializers import (StateSerializer, MunicipalitySerializer, 
                         HexagonEducationSerializer, MunicipalityGeometrySerializer)

class StateViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = State.objects.all()
    serializer_class = StateSerializer
    lookup_field = 'code'
    
    @action(detail=True, methods=['get'])
    def municipalities(self, request, code=None):
        state = self.get_object()
        municipalities = state.municipalities.all()
        serializer = MunicipalitySerializer(municipalities, many=True)
        return Response({
            'count': municipalities.count(),
            'results': serializer.data
        })

class MunicipalityViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = Municipality.objects.all()
    serializer_class = MunicipalitySerializer
    
    @action(detail=True, methods=['get'])
    def geometry(self, request, pk=None):
        municipality = self.get_object()
        serializer = MunicipalityGeometrySerializer(municipality)
        return Response(serializer.data)

class HexagonViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = Hexagon.objects.select_related('municipality', 'state').prefetch_related('education_data')
    serializer_class = HexagonEducationSerializer
    
    @action(detail=False, methods=['get'])
    def education_data(self, request):
        # Get query parameters
        state_code = request.query_params.get('state')
        municipality_name = request.query_params.get('municipality')
        resolution = request.query_params.get('resolution', 7)
        
        if not state_code:
            return Response({'error': 'State parameter is required'}, 
                          status=status.HTTP_400_BAD_REQUEST)
        
        # Build queryset
        queryset = self.get_queryset().filter(
            state__code=state_code,
            resolution=resolution
        )
        
        if municipality_name:
            queryset = queryset.filter(municipality__name=municipality_name)
        
        # Apply pagination
        page = self.paginate_queryset(queryset)
        if page is not None:
            serializer = self.get_serializer(page, many=True)
            return self.get_paginated_response(serializer.data)
        
        serializer = self.get_serializer(queryset, many=True)
        return Response({
            'count': queryset.count(),
            'metadata': {
                'state': state_code,
                'municipality': municipality_name,
                'resolution': int(resolution),
                'total_hexagons': queryset.count()
            },
            'results': serializer.data
        })
    
    @action(detail=False, methods=['post'])
    def calculate_needs(self, request):
        """Calculate classroom needs based on user parameters"""
        # This would implement the complex calculation logic
        # from the current Dash app's calculate_extra_salas function
        data = request.data
        state_code = data.get('state')
        municipality_name = data.get('municipality')
        resolution = data.get('resolution', 7)
        parameters = data.get('parameters', {})
        
        # Implementation would go here
        # Return calculated results
        return Response({
            'results': [],  # Calculated hexagon data
            'summary': {
                'total_new_classrooms_needed': 0,
                'total_hexagons_analyzed': 0
            }
        })
```

---

## 📥 **DATA IMPORT PIPELINE**

### **Management Commands**

#### 1. **Import States and Municipalities**
```python
# management/commands/import_geo_data.py
from django.core.management.base import BaseCommand
import geopandas as gpd
from brasil_edu.models import State, Municipality

class Command(BaseCommand):
    help = 'Import states and municipalities from GeoJSON files'
    
    def add_arguments(self, parser):
        parser.add_argument('--states-file', type=str, required=True)
        parser.add_argument('--municipalities-file', type=str, required=True)
    
    def handle(self, *args, **options):
        # Import states
        states_gdf = gpd.read_file(options['states_file'])
        for _, row in states_gdf.iterrows():
            State.objects.get_or_create(
                code=row['code'],
                defaults={
                    'name': row['name'],
                    'region': row['region']
                }
            )
        
        # Import municipalities
        municipalities_gdf = gpd.read_file(options['municipalities_file'])
        for _, row in municipalities_gdf.iterrows():
            state = State.objects.get(code=row['state_code'])
            Municipality.objects.get_or_create(
                state=state,
                name=row['name'],
                defaults={
                    'code_ibge': row.get('code_ibge'),
                    'geometry': row['geometry'],
                    'population': row.get('population')
                }
            )
```

#### 2. **Import Education Data**
```python
# management/commands/import_education_data.py
from django.core.management.base import BaseCommand
import pandas as pd
from brasil_edu.models import State, Municipality, Hexagon, EducationData

class Command(BaseCommand):
    help = 'Import education data from parquet files'
    
    def add_arguments(self, parser):
        parser.add_argument('--data-file', type=str, required=True)
        parser.add_argument('--state-code', type=str, required=True)
    
    def handle(self, *args, **options):
        df = pd.read_parquet(options['data_file'])
        state = State.objects.get(code=options['state_code'])
        
        for _, row in df.iterrows():
            # Get or create hexagon
            hexagon, created = Hexagon.objects.get_or_create(
                h3_index=row['hex'],
                defaults={
                    'state': state,
                    'municipality': Municipality.objects.get(
                        state=state, 
                        name=row['name_muni']
                    ) if row['name_muni'] else None
                }
            )
            
            # Create or update education data
            EducationData.objects.update_or_create(
                hexagon=hexagon,
                defaults={
                    'pop_inf_cre': row.get('pop_3_months_3_years_adj', 0),
                    'pop_inf_pre': row.get('pop_4_5_years_adj', 0),
                    'pop_fund_ai': row.get('pop_6_10_years_adj', 0),
                    'pop_fund_af': row.get('pop_11_14_years_adj', 0),
                    'pop_med': row.get('pop_15_17_years_adj', 0),
                    'qt_mat_inf_cre': row.get('QT_MAT_INF_CRE', 0),
                    'qt_mat_inf_pre': row.get('QT_MAT_INF_PRE', 0),
                    'qt_mat_fund_ai': row.get('QT_MAT_FUND_AI', 0),
                    'qt_mat_fund_af': row.get('QT_MAT_FUND_AF', 0),
                    'qt_mat_med': row.get('QT_MAT_MED', 0),
                    # ... other fields
                }
            )
```

---

## 🚀 **DEPLOYMENT SPECIFICATION**

### **Docker Configuration**

#### 1. **Dockerfile**
```dockerfile
FROM python:3.11-slim

# Install system dependencies
RUN apt-get update && apt-get install -y \
    postgresql-client \
    gdal-bin \
    libgdal-dev \
    gcc \
    g++ \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install Python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application
COPY . .

# Collect static files
RUN python manage.py collectstatic --noinput

EXPOSE 8000

CMD ["gunicorn", "config.wsgi:application", "--bind", "0.0.0.0:8000", "--workers", "4"]
```

#### 2. **docker-compose.yml**
```yaml
version: '3.8'

services:
  postgres:
    image: postgis/postgis:15-3.3
    environment:
      POSTGRES_DB: education_dashboard
      POSTGRES_USER: dashboard
      POSTGRES_PASSWORD: ${DB_PASSWORD}
      POSTGRES_HOST_AUTH_METHOD: trust
    volumes:
      - postgres_data:/var/lib/postgresql/data
      - ./init.sql:/docker-entrypoint-initdb.d/init.sql
    ports:
      - "5432:5432"

  redis:
    image: redis:7-alpine
    volumes:
      - redis_data:/data
    ports:
      - "6379:6379"

  web:
    build: .
    depends_on:
      - postgres
      - redis
    environment:
      DATABASE_URL: postgis://dashboard:${DB_PASSWORD}@postgres:5432/education_dashboard
      REDIS_URL: redis://redis:6379/0
      DJANGO_SETTINGS_MODULE: config.settings.production
    volumes:
      - static_volume:/app/staticfiles
      - media_volume:/app/media
    ports:
      - "8000:8000"

  nginx:
    image: nginx:alpine
    depends_on:
      - web
    volumes:
      - ./nginx.conf:/etc/nginx/conf.d/default.conf
      - static_volume:/app/staticfiles
      - media_volume:/app/media
    ports:
      - "80:80"

volumes:
  postgres_data:
  redis_data:
  static_volume:
  media_volume:
```

### **Environment Configuration**

#### 1. **settings/production.py**
```python
from .base import *
import os

DEBUG = False
ALLOWED_HOSTS = ['*']  # Configure appropriately

# Database
DATABASES = {
    'default': {
        'ENGINE': 'django.contrib.gis.db.backends.postgis',
        'NAME': os.environ.get('DB_NAME', 'education_dashboard'),
        'USER': os.environ.get('DB_USER', 'dashboard'),
        'PASSWORD': os.environ.get('DB_PASSWORD'),
        'HOST': os.environ.get('DB_HOST', 'localhost'),
        'PORT': os.environ.get('DB_PORT', '5432'),
    }
}

# Redis Cache
CACHES = {
    'default': {
        'BACKEND': 'django_redis.cache.RedisCache',
        'LOCATION': os.environ.get('REDIS_URL', 'redis://localhost:6379/0'),
        'OPTIONS': {
            'CLIENT_CLASS': 'django_redis.client.DefaultClient',
        }
    }
}

# Static files
STATIC_ROOT = '/app/staticfiles'
MEDIA_ROOT = '/app/media'

# Security
SECURE_SSL_REDIRECT = True
SECURE_PROXY_SSL_HEADER = ('HTTP_X_FORWARDED_PROTO', 'https')
```

---

## ✅ **ACCEPTANCE CRITERIA**

### **Phase 1: Core Functionality (Week 1)**
- [x] Database schema implemented with all tables and indexes
- [x] Django models with spatial fields and H3 integration
- [x] Basic read APIs for states, municipalities, hexagons
- [x] Data import pipeline working (geo, education, schools)
- [x] Basic education data API endpoint functional
- [ ] Docker deployment working locally

### **Phase 2: Dashboard Integration (Week 2)**
- [x] Core API endpoints implemented (states, municipalities, hexagons, schools)
- [x] Classroom calculation API implemented (baseline logic)
- [x] Analytics endpoints for summary and histogram data
- [ ] Performance under load (100+ concurrent users)
- [ ] Redis caching implemented
- [ ] Production deployment ready

### **Phase 3: Optimization & Testing (Week 3)**
- [ ] Sub-second response times for spatial queries
- [ ] Comprehensive test suite (>80% coverage)
- [ ] API documentation with OpenAPI/Swagger
- [ ] Error handling and logging
- [ ] Data validation and integrity checks
- [ ] Monitoring and health checks

---

## ❗ What’s Missing vs Spec

- Caching (Redis) not configured in settings; no Redis dependency required yet.
- Dockerfile and docker-compose.yml absent; no production settings module checked in.
- OpenAPI/Swagger docs not present; no schema generation configured.
- Tests are minimal (skeleton `tests.py` only); no automated coverage or CI.
- Performance hardening not addressed (query caching, DB tuning, load tests).
- Security hardening for production (ALLOWED_HOSTS, CSRF/CORS prod policy, HTTPS redirects) not completed.
- Analytics histogram currently supports one education level per call; multi-level combinations and advanced filters are TBD.
- `state.code` is numeric in current dataset; if two-letter codes (e.g., "PA") are desired, import/data normalization is required and serializers/validators may need updates.

---

## 🎯 **SUCCESS METRICS**

### **Performance Targets**
- **Response Time**: <1 second for hexagon data queries
- **Throughput**: 100+ concurrent users
- **Database**: <500ms for complex spatial aggregations
- **Memory**: <2GB RAM usage per application instance
- **Storage**: Efficient storage with PostGIS spatial indexes

### **Functionality Targets**
- **API Coverage**: 100% of current Dash app functionality
- **Data Integrity**: Zero data loss during import/export
- **Error Rate**: <1% API error rate
- **Uptime**: 99.9% availability

### **Code Quality Targets**
- **Test Coverage**: >80% code coverage
- **Documentation**: Complete API documentation
- **Code Quality**: Passes linting and security scans
- **Type Safety**: Type hints for all functions

---

## 🔄 **INTEGRATION WITH DASH FRONTEND**

### **Migration Strategy**
1. **Phase 1**: Build API alongside existing file-based system
2. **Phase 2**: Create API client in Dash app for gradual migration
3. **Phase 3**: Replace file-based calls with API calls function by function
4. **Phase 4**: Remove file-based code once API is fully validated

### **API Client for Dash**
```python
# api_client.py
import requests
from typing import Dict, List, Optional

class EducationDashboardAPI:
    def __init__(self, base_url: str):
        self.base_url = base_url.rstrip('/')
        self.session = requests.Session()
    
    def get_states(self) -> List[Dict]:
        response = self.session.get(f"{self.base_url}/api/v1/states/")
        response.raise_for_status()
        return response.json()['results']
    
    def get_municipalities(self, state_code: str) -> List[Dict]:
        response = self.session.get(f"{self.base_url}/api/v1/states/{state_code}/municipalities/")
        response.raise_for_status()
        return response.json()['results']
    
    def get_hexagon_education_data(self, state: str, municipality: Optional[str] = None, 
                                  resolution: int = 7) -> Dict:
        params = {'state': state, 'resolution': resolution}
        if municipality:
            params['municipality'] = municipality
            
        response = self.session.get(f"{self.base_url}/api/v1/hexagons/education-data/", params=params)
        response.raise_for_status()
        return response.json()
```

This PRD provides a comprehensive specification for building a production-ready GeoDjango backend that can seamlessly replace the current file-based system while maintaining all existing functionality and adding significant performance improvements.