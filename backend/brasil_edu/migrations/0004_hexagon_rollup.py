from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('brasil_edu', '0003_hexagon_composite_indexes'),
    ]

    operations = [
        migrations.CreateModel(
            name='HexagonRollup',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('h3_index', models.CharField(max_length=20, verbose_name='H3 Index')),
                ('resolution', models.IntegerField(verbose_name='H3 Resolution')),
                ('source_resolution', models.IntegerField(default=8, verbose_name='Source H3 Resolution')),
                ('pop_inf_cre', models.DecimalField(decimal_places=4, default=0, max_digits=16)),
                ('pop_inf_pre', models.DecimalField(decimal_places=4, default=0, max_digits=16)),
                ('pop_fund_ai', models.DecimalField(decimal_places=4, default=0, max_digits=16)),
                ('pop_fund_af', models.DecimalField(decimal_places=4, default=0, max_digits=16)),
                ('pop_med', models.DecimalField(decimal_places=4, default=0, max_digits=16)),
                ('qt_mat_inf_cre', models.BigIntegerField(default=0)),
                ('qt_mat_inf_pre', models.BigIntegerField(default=0)),
                ('qt_mat_fund_ai', models.BigIntegerField(default=0)),
                ('qt_mat_fund_af', models.BigIntegerField(default=0)),
                ('qt_mat_med', models.BigIntegerField(default=0)),
                ('qt_mat_inf_cre_int', models.BigIntegerField(default=0)),
                ('qt_mat_inf_pre_int', models.BigIntegerField(default=0)),
                ('qt_mat_fund_ai_int', models.BigIntegerField(default=0)),
                ('qt_mat_fund_af_int', models.BigIntegerField(default=0)),
                ('qt_mat_med_int', models.BigIntegerField(default=0)),
                ('private_qt_mat_inf_cre', models.BigIntegerField(default=0)),
                ('private_qt_mat_inf_pre', models.BigIntegerField(default=0)),
                ('private_qt_mat_fund_ai', models.BigIntegerField(default=0)),
                ('private_qt_mat_fund_af', models.BigIntegerField(default=0)),
                ('private_qt_mat_med', models.BigIntegerField(default=0)),
                ('qt_mat_bas_n', models.BigIntegerField(default=0)),
                ('qt_salas_utilizadas', models.BigIntegerField(default=0)),
                ('qt_salas_weighted_inf_cre', models.DecimalField(decimal_places=4, default=0, max_digits=16)),
                ('qt_salas_weighted_inf_pre', models.DecimalField(decimal_places=4, default=0, max_digits=16)),
                ('qt_salas_weighted_fund_ai', models.DecimalField(decimal_places=4, default=0, max_digits=16)),
                ('qt_salas_weighted_fund_af', models.DecimalField(decimal_places=4, default=0, max_digits=16)),
                ('qt_salas_weighted_med', models.DecimalField(decimal_places=4, default=0, max_digits=16)),
                ('nocturnal_weighted_fund_af', models.DecimalField(decimal_places=4, default=0, max_digits=16)),
                ('nocturnal_weighted_med', models.DecimalField(decimal_places=4, default=0, max_digits=16)),
                ('source_hexagon_count', models.IntegerField(default=0)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('municipality', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.CASCADE, related_name='hexagon_rollups', to='brasil_edu.municipality')),
                ('state', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='hexagon_rollups', to='brasil_edu.state')),
            ],
            options={
                'verbose_name': 'Hexagon Rollup',
                'verbose_name_plural': 'Hexagon Rollups',
                'db_table': 'hexagon_rollups',
                'ordering': ['h3_index'],
                'indexes': [
                    models.Index(fields=['state', 'resolution'], name='hexroll_state_res_idx'),
                    models.Index(fields=['municipality', 'resolution'], name='hexroll_mun_res_idx'),
                    models.Index(fields=['h3_index'], name='hexroll_h3_idx'),
                ],
                'constraints': [
                    models.UniqueConstraint(condition=models.Q(('municipality__isnull', True)), fields=('state', 'resolution', 'h3_index'), name='hexroll_state_res_h3_uniq'),
                    models.UniqueConstraint(condition=models.Q(('municipality__isnull', False)), fields=('municipality', 'resolution', 'h3_index'), name='hexroll_mun_res_h3_uniq'),
                ],
            },
        ),
    ]
