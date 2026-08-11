from django.contrib.gis.db import models
from django.contrib.gis.geos import Point, Polygon
from django.core.exceptions import ValidationError
import h3




class State(models.Model):
    """Model for Brazilian states"""
    code = models.CharField(max_length=2, unique=True, verbose_name="State Code")
    name = models.CharField(max_length=100, verbose_name="State Name")
    abbrev = models.CharField(max_length=10, blank=True, verbose_name="Abbreviation")
    region = models.CharField(max_length=50, verbose_name="Region")
    code_region = models.CharField(max_length=2, blank=True, verbose_name="Region Code")
    total_municipalities = models.IntegerField(default=0, verbose_name="Total Municipalities")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    class Meta:
        db_table = 'states'
        ordering = ['name']
        verbose_name = "State"
        verbose_name_plural = "States"
    
    def __str__(self):
        return f"{self.name} ({self.code})"

class Municipality(models.Model):
    """Model for Brazilian municipalities"""
    state = models.ForeignKey(State, on_delete=models.CASCADE, related_name='municipalities')
    name = models.CharField(max_length=200, verbose_name="Municipality Name")
    code_ibge = models.CharField(max_length=20, null=True, blank=True, verbose_name="IBGE Code")
    geometry = models.MultiPolygonField(srid=4326, verbose_name="Geographic Boundaries")
    centroid = models.PointField(srid=4326, null=True, blank=True, verbose_name="Geographic Center")
    area_km2 = models.DecimalField(max_digits=12, decimal_places=4, null=True, blank=True, verbose_name="Area (km²)")
    population = models.IntegerField(null=True, blank=True, verbose_name="Total Population")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    class Meta:
        db_table = 'municipalities'
        unique_together = ['state', 'name']
        ordering = ['name']
        verbose_name = "Municipality"
        verbose_name_plural = "Municipalities"
        indexes = [
            models.Index(fields=['state']),
            models.Index(fields=['code_ibge']),
        ]
    
    def save(self, *args, **kwargs):
        """Auto-calculate centroid if geometry is present"""
        if self.geometry and not self.centroid:
            self.centroid = self.geometry.centroid
        if self.geometry and not self.area_km2:
            self.area_km2 = self.geometry.area * 12365.1613  # Approximate conversion from degrees² to km² at Brazil's latitude
        super().save(*args, **kwargs)
    
    def __str__(self):
        return f"{self.name} - {self.state.code}"


