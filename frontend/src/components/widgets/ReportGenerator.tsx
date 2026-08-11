import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { FileText } from 'lucide-react';
import { useDashboardStore } from '@/lib/stores/dashboardStore';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

export function ReportGenerator() {
  const { 
    appliedState, 
    appliedEducationLevels,
    setReportModalOpen,
  } = useDashboardStore();

  const isDisabled = !appliedState || appliedEducationLevels.length === 0;

  const handleGenerateReport = () => {
    if (isDisabled) {
      toast.error('Selecione uma região e pelo menos um nível de ensino');
      return;
    }
    
    toast.info('Gerando relatório...');
    setReportModalOpen(true);
  };

  return (
    <TooltipProvider delayDuration={120}>
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="inline-flex">
            <Button
              variant="outline"
              disabled={isDisabled}
              aria-label={isDisabled ? 'Selecione uma região e nível de ensino primeiro' : 'Gerar relatório PDF da análise atual'}
              className={cn(
                'gap-2 bg-card/95 shadow-lg backdrop-blur-sm rounded-xl px-4 py-4 h-auto',
                !isDisabled && 'border-blue-500 text-blue-500 hover:border-blue-600 hover:text-blue-600'
              )}
              onClick={handleGenerateReport}
            >
              <FileText className="h-4 w-4" />
              <span className="text-sm font-semibold">Gerar Relatório</span>
            </Button>
          </span>
        </TooltipTrigger>
        <TooltipContent>
          {isDisabled ? 'Selecione uma região e nível de ensino primeiro' : 'Gerar relatório PDF da análise atual'}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
