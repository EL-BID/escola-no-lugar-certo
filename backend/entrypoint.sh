#!/bin/bash
# Entrypoint script for Django application
# Runs migrations before starting the server

set -e

echo "=========================================="
echo "Starting Django Application"
echo "=========================================="

echo "Running database migrations..."
python manage.py migrate --noinput

echo "Migrations completed successfully ✅"
echo ""

echo "Starting Gunicorn server..."
exec gunicorn --bind 0.0.0.0:8000 \
    --workers 4 \
    --timeout 120 \
    --access-logfile - \
    --error-logfile - \
    geo_edu_brazil.wsgi:application