class Hexagon(models.Model):
    """Model for H3 hexagons"""
    h3_index = models.CharField(max_length=20, unique=True, db_index=True, verbose_name="H3 Index")
    resolution = models.IntegerField(verbose_name="H3 Resolution")
    state = models.ForeignKey(State, on_delete=models.CASCADE, related_name='hexagons')
    municipality = models.ForeignKey(
        Municipality, 
        on_delete=models.CASCADE, 
        null=True, 
        blank=True, 
        related_name='hexagons'
    )
    geometry = models.PolygonField(srid=4326, verbose_name="Hexagon Polygon")
    centroid = models.PointField(srid=4326, verbose_name="Hexagon Center")
    area_km2 = models.DecimalField(max_digits=10, decimal_places=6, verbose_name="Hexagon Area (km²)")
    created_at = models.DateTimeField(auto_now_add=True)
    
    class Meta:
        db_table = 'hexagons'
        ordering = ['h3_index']
        verbose_name = "Hexagon"
        verbose_name_plural = "Hexagons"
        indexes = [
            models.Index(fields=['h3_index']),
            models.Index(fields=['resolution']),
            models.Index(fields=['state']),
            models.Index(fields=['municipality']),
            models.Index(fields=['state', 'resolution'], name='hexagons_state_res_idx'),
            models.Index(fields=['municipality', 'resolution'], name='hexagons_mun_res_idx'),
        ]
    
    def clean(self):
        """Validate H3 index"""
        if self.h3_index and not h3.is_valid_cell(self.h3_index):
            raise ValidationError({'h3_index': 'Invalid H3 index format'})
        
        if self.h3_index and self.resolution:
            actual_resolution = h3.get_resolution(self.h3_index)
            if actual_resolution != self.resolution:
                raise ValidationError({
                    'resolution': f'Resolution mismatch: H3 index has resolution {actual_resolution}, but {self.resolution} was specified'
                })
    
    @classmethod
    def create_from_h3(cls, h3_index, state, municipality=None):
        """Create hexagon from H3 index"""
        if not h3.is_valid_cell(h3_index):
            raise ValueError(f"Invalid H3 index: {h3_index}")
        
        # Get H3 geometry
        coords = h3.cell_to_boundary(h3_index)
        # Convert to (lon, lat) format for Django and close the polygon
        coords_lonlat = [(coord[1], coord[0]) for coord in coords] + [(coords[0][1], coords[0][0])]
        polygon = Polygon(coords_lonlat)
        
        # Get H3 center (note: H3 returns (lat, lon), we need (lon, lat) for Django)
        lat, lon = h3.cell_to_latlng(h3_index)
        centroid = Point(lon, lat)
        
        # Get resolution and area
        resolution = h3.get_resolution(h3_index)
        area_km2 = h3.cell_area(h3_index, unit='km^2')
        
        return cls.objects.create(
            h3_index=h3_index,
            resolution=resolution,
            state=state,
            municipality=municipality,
            geometry=polygon,
            centroid=centroid,
            area_km2=area_km2
        )
    
    def __str__(self):
        return f"H3-{self.h3_index} (Res: {self.resolution})"


