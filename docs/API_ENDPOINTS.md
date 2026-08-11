# API Documentation

## Base URL
All API endpoints are available under: `http://localhost:8001/api/v1/`

## API Endpoints

### 1. State Management

#### List all states
```
GET /api/v1/states/
```

**Response:**
```json
{
  "count": 27,
  "next": null,
  "previous": null,
  "results": [
    {
      "id": 1,
      "code": "PA",
      "name": "Pará",
      "region": "North",
      "total_municipalities": 144
    }
  ]
}
```

#### Get detailed state information
```
GET /api/v1/states/{state_code}/
```

**Response:**
```json
{
  "id": 1,
  "code": "PA",
  "name": "Pará",
  "region": "North",
  "total_municipalities": 144,
  "municipalities": [
    {"id": 1, "name": "Belém", "code_ibge": "1501402", "population": 1499641},
    {"id": 2, "name": "Ananindeua", "code_ibge": "1500800", "population": 516057}
  ]
}
```

#### List municipalities for a state
```
GET /api/v1/states/{state_code}/municipalities/
```

**Response:**
```json
{
  "count": 144,
  "next": "http://localhost:8001/api/v1/states/PA/municipalities/?page=2",
  "previous": null,
  "results": [
    {
      "id": 1,
      "name": "Belém",
      "code_ibge": "1501402",
      "population": 1499641
    }
  ]
}
```

### 2. Municipality Management

#### List municipalities (with optional state filter)
```
GET /api/v1/municipalities/
GET /api/v1/municipalities/?state={state_code}
```

#### Get municipality boundaries
```
GET /api/v1/municipalities/{id}/geometry/
```

**Response (GeoJSON):**
```json
{
  "type": "Feature",
  "geometry": {
    "type": "MultiPolygon",
    "coordinates": [...]
  },
  "properties": {
    "id": 1,
    "name": "Belém"
  }
}
```

### 3. Hexagon Data (Core Dashboard API)

#### Get aggregated education data for dashboard
```
GET /api/v1/hexagons/education-data/?state={state_code}&municipality={municipality_name}&resolution={resolution}&education_levels={levels}
```

**Query Parameters:**
- `state`: State code (required) - e.g., "PA", "SC"
- `municipality`: Municipality name (optional) - e.g., "Belém"
- `resolution`: H3 resolution (5-8, default: 7)
- `education_levels`: Comma-separated list (INF_CRE,INF_PRE,FUND_AI,FUND_AF,MED)

**Response (Simple JSON Array):**
```json
{
  "count": 1500,
  "next": "http://localhost:8001/api/v1/hexagons/education-data/?page=2&state=PA",
  "previous": null,
  "metadata": {
    "state": "PA",
    "municipality": "Belém",
    "resolution": 7,
    "total_hexagons": 1500
  },
  "results": [
    {
      "hexagon_id": 1,
      "h3_index": "87283082b9fffff",
      "municipality_name": "Belém",
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
        "qt_mat_inf_cre_prop": "0.0856",
        "qt_mat_inf_pre_prop": "0.1025",
        "qt_mat_fund_ai_prop": "0.2390",
        "qt_mat_fund_af_prop": "0.1854",
        "qt_mat_med_prop": "0.1415",
        "qt_mat_bas_n": 8,
        "qt_salas_utilizadas": 15,
        "private_qt_mat_inf_cre": 8,
        "private_qt_mat_inf_pre": 12,
        "private_qt_mat_fund_ai": 22,
        "private_qt_mat_fund_af": 18,
        "private_qt_mat_med": 15,
        "data_year": 2024
      }
    }
  ]
}
```

**Note:** The response format was changed from GeoJSON to simple JSON. The geometry field is no longer included since the frontend uses DeckGL's H3HexagonLayer which generates hexagon geometry directly from the H3 index.

#### Calculate classroom needs
```
POST /api/v1/hexagons/calculate-needs/
```

**Request Body:**
```json
{
  "state": "PA",
  "municipality": "Belém",
  "resolution": 7,
  "education_levels": ["INF_CRE", "INF_PRE", "FUND_AI"],
  "parameters": {
    "pop_inf_cre": 1250.5,
    "pop_not_in_school_pct_inf_cre": 15.2,
    "students_private_pct_inf_cre": 8.5,
    "students_integral_pct_inf_cre": 25.0,
    "students_nocturnal_pct_inf_cre": 0.0,
    "students_per_classroom_inf_cre": 15
  }
}
```

**Response:**
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

### 4. Analytics Endpoints

#### Dashboard summary statistics
```
GET /api/v1/analytics/summary/?state={state_code}&municipality={municipality_name}
```

**Response:**
```json
{
  "state": "PA",
  "municipality": "Belém",
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

#### Data for range slider and histogram
```
GET /api/v1/analytics/histogram/?state={state_code}&municipality={municipality_name}&education_levels={levels}
```

**Query Parameters:**
- `state`: State code (required)
- `municipality`: Municipality name (optional)
- `education_levels`: Comma-separated list of education levels

**Response:**
```json
{
  "state": "PA",
  "municipality": "Belém",
  "education_levels": ["inf_cre"],
  "histogram": {
    "bins": [0, 5, 10, 15, 20, 25, 30],
    "counts": [120, 250, 180, 95, 45, 15, 8],
    "min_value": 0,
    "max_value": 30
  }
}
```

### 5. School Data (Detailed Analysis)

#### Get individual school data
```
GET /api/v1/schools/?state={state_code}&municipality={municipality_name}&hexagon={h3_index}&limit={limit}
```

**Query Parameters:**
- `state`: State code
- `municipality`: Municipality name
- `hexagon`: H3 index
- `page`: Page number for pagination

**Response:**
```json
{
  "count": 245,
  "next": "http://localhost:8001/api/v1/schools/?page=2",
  "previous": null,
  "results": [
    {
      "id": 1,
      "code_school": "15000001",
      "name_school": "E.M. Padre Eutíquio",
      "municipality_name": "Belém",
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
        "qt_mat_inf_cre": 0,
        "qt_mat_inf_pre": 0,
        "qt_mat_fund_ai": 285,
        "qt_mat_fund_af": 145,
        "qt_mat_med": 0
      }
    }
  ]
}
```

## Authentication

Currently, all endpoints are publicly accessible without authentication. In production, you may want to implement API key authentication or other security measures.

## Pagination

Most list endpoints support pagination with the following query parameters:
- `page`: Page number (starts from 1)

The response includes pagination metadata:
- `count`: Total number of items
- `next`: URL for the next page (null if last page)
- `previous`: URL for the previous page (null if first page)

## Error Handling

The API returns appropriate HTTP status codes and error messages:

- `200 OK`: Successful request
- `400 Bad Request`: Invalid parameters or request data
- `404 Not Found`: Resource not found
- `500 Internal Server Error`: Server error

Error responses include a descriptive message:
```json
{
  "error": "State parameter is required"
}
```

## CORS Support

The API includes CORS headers to support cross-origin requests from web applications.

## Development Server

To start the development server:
```bash
python manage.py runserver 8001
```

The API will be available at: `http://127.0.0.1:8001/api/v1/`