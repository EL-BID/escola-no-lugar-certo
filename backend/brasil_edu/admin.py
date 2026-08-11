from django.contrib import admin
from django.contrib.gis.admin import GISModelAdmin
from django.utils.html import format_html
from .models import State, Municipality, Hexagon, EducationData, School


@admin.register(State)
class StateAdmin(admin.ModelAdmin):
    list_display = ['code', 'name', 'region', 'total_municipalities', 'created_at']
    list_filter = ['region']
    search_fields = ['name', 'code']
    ordering = ['name']
    readonly_fields = ['created_at', 'updated_at']
    
    fieldsets = (
        ('Basic Information', {
            'fields': ('code', 'name', 'abbrev', 'region')
        }),
        ('Statistics', {
            'fields': ('total_municipalities',)
        }),
        ('Timestamps', {
            'fields': ('created_at', 'updated_at'),
            'classes': ('collapse',)
        }),
    )


@admin.register(Municipality)
class MunicipalityAdmin(GISModelAdmin):
    list_display = ['name', 'state', 'code_ibge', 'population', 'area_km2']
    list_filter = ['state', 'state__region']
    search_fields = ['name', 'code_ibge', 'state__name']
    ordering = ['name']
    raw_id_fields = ['state']
    readonly_fields = ['centroid', 'created_at', 'updated_at']
    
    # Map configuration
    default_zoom = 6
    default_lat = -15.77972
    default_lon = -47.92972
    
    fieldsets = (
        ('Basic Information', {
            'fields': ('state', 'name', 'code_ibge')
        }),
        ('Demographics', {
            'fields': ('population', 'area_km2')
        }),
        ('Geography', {
            'fields': ('geometry', 'centroid')
        }),
        ('Timestamps', {
            'fields': ('created_at', 'updated_at'),
            'classes': ('collapse',)
        }),
    )
    
    def get_queryset(self, request):
        return super().get_queryset(request).select_related('state')


@admin.register(Hexagon)
class HexagonAdmin(GISModelAdmin):
    list_display = ['h3_index', 'resolution', 'state', 'municipality', 'area_km2']
    list_filter = ['resolution', 'state', 'municipality']
    search_fields = ['h3_index', 'state__name', 'municipality__name']
    ordering = ['h3_index']
    raw_id_fields = ['state', 'municipality']
    readonly_fields = ['centroid', 'area_km2', 'created_at']
    
    # Map configuration
    default_zoom = 10
    
    fieldsets = (
        ('H3 Information', {
            'fields': ('h3_index', 'resolution')
        }),
        ('Location', {
            'fields': ('state', 'municipality')
        }),
        ('Geography', {
            'fields': ('geometry', 'centroid', 'area_km2')
        }),
        ('Timestamps', {
            'fields': ('created_at',),
            'classes': ('collapse',)
        }),
    )
    
    def get_queryset(self, request):
        return super().get_queryset(request).select_related('state', 'municipality')