class EducationData(models.Model):
    """Model for education data aggregated by hexagon"""
    hexagon = models.OneToOneField(Hexagon, on_delete=models.CASCADE, related_name='education_data')
    
    # Population estimates by age group (adjusted estimates)
    pop_inf_cre = models.DecimalField(
        max_digits=10, decimal_places=2, default=0, 
        verbose_name="Population 3 months - 3 years"
    )
    pop_inf_pre = models.DecimalField(
        max_digits=10, decimal_places=2, default=0, 
        verbose_name="Population 4-5 years"
    )
    pop_fund_ai = models.DecimalField(
        max_digits=10, decimal_places=2, default=0, 
        verbose_name="Population 6-10 years"
    )
    pop_fund_af = models.DecimalField(
        max_digits=10, decimal_places=2, default=0, 
        verbose_name="Population 11-14 years"
    )
    pop_med = models.DecimalField(
        max_digits=10, decimal_places=2, default=0, 
        verbose_name="Population 15-17 years"
    )
    
    # Student enrollment (public schools)
    qt_mat_inf_cre = models.IntegerField(default=0, verbose_name="Creche Enrollment")
    qt_mat_inf_pre = models.IntegerField(default=0, verbose_name="Pre-school Enrollment")
    qt_mat_fund_ai = models.IntegerField(default=0, verbose_name="Elementary 1-5 Enrollment")
    qt_mat_fund_af = models.IntegerField(default=0, verbose_name="Elementary 6-9 Enrollment")
    qt_mat_med = models.IntegerField(default=0, verbose_name="High School Enrollment")
    
    # Full-time students (integral time)
    qt_mat_inf_cre_int = models.IntegerField(default=0, verbose_name="Creche Full-time")
    qt_mat_inf_pre_int = models.IntegerField(default=0, verbose_name="Pre-school Full-time")
    qt_mat_fund_ai_int = models.IntegerField(default=0, verbose_name="Elementary 1-5 Full-time")
    qt_mat_fund_af_int = models.IntegerField(default=0, verbose_name="Elementary 6-9 Full-time")
    qt_mat_med_int = models.IntegerField(default=0, verbose_name="High School Full-time")
    
    # Proportional enrollment by level
    qt_mat_inf_cre_prop = models.DecimalField(
        max_digits=5, decimal_places=4, default=0, 
        verbose_name="Creche Enrollment Proportion"
    )
    qt_mat_inf_pre_prop = models.DecimalField(
        max_digits=5, decimal_places=4, default=0, 
        verbose_name="Pre-school Enrollment Proportion"
    )
    qt_mat_fund_ai_prop = models.DecimalField(
        max_digits=5, decimal_places=4, default=0, 
        verbose_name="Elementary 1-5 Enrollment Proportion"
    )
    qt_mat_fund_af_prop = models.DecimalField(
        max_digits=5, decimal_places=4, default=0, 
        verbose_name="Elementary 6-9 Enrollment Proportion"
    )
    qt_mat_med_prop = models.DecimalField(
        max_digits=5, decimal_places=4, default=0, 
        verbose_name="High School Enrollment Proportion"
    )
    
    # Night shift students
    qt_mat_bas_n = models.IntegerField(default=0, verbose_name="Night Shift Students")
    
    # Infrastructure
    qt_salas_utilizadas = models.IntegerField(default=0, verbose_name="Used Classrooms")
    
    # Private school data
    private_qt_mat_inf_cre = models.IntegerField(default=0, verbose_name="Private Creche Enrollment")
    private_qt_mat_inf_pre = models.IntegerField(default=0, verbose_name="Private Pre-school Enrollment")
    private_qt_mat_fund_ai = models.IntegerField(default=0, verbose_name="Private Elementary 1-5 Enrollment")
    private_qt_mat_fund_af = models.IntegerField(default=0, verbose_name="Private Elementary 6-9 Enrollment")
    private_qt_mat_med = models.IntegerField(default=0, verbose_name="Private High School Enrollment")
    
    # Metadata
    data_year = models.IntegerField(default=2024, verbose_name="Data Year")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    class Meta:
        db_table = 'education_data'
        verbose_name = "Education Data"
        verbose_name_plural = "Education Data"
        indexes = [
            models.Index(fields=['data_year']),
        ]
    
    @property
    def total_public_enrollment(self):
        """Calculate total public school enrollment"""
        return (
            self.qt_mat_inf_cre + self.qt_mat_inf_pre + 
            self.qt_mat_fund_ai + self.qt_mat_fund_af + 
            self.qt_mat_med
        )
    
    @property
    def total_private_enrollment(self):
        """Calculate total private school enrollment"""
        return (
            self.private_qt_mat_inf_cre + self.private_qt_mat_inf_pre + 
            self.private_qt_mat_fund_ai + self.private_qt_mat_fund_af + 
            self.private_qt_mat_med
        )
    
    @property
    def total_population(self):
        """Calculate total population across all age groups"""
        return (
            self.pop_inf_cre + self.pop_inf_pre + 
            self.pop_fund_ai + self.pop_fund_af + 
            self.pop_med
        )
    
    def __str__(self):
        return f"Education Data - {self.hexagon.h3_index} ({self.data_year})"


