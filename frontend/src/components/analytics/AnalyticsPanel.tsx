import { useDashboardStore } from '../../lib/stores/dashboardStore';
import { useAnalyticsSummary } from '../../hooks/api';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Users, GraduationCap, Building, Calculator } from 'lucide-react';
import { formatValue } from '../../lib/utils';
import type { AnalyticsSummary } from '../../types/api';

interface MetricCardProps {
  title: string;
  value: number;
  format: 'number' | 'decimal' | 'percentage' | 'currency';
  icon: React.ElementType;
}

function MetricCard({ title, value, format, icon: Icon }: MetricCardProps) {
  return (
    <Card className="p-4">
      <div className="flex items-center space-x-2">
        <Icon className="h-4 w-4 text-muted-foreground" />
        <span className="text-sm font-medium">{title}</span>
      </div>
      <p className="text-2xl font-bold mt-2">
        {formatValue(value, format)}
      </p>
    </Card>
  );
}

function SummaryMetrics({ data }: { data: AnalyticsSummary }) {
  const metrics = [
    {
      title: 'População Total',
      value: Object.values(data.total_population).reduce((a: number, b: number) => a + b, 0),
      format: 'number' as const,
      icon: Users,
    },
    {
      title: 'Matrículas Totais',
      value: Object.values(data.total_enrollment).reduce((a: number, b: number) => a + b, 0),
      format: 'number' as const,
      icon: GraduationCap,
    },
    {
      title: 'Salas de Aula',
      value: data.infrastructure.total_classrooms,
      format: 'number' as const,
      icon: Building,
    },
    {
      title: 'Alunos/Sala (Média)',
      value: data.infrastructure.avg_students_per_classroom,
      format: 'decimal' as const,
      icon: Calculator,
    },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      {metrics.map((metric) => (
        <MetricCard key={metric.title} {...metric} />
      ))}
    </div>
  );
}

export function AnalyticsPanel() {
  const { selectedState, selectedMunicipality } = useDashboardStore();

  const { data: analyticsData, isLoading, error } = useAnalyticsSummary({
    state: selectedState?.code,
    municipality_code: selectedMunicipality?.code_ibge || undefined,
  });

  if (!selectedState) {
    return (
      <Card className="h-full">
        <CardContent className="flex items-center justify-center h-full">
          <div className="text-center text-muted-foreground">
            <Calculator className="h-12 w-12 mx-auto mb-4" />
            <p>Selecione um estado para ver a análise</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card className="h-full">
        <CardContent className="flex items-center justify-center h-full">
          <div className="text-center text-destructive">
            <p>Erro ao carregar dados de análise</p>
            <p className="text-sm">{error instanceof Error ? error.message : 'Erro desconhecido'}</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="h-full">
      <CardHeader>
        <CardTitle className="flex items-center space-x-2">
          <Calculator className="h-5 w-5" />
          <span>Análise Educacional</span>
          {selectedState && (
            <span className="text-sm font-normal text-muted-foreground">
              • {selectedState.name}
              {selectedMunicipality && ` • ${selectedMunicipality.name}`}
            </span>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex items-center justify-center h-32">
            <div className="text-center">
              <div className="animate-spin h-8 w-8 border-2 border-primary border-t-transparent rounded-full mx-auto mb-2"></div>
              <p className="text-sm text-muted-foreground">Carregando análise...</p>
            </div>
          </div>
        ) : analyticsData ? (
          <SummaryMetrics data={analyticsData.summary} />
        ) : (
          <div className="text-center text-muted-foreground">
            <p>Nenhum dado disponível</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}