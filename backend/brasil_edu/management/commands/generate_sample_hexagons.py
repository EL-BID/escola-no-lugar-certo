"""
Management command to generate sample H3 hexagons for testing purposes.

Usage:
    python manage.py generate_sample_hexagons --state-code PA --center-lat -1.4558 --center-lon -48.4902 --count 100
"""

from django.core.management.base import BaseCommand, CommandError
from django.db import transaction
import h3
import random
from brasil_edu.models import State, Municipality, Hexagon, EducationData
import logging

logger = logging.getLogger(__name__)


class Command(BaseCommand):
    help = 'Generate sample H3 hexagons with education data for testing'
    
    def add_arguments(self, parser):
        parser.add_argument(
            '--state-code', 
            type=str, 
            required=True,
            help='State code (e.g., PA, SP, RJ)'
        )
        parser.add_argument(
            '--center-lat',
            type=float,
            default=-15.77972,
            help='Center latitude for generating hexagons (default: -15.77972)'
        )
        parser.add_argument(
            '--center-lon',
            type=float,
            default=-47.92972,
            help='Center longitude for generating hexagons (default: -47.92972)'
        )
        parser.add_argument(
            '--resolution',
            type=int,
            default=7,
            help='H3 resolution (default: 7)'
        )
        parser.add_argument(
            '--radius',
            type=int,
            default=3,
            help='Radius in H3 cells around center (default: 3)'
        )
        parser.add_argument(
            '--count',
            type=int,
            default=50,
            help='Maximum number of hexagons to generate (default: 50)'
        )
        parser.add_argument(
            '--municipality',
            type=str,
            help='Specific municipality name to associate hexagons with'
        )
    
    def handle(self, *args, **options):
        """Main command handler"""
        state_code = options['state_code'].upper()
        
        self.stdout.write(
            self.style.SUCCESS(f'Generating sample hexagons for state {state_code}...')
        )
        
        try:
            # Get the state
            try:
                state = State.objects.get(code=state_code)
                self.stdout.write(f'Found state: {state}')
            except State.DoesNotExist:
                raise CommandError(f'State with code {state_code} not found. Please import geographic data first.')
            
            # Get municipality if specified
            municipality = None
            if options['municipality']:
                try:
                    municipality = Municipality.objects.get(
                        state=state,
                        name=options['municipality']
                    )
                    self.stdout.write(f'Found municipality: {municipality}')
                except Municipality.DoesNotExist:
                    self.stdout.write(
                        self.style.WARNING(f'Municipality {options["municipality"]} not found, proceeding without it')
                    )
            
            # Generate hexagons
            hexagons_created = self._generate_hexagons(
                state,
                municipality,
                options['center_lat'],
                options['center_lon'],
                options['resolution'],
                options['radius'],
                options['count']
            )
            
            # Summary
            self.stdout.write(
                self.style.SUCCESS(
                    f'Generation completed successfully!\n'
                    f'Hexagons created: {hexagons_created}'
                )
            )
            
        except Exception as e:
            raise CommandError(f'Generation failed: {str(e)}')
    
    def _generate_hexagons(self, state, municipality, center_lat, center_lon, resolution, radius, max_count):
        """Generate sample hexagons around a center point"""
        self.stdout.write(
            f'Generating hexagons around ({center_lat}, {center_lon}) '
            f'at resolution {resolution} with radius {radius}...'
        )
        
        try:
            # Get center hexagon
            center_h3 = h3.latlng_to_cell(center_lat, center_lon, resolution)
            
            # Get all hexagons within radius
            hex_ring = h3.grid_disk(center_h3, radius)
            
            # Limit to max_count
            if len(hex_ring) > max_count:
                hex_ring = list(hex_ring)[:max_count]
            
            self.stdout.write(f'Found {len(hex_ring)} hexagons to create')
            
            created_count = 0
            
            with transaction.atomic():
                for h3_index in hex_ring:
                    try:
                        # Check if hexagon already exists
                        if Hexagon.objects.filter(h3_index=h3_index).exists():
                            self.stdout.write(f'  Hexagon {h3_index} already exists, skipping')
                            continue
                        
                        # Create hexagon using the model's class method
                        hexagon = Hexagon.create_from_h3(h3_index, state, municipality)
                        
                        # Create sample education data
                        education_data = self._generate_sample_education_data(hexagon)
                        
                        self.stdout.write(f'  Created hexagon: {hexagon}')
                        created_count += 1
                        
                    except Exception as e:
                        self.stdout.write(
                            self.style.ERROR(f'Error creating hexagon {h3_index}: {str(e)}')
                        )
                        continue
            
            return created_count
            
        except Exception as e:
            raise CommandError(f'Failed to generate hexagons: {str(e)}')
    
    def _generate_sample_education_data(self, hexagon):
        """Generate sample education data for a hexagon"""
        # Generate realistic random data
        base_population = random.randint(100, 1000)
        
        # Population by age groups (proportional to base)
        pop_inf_cre = base_population * random.uniform(0.05, 0.15)  # 5-15% are 0-3 years
        pop_inf_pre = base_population * random.uniform(0.03, 0.08)  # 3-8% are 4-5 years
        pop_fund_ai = base_population * random.uniform(0.08, 0.15)  # 8-15% are 6-10 years
        pop_fund_af = base_population * random.uniform(0.06, 0.12)  # 6-12% are 11-14 years
        pop_med = base_population * random.uniform(0.04, 0.08)      # 4-8% are 15-17 years
        
        # Enrollment (percentage of population actually enrolled)
        enrollment_rate = random.uniform(0.7, 0.95)  # 70-95% enrollment rate
        
        qt_mat_inf_cre = int(pop_inf_cre * enrollment_rate * random.uniform(0.3, 0.7))  # Lower enrollment for creche
        qt_mat_inf_pre = int(pop_inf_pre * enrollment_rate * random.uniform(0.6, 0.9))
        qt_mat_fund_ai = int(pop_fund_ai * enrollment_rate * random.uniform(0.85, 0.98))
        qt_mat_fund_af = int(pop_fund_af * enrollment_rate * random.uniform(0.80, 0.95))
        qt_mat_med = int(pop_med * enrollment_rate * random.uniform(0.70, 0.90))
        
        # Full-time students (percentage of enrolled students)
        integral_rate = random.uniform(0.1, 0.4)  # 10-40% full-time
        
        qt_mat_inf_cre_int = int(qt_mat_inf_cre * integral_rate)
        qt_mat_inf_pre_int = int(qt_mat_inf_pre * integral_rate)
        qt_mat_fund_ai_int = int(qt_mat_fund_ai * integral_rate)
        qt_mat_fund_af_int = int(qt_mat_fund_af * integral_rate)
        qt_mat_med_int = int(qt_mat_med * integral_rate)
        
        # Calculate proportions
        total_enrollment = qt_mat_inf_cre + qt_mat_inf_pre + qt_mat_fund_ai + qt_mat_fund_af + qt_mat_med
        
        qt_mat_inf_cre_prop = qt_mat_inf_cre / total_enrollment if total_enrollment > 0 else 0
        qt_mat_inf_pre_prop = qt_mat_inf_pre / total_enrollment if total_enrollment > 0 else 0
        qt_mat_fund_ai_prop = qt_mat_fund_ai / total_enrollment if total_enrollment > 0 else 0
        qt_mat_fund_af_prop = qt_mat_fund_af / total_enrollment if total_enrollment > 0 else 0
        qt_mat_med_prop = qt_mat_med / total_enrollment if total_enrollment > 0 else 0
        
        # Night shift (small percentage of total)
        qt_mat_bas_n = int(total_enrollment * random.uniform(0.02, 0.08))
        
        # Infrastructure (classrooms based on enrollment)
        students_per_classroom = random.randint(20, 35)
        qt_salas_utilizadas = max(1, int(total_enrollment / students_per_classroom)) if total_enrollment > 0 else 0
        
        # Private school enrollment (smaller numbers)
        private_rate = random.uniform(0.1, 0.3)  # 10-30% of public enrollment
        
        private_qt_mat_inf_cre = int(qt_mat_inf_cre * private_rate)
        private_qt_mat_inf_pre = int(qt_mat_inf_pre * private_rate)
        private_qt_mat_fund_ai = int(qt_mat_fund_ai * private_rate)
        private_qt_mat_fund_af = int(qt_mat_fund_af * private_rate)
        private_qt_mat_med = int(qt_mat_med * private_rate)
        
        # Create education data record
        education_data = EducationData.objects.create(
            hexagon=hexagon,
            pop_inf_cre=pop_inf_cre,
            pop_inf_pre=pop_inf_pre,
            pop_fund_ai=pop_fund_ai,
            pop_fund_af=pop_fund_af,
            pop_med=pop_med,
            qt_mat_inf_cre=qt_mat_inf_cre,
            qt_mat_inf_pre=qt_mat_inf_pre,
            qt_mat_fund_ai=qt_mat_fund_ai,
            qt_mat_fund_af=qt_mat_fund_af,
            qt_mat_med=qt_mat_med,
            qt_mat_inf_cre_int=qt_mat_inf_cre_int,
            qt_mat_inf_pre_int=qt_mat_inf_pre_int,
            qt_mat_fund_ai_int=qt_mat_fund_ai_int,
            qt_mat_fund_af_int=qt_mat_fund_af_int,
            qt_mat_med_int=qt_mat_med_int,
            qt_mat_inf_cre_prop=qt_mat_inf_cre_prop,
            qt_mat_inf_pre_prop=qt_mat_inf_pre_prop,
            qt_mat_fund_ai_prop=qt_mat_fund_ai_prop,
            qt_mat_fund_af_prop=qt_mat_fund_af_prop,
            qt_mat_med_prop=qt_mat_med_prop,
            qt_mat_bas_n=qt_mat_bas_n,
            qt_salas_utilizadas=qt_salas_utilizadas,
            private_qt_mat_inf_cre=private_qt_mat_inf_cre,
            private_qt_mat_inf_pre=private_qt_mat_inf_pre,
            private_qt_mat_fund_ai=private_qt_mat_fund_ai,
            private_qt_mat_fund_af=private_qt_mat_fund_af,
            private_qt_mat_med=private_qt_mat_med,
            data_year=2024
        )
        
        return education_data