@admin.register(EducationData)
class EducationDataAdmin(admin.ModelAdmin):
    list_display = [
        'hexagon_h3_index', 'municipality_name', 'state_code', 
        'total_public_enrollment', 'total_private_enrollment', 
        'qt_salas_utilizadas', 'data_year'
    ]
    list_filter = ['data_year', 'hexagon__state', 'hexagon__municipality']
    search_fields = ['hexagon__h3_index', 'hexagon__municipality__name', 'hexagon__state__name']
    ordering = ['-data_year', 'hexagon__h3_index']
    raw_id_fields = ['hexagon']
    readonly_fields = [
        'total_public_enrollment', 'total_private_enrollment', 
        'total_population', 'created_at', 'updated_at'
    ]
    
    fieldsets = (
        ('Reference', {
            'fields': ('hexagon', 'data_year')
        }),
        ('Population by Age Group', {
            'fields': ('pop_inf_cre', 'pop_inf_pre', 'pop_fund_ai', 'pop_fund_af', 'pop_med'),
            'description': 'Population estimates by age group (adjusted)'
        }),
        ('Public School Enrollment', {
            'fields': ('qt_mat_inf_cre', 'qt_mat_inf_pre', 'qt_mat_fund_ai', 'qt_mat_fund_af', 'qt_mat_med'),
            'description': 'Student enrollment in public schools'
        }),
        ('Full-time Students', {
            'fields': ('qt_mat_inf_cre_int', 'qt_mat_inf_pre_int', 'qt_mat_fund_ai_int', 'qt_mat_fund_af_int', 'qt_mat_med_int'),
            'classes': ('collapse',)
        }),
        ('Enrollment Proportions', {
            'fields': ('qt_mat_inf_cre_prop', 'qt_mat_inf_pre_prop', 'qt_mat_fund_ai_prop', 'qt_mat_fund_af_prop', 'qt_mat_med_prop'),
            'classes': ('collapse',)
        }),
        ('Private School Enrollment', {
            'fields': ('private_qt_mat_inf_cre', 'private_qt_mat_inf_pre', 'private_qt_mat_fund_ai', 'private_qt_mat_fund_af', 'private_qt_mat_med'),
            'classes': ('collapse',)
        }),
        ('Infrastructure & Other', {
            'fields': ('qt_salas_utilizadas', 'qt_mat_bas_n')
        }),
        ('Summary Statistics', {
            'fields': ('total_public_enrollment', 'total_private_enrollment', 'total_population'),
            'classes': ('collapse',)
        }),
        ('Timestamps', {
            'fields': ('created_at', 'updated_at'),
            'classes': ('collapse',)
        }),
    )
    
    def hexagon_h3_index(self, obj):
        return obj.hexagon.h3_index
    hexagon_h3_index.short_description = 'H3 Index'
    hexagon_h3_index.admin_order_field = 'hexagon__h3_index'
    
    def municipality_name(self, obj):
        return obj.hexagon.municipality.name if obj.hexagon.municipality else '-'
    municipality_name.short_description = 'Municipality'
    municipality_name.admin_order_field = 'hexagon__municipality__name'
    
    def state_code(self, obj):
        return obj.hexagon.state.code
    state_code.short_description = 'State'
    state_code.admin_order_field = 'hexagon__state__code'
    
    def get_queryset(self, request):
        return super().get_queryset(request).select_related(
            'hexagon__state', 
            'hexagon__municipality'
        )


@admin.register(School)
class SchoolAdmin(GISModelAdmin):
    list_display = [
        'code_school', 'name_school', 'municipality', 'state_code',
        'admin_category', 'total_enrollment', 'qt_salas_utilizadas', 'ratio_mat_salas'
    ]
    list_filter = ['admin_category', 'size', 'urban', 'state', 'municipality']
    search_fields = ['code_school', 'name_school', 'municipality__name', 'state__name']
    ordering = ['name_school']
    raw_id_fields = ['state', 'municipality', 'hexagon']
    readonly_fields = [
        'total_enrollment', 'ratio_mat_doc_bas', 'ratio_mat_salas', 
        'created_at', 'updated_at'
    ]
    
    # Map configuration
    default_zoom = 12
    
    fieldsets = (
        ('Basic Information', {
            'fields': ('code_school', 'name_school')
        }),
        ('Location', {
            'fields': ('state', 'municipality', 'hexagon', 'geometry', 'address', 'urban')
        }),
        ('Administration', {
            'fields': ('admin_category', 'tp_dependencia', 'size')
        }),
        ('Infrastructure', {
            'fields': ('qt_salas_utilizadas', 'qt_salas_utilizadas_dentro', 'qt_salas_utilizadas_fora')
        }),
        ('Enrollment by Level', {
            'fields': ('qt_mat_inf_cre', 'qt_mat_inf_pre', 'qt_mat_fund_ai', 'qt_mat_fund_af', 'qt_mat_med')
        }),
        ('Staff', {
            'fields': ('qt_doc_bas', 'qt_tur_bas')
        }),
        ('Calculated Ratios', {
            'fields': ('total_enrollment', 'ratio_mat_doc_bas', 'ratio_mat_salas'),
            'classes': ('collapse',)
        }),
        ('Timestamps', {
            'fields': ('created_at', 'updated_at'),
            'classes': ('collapse',)
        }),
    )
    
    def state_code(self, obj):
        return obj.state.code
    state_code.short_description = 'State'
    state_code.admin_order_field = 'state__code'
    
    def get_queryset(self, request):
        return super().get_queryset(request).select_related(
            'state', 'municipality', 'hexagon'
        )


# Custom admin site configurations
admin.site.site_header = "GeoDjango Education Dashboard"
admin.site.site_title = "Education Dashboard Admin"
admin.site.index_title = "Brazilian Education Infrastructure Management"
