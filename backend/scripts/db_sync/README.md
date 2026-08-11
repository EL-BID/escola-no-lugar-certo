# Database Synchronization Scripts

Scripts for copying data from a local development database to production.

## Setup

1. Copy the environment template:
   ```bash
   cp .env.example .env
   ```

2. Edit `.env` with your database credentials:
   ```bash
   # Source (local) database
   SRC_HOST=localhost
   SRC_PORT=5432
   SRC_DB=geo_edu_brazil
   SRC_USER=your_username

   # Target (production) database
   TGT_HOST=your-production-db.postgres.database.azure.com
   TGT_PORT=5432
   TGT_DB=geo_prod
   TGT_USER=your_admin_user
   TGT_PASS=your_secure_password
   ```

3. Make scripts executable:
   ```bash
   chmod +x *.sh
   ```

## Scripts Overview

### Hexagon Data
| Script | Description |
|--------|-------------|
| `copy_state.sh <state_code>` | Copy hexagons for a single state |
| `copy_all_states.sh` | Copy hexagons for all states (sequential) |
| `copy_all_states_parallel.sh [jobs]` | Copy hexagons for all states (parallel, default 4 jobs) |

### Education Data
| Script | Description |
|--------|-------------|
| `copy_education_data_state.sh <state_code>` | Copy education data for a single state |
| `copy_all_education_data.sh` | Copy education data for all states (sequential) |
| `copy_all_education_data_parallel.sh [jobs]` | Copy education data for all states (parallel) |

### School Data
| Script | Description |
|--------|-------------|
| `copy_school_data_state.sh <state_code>` | Copy school data for a single state |
| `copy_all_schools_direct.sh` | Copy all school data at once |

## Usage Examples

```bash
# Copy hexagons for São Paulo (state code 35)
./copy_state.sh 35

# Copy all education data with 6 parallel jobs
./copy_all_education_data_parallel.sh 6

# Copy school data for Pará (state code 15)
./copy_school_data_state.sh 15
```

## State Codes Reference

| Code | State | Code | State |
|------|-------|------|-------|
| 11 | Rondônia | 31 | Minas Gerais |
| 12 | Acre | 32 | Espírito Santo |
| 13 | Amazonas | 33 | Rio de Janeiro |
| 14 | Roraima | 35 | São Paulo |
| 15 | Pará | 41 | Paraná |
| 16 | Amapá | 42 | Santa Catarina |
| 17 | Tocantins | 43 | Rio Grande do Sul |
| 21 | Maranhão | 50 | Mato Grosso do Sul |
| 22 | Piauí | 51 | Mato Grosso |
| 23 | Ceará | 52 | Goiás |
| 24 | Rio Grande do Norte | 53 | Distrito Federal |
| 25 | Paraíba | | |
| 26 | Pernambuco | | |
| 27 | Alagoas | | |
| 28 | Sergipe | | |
| 29 | Bahia | | |

## Requirements

- PostgreSQL client (`psql`)
- `dblink` extension enabled on source database
- Network access to both source and target databases

## Security Notes

⚠️ **Never commit `.env` files to version control!**

The `.env` file is already included in `.gitignore`. Only `.env.example` (without real credentials) should be committed.