class HexagonRollup(models.Model):
    """Precomputed H3 rollups derived from canonical resolution-8 hexagons."""

    h3_index = models.CharField(max_length=20, verbose_name="H3 Index")
    resolution = models.IntegerField(verbose_name="H3 Resolution")
    source_resolution = models.IntegerField(default=8, verbose_name="Source H3 Resolution")
    state = models.ForeignKey(State, on_delete=models.CASCADE, related_name='hexagon_rollups')
    municipality = models.ForeignKey(
        Municipality,
        on_delete=models.CASCADE,
        related_name='hexagon_rollups',
        null=True,
        blank=True,
    )

    pop_inf_cre = models.DecimalField(max_digits=16, decimal_places=4, default=0)
    pop_inf_pre = models.DecimalField(max_digits=16, decimal_places=4, default=0)
    pop_fund_ai = models.DecimalField(max_digits=16, decimal_places=4, default=0)
    pop_fund_af = models.DecimalField(max_digits=16, decimal_places=4, default=0)
    pop_med = models.DecimalField(max_digits=16, decimal_places=4, default=0)

    qt_mat_inf_cre = models.BigIntegerField(default=0)
    qt_mat_inf_pre = models.BigIntegerField(default=0)
    qt_mat_fund_ai = models.BigIntegerField(default=0)
    qt_mat_fund_af = models.BigIntegerField(default=0)
    qt_mat_med = models.BigIntegerField(default=0)

    qt_mat_inf_cre_int = models.BigIntegerField(default=0)
    qt_mat_inf_pre_int = models.BigIntegerField(default=0)
    qt_mat_fund_ai_int = models.BigIntegerField(default=0)
    qt_mat_fund_af_int = models.BigIntegerField(default=0)
    qt_mat_med_int = models.BigIntegerField(default=0)

    private_qt_mat_inf_cre = models.BigIntegerField(default=0)
    private_qt_mat_inf_pre = models.BigIntegerField(default=0)
    private_qt_mat_fund_ai = models.BigIntegerField(default=0)
    private_qt_mat_fund_af = models.BigIntegerField(default=0)
    private_qt_mat_med = models.BigIntegerField(default=0)

    qt_mat_bas_n = models.BigIntegerField(default=0)
    qt_salas_utilizadas = models.BigIntegerField(default=0)
    qt_salas_weighted_inf_cre = models.DecimalField(max_digits=16, decimal_places=4, default=0)
    qt_salas_weighted_inf_pre = models.DecimalField(max_digits=16, decimal_places=4, default=0)
    qt_salas_weighted_fund_ai = models.DecimalField(max_digits=16, decimal_places=4, default=0)
    qt_salas_weighted_fund_af = models.DecimalField(max_digits=16, decimal_places=4, default=0)
    qt_salas_weighted_med = models.DecimalField(max_digits=16, decimal_places=4, default=0)
    nocturnal_weighted_fund_af = models.DecimalField(max_digits=16, decimal_places=4, default=0)
    nocturnal_weighted_med = models.DecimalField(max_digits=16, decimal_places=4, default=0)

    source_hexagon_count = models.IntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'hexagon_rollups'
        ordering = ['h3_index']
        verbose_name = "Hexagon Rollup"
        verbose_name_plural = "Hexagon Rollups"
        constraints = [
            models.UniqueConstraint(
                fields=['state', 'resolution', 'h3_index'],
                condition=models.Q(municipality__isnull=True),
                name='hexroll_state_res_h3_uniq',
            ),
            models.UniqueConstraint(
                fields=['municipality', 'resolution', 'h3_index'],
                condition=models.Q(municipality__isnull=False),
                name='hexroll_mun_res_h3_uniq',
            ),
        ]
        indexes = [
            models.Index(fields=['state', 'resolution'], name='hexroll_state_res_idx'),
            models.Index(fields=['municipality', 'resolution'], name='hexroll_mun_res_idx'),
            models.Index(fields=['h3_index'], name='hexroll_h3_idx'),
        ]

    def __str__(self):
        scope = f"municipality={self.municipality_id}" if self.municipality_id else f"state={self.state_id}"
        return f"H3-{self.h3_index} rollup ({scope}, Res: {self.resolution}, Source: {self.source_resolution})"


