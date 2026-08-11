from django.urls import path, include
from rest_framework.routers import DefaultRouter
from . import views

# Create router for viewsets
router = DefaultRouter()
router.register(r'states', views.StateViewSet)
router.register(r'municipalities', views.MunicipalityViewSet)
router.register(r'hexagons', views.HexagonViewSet)
router.register(r'schools', views.SchoolViewSet)

app_name = 'brasil_edu'

urlpatterns = [
    # Health check
    path('health/', views.health_check, name='health-check'),
    
    # Include router URLs
    path('', include(router.urls)),
    
    # Analytics endpoints
    path('analytics/summary/', views.AnalyticsSummaryView.as_view(), name='analytics-summary'),
    path('analytics/histogram/', views.AnalyticsHistogramView.as_view(), name='analytics-histogram'),
]