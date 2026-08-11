from rest_framework import serializers
from rest_framework_gis.serializers import GeoFeatureModelSerializer
from .models import State, Municipality, Hexagon, EducationData, School


class StateSerializer(serializers.ModelSerializer):
    """Serializer for State model"""
    class Meta:
        model = State
        fields = ['id', 'code', 'name', 'region', 'total_municipalities']


class StateDetailSerializer(serializers.ModelSerializer):
    """Detailed serializer for State model with municipalities"""
    municipalities = serializers.SerializerMethodField()
    
    class Meta:
        model = State
        fields = ['id', 'code', 'name', 'region', 'total_municipalities', 'municipalities']
    
    def get_municipalities(self, obj):
        municipalities = obj.municipalities.all()
        return MunicipalitySerializer(municipalities, many=True).data


class MunicipalitySerializer(serializers.ModelSerializer):
    """Serializer for Municipality model"""
    hexagon_counts_by_resolution = serializers.SerializerMethodField()

    class Meta:
        model = Municipality
        fields = ['id', 'name', 'code_ibge', 'area_km2', 'population', 'hexagon_counts_by_resolution']

    def to_representation(self, instance):
        data = super().to_representation(instance)
        if not data.get('hexagon_counts_by_resolution'):
            data.pop('hexagon_counts_by_resolution', None)
        return data

    def get_hexagon_counts_by_resolution(self, obj):
        return getattr(obj, 'hexagon_counts_by_resolution', {})


class MunicipalityGeometrySerializer(GeoFeatureModelSerializer):
    """Serializer for Municipality geometry"""
    class Meta:
        model = Municipality
        geo_field = 'geometry'
        fields = ['id', 'name']


class EducationDataSerializer(serializers.ModelSerializer):
    """Serializer for Education Data"""
    class Meta:
        model = EducationData
        exclude = ['id', 'hexagon', 'created_at', 'updated_at']


class EducationDataCompactSerializer(serializers.ModelSerializer):
    """Compact serializer for map/report hot path."""

    class Meta:
        model = EducationData
        fields = [
            'qt_mat_inf_cre',
            'qt_mat_inf_pre',
            'qt_mat_fund_ai',
            'qt_mat_fund_af',
            'qt_mat_med',
            'qt_mat_inf_cre_prop',
            'qt_mat_inf_pre_prop',
            'qt_mat_fund_ai_prop',
            'qt_mat_fund_af_prop',
            'qt_mat_med_prop',
            'qt_salas_utilizadas',
        ]


class HexagonEducationSerializer(GeoFeatureModelSerializer):
    """Serializer for Hexagon with Education Data (GeoJSON format)"""
    education_data = EducationDataSerializer(read_only=True)
    municipality_name = serializers.CharField(source='municipality.name', read_only=True, allow_null=True)
    hexagon_id = serializers.IntegerField(source='id', read_only=True)
    
    class Meta:
        model = Hexagon
        geo_field = 'geometry'
        fields = ['hexagon_id', 'h3_index', 'municipality_name', 'education_data']


class HexagonEducationSimpleSerializer(serializers.ModelSerializer):
    """Serializer for Hexagon with Education Data (Simple JSON format without geometry)"""
    education_data = EducationDataSerializer(read_only=True)
    municipality_name = serializers.CharField(source='municipality.name', read_only=True, allow_null=True)
    hexagon_id = serializers.IntegerField(source='id', read_only=True)
    
    class Meta:
        model = Hexagon
        fields = ['hexagon_id', 'h3_index', 'municipality_name', 'education_data']


class HexagonEducationCompactSerializer(serializers.ModelSerializer):
    """Compact serializer for Hexagon with reduced education payload."""
    education_data = EducationDataCompactSerializer(read_only=True)
    municipality_name = serializers.CharField(source='municipality.name', read_only=True, allow_null=True)
    hexagon_id = serializers.IntegerField(source='id', read_only=True)

    class Meta:
        model = Hexagon
        fields = ['hexagon_id', 'h3_index', 'municipality_name', 'education_data']


class SchoolSerializer(serializers.ModelSerializer):
    """Serializer for School model"""
    municipality_name = serializers.CharField(source='municipality.name', read_only=True)
    location = serializers.SerializerMethodField()
    infrastructure = serializers.SerializerMethodField()
    enrollment = serializers.SerializerMethodField()
    
    class Meta:
        model = School
        fields = [
            'id', 'code_school', 'name_school', 'municipality_name', 'location',
            'admin_category', 'urban', 'infrastructure', 'enrollment'
        ]
    
    def get_location(self, obj):
        if obj.geometry:
            return {
                'lat': obj.geometry.y,
                'lon': obj.geometry.x
            }
        return None
    
    def get_infrastructure(self, obj):
        return {
            'qt_salas_utilizadas': obj.qt_salas_utilizadas,
            'ratio_mat_salas': float(obj.ratio_mat_salas) if obj.ratio_mat_salas else None
        }
    
    def get_enrollment(self, obj):
        return {
            'qt_mat_inf_cre': obj.qt_mat_inf_cre,
            'qt_mat_inf_pre': obj.qt_mat_inf_pre,
            'qt_mat_fund_ai': obj.qt_mat_fund_ai,
            'qt_mat_fund_af': obj.qt_mat_fund_af,
            'qt_mat_med': obj.qt_mat_med
        }


class CalculateNeedsRequestSerializer(serializers.Serializer):
    """Serializer for calculate needs request"""
    state = serializers.CharField(max_length=2)
    municipality = serializers.CharField(max_length=200, required=False, allow_blank=True)
    municipality_code = serializers.CharField(max_length=20, required=False, allow_blank=True)
    resolution = serializers.IntegerField(min_value=5, max_value=8, default=7)
    education_levels = serializers.ListField(
        child=serializers.ChoiceField(choices=[
            'INF_CRE', 'INF_PRE', 'FUND_AI', 'FUND_AF', 'MED'
        ]),
        required=False
    )
    parameters = serializers.DictField(required=True)


class CalculateNeedsResponseSerializer(serializers.Serializer):
    """Serializer for calculate needs response"""
    hexagon_id = serializers.IntegerField()
    h3_index = serializers.CharField()
    calculations = serializers.DictField()


class AnalyticsSummarySerializer(serializers.Serializer):
    """Serializer for analytics summary"""
    state = serializers.CharField()
    municipality = serializers.CharField(required=False, allow_blank=True)
    summary = serializers.DictField()


class AnalyticsHistogramSerializer(serializers.Serializer):
    """Serializer for analytics histogram"""
    state = serializers.CharField()
    municipality = serializers.CharField(required=False, allow_blank=True)
    education_levels = serializers.ListField(child=serializers.CharField())
    histogram = serializers.DictField()