class School(models.Model):
    """Model for individual schools (optional - for detailed analysis)"""
    
    ADMIN_CATEGORIES = [
        ('FEDERAL', 'Federal'),
        ('ESTADUAL', 'State'),
        ('MUNICIPAL', 'Municipal'),
        ('PRIVADA', 'Private'),
    ]
    
    SIZE_CATEGORIES = [
        ('PEQUENO', 'Small'),
        ('MEDIO', 'Medium'),
        ('GRANDE', 'Large'),
    ]
    
    code_school = models.CharField(max_length=20, unique=True, verbose_name="School Code")
    name_school = models.CharField(max_length=300, verbose_name="School Name")
    state = models.ForeignKey(State, on_delete=models.CASCADE, related_name='schools')
    municipality = models.ForeignKey(Municipality, on_delete=models.CASCADE, related_name='schools')
    hexagon = models.ForeignKey(
        Hexagon, 
        on_delete=models.CASCADE, 
        null=True, 
        blank=True, 
        related_name='schools'
    )
    
    # Location
    geometry = models.PointField(srid=4326, verbose_name="School Location")
    address = models.TextField(blank=True, verbose_name="Address")
    urban = models.BooleanField(default=True, verbose_name="Urban Location")
    
    # Administration
    admin_category = models.CharField(
        max_length=50, 
        choices=ADMIN_CATEGORIES, 
        verbose_name="Administrative Category"
    )
    tp_dependencia = models.IntegerField(null=True, blank=True, verbose_name="Administrative Dependency")
    size = models.CharField(
        max_length=20, 
        choices=SIZE_CATEGORIES, 
        blank=True, 
        verbose_name="School Size"
    )
    
    # Infrastructure
    qt_salas_utilizadas = models.IntegerField(default=0, verbose_name="Used Classrooms")
    qt_salas_utilizadas_dentro = models.IntegerField(default=0, verbose_name="Indoor Classrooms")
    qt_salas_utilizadas_fora = models.IntegerField(default=0, verbose_name="Outdoor Classrooms")
    
    # Enrollment (mirrors education_data structure)
    qt_mat_inf_cre = models.IntegerField(default=0, verbose_name="Creche Enrollment")
    qt_mat_inf_pre = models.IntegerField(default=0, verbose_name="Pre-school Enrollment")
    qt_mat_fund_ai = models.IntegerField(default=0, verbose_name="Elementary 1-5 Enrollment")
    qt_mat_fund_af = models.IntegerField(default=0, verbose_name="Elementary 6-9 Enrollment")
    qt_mat_med = models.IntegerField(default=0, verbose_name="High School Enrollment")
    
    # Teachers and classes
    qt_doc_bas = models.IntegerField(default=0, verbose_name="Basic Education Teachers")
    qt_tur_bas = models.IntegerField(default=0, verbose_name="Basic Education Classes")
    
    # Ratios (calculated fields)
    ratio_mat_doc_bas = models.DecimalField(
        max_digits=8, decimal_places=2, null=True, blank=True,
        verbose_name="Students per Teacher Ratio"
    )
    ratio_mat_salas = models.DecimalField(
        max_digits=8, decimal_places=2, null=True, blank=True,
        verbose_name="Students per Classroom Ratio"
    )
    
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    class Meta:
        db_table = 'schools'
        ordering = ['name_school']
        verbose_name = "School"
        verbose_name_plural = "Schools"
        indexes = [
            models.Index(fields=['code_school']),
            models.Index(fields=['admin_category']),
            models.Index(fields=['municipality']),
            models.Index(fields=['hexagon']),
        ]
    
    @property
    def total_enrollment(self):
        """Calculate total enrollment"""
        return (
            self.qt_mat_inf_cre + self.qt_mat_inf_pre + 
            self.qt_mat_fund_ai + self.qt_mat_fund_af + 
            self.qt_mat_med
        )
    
    def save(self, *args, **kwargs):
        """Auto-calculate ratios"""
        # Calculate student-teacher ratio
        if self.qt_doc_bas > 0:
            self.ratio_mat_doc_bas = self.total_enrollment / self.qt_doc_bas
        
        # Calculate student-classroom ratio
        if self.qt_salas_utilizadas > 0:
            self.ratio_mat_salas = self.total_enrollment / self.qt_salas_utilizadas
        
        super().save(*args, **kwargs)
    
    def __str__(self):
        return f"{self.name_school} - {self.municipality.name}/{self.state.code}"
