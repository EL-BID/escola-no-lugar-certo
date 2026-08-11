from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('brasil_edu', '0002_state_code_region'),
    ]

    operations = [
        migrations.SeparateDatabaseAndState(
            database_operations=[
                migrations.RunSQL(
                    sql=(
                        "CREATE INDEX IF NOT EXISTS hexagons_state_res_idx "
                        "ON hexagons (state_id, resolution);"
                    ),
                    reverse_sql="DROP INDEX IF EXISTS hexagons_state_res_idx;",
                ),
                migrations.RunSQL(
                    sql=(
                        "CREATE INDEX IF NOT EXISTS hexagons_mun_res_idx "
                        "ON hexagons (municipality_id, resolution);"
                    ),
                    reverse_sql="DROP INDEX IF EXISTS hexagons_mun_res_idx;",
                ),
            ],
            state_operations=[
                migrations.AddIndex(
                    model_name='hexagon',
                    index=models.Index(
                        fields=['state', 'resolution'],
                        name='hexagons_state_res_idx',
                    ),
                ),
                migrations.AddIndex(
                    model_name='hexagon',
                    index=models.Index(
                        fields=['municipality', 'resolution'],
                        name='hexagons_mun_res_idx',
                    ),
                ),
            ],
        ),
    ]
