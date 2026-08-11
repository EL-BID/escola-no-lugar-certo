import type { ReactNode } from 'react';
import { HelpCircle } from 'lucide-react';
import { Label } from './label';
import { cn } from '@/lib/utils';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from './tooltip';

interface LabelWithTooltipProps {
  htmlFor?: string;
  label: string;
  tooltip: string;
  tooltipContent?: ReactNode;
  showTooltip?: boolean;
  tooltipClassName?: string;
  className?: string;
  labelClassName?: string;
}

export function LabelWithTooltip({
  htmlFor,
  label,
  tooltip,
  tooltipContent,
  className,
  labelClassName,
  showTooltip = true,
  tooltipClassName,
}: LabelWithTooltipProps) {
  const hasTooltip = showTooltip && Boolean(tooltip?.trim());

  return (
    <div className={cn('flex items-center gap-1.5 min-w-0', className)}>
      <Label htmlFor={htmlFor} className={cn('leading-tight', labelClassName)}>{label}</Label>
      {hasTooltip && (
        <TooltipProvider delayDuration={120}>
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                aria-label={tooltip}
                className="inline-flex text-muted-foreground hover:text-foreground transition-colors flex-shrink-0"
              >
                <HelpCircle className="h-3.5 w-3.5" />
              </button>
            </TooltipTrigger>
            <TooltipContent className={cn('max-w-xs text-xs leading-relaxed', tooltipClassName)}>
              {tooltipContent ?? tooltip}
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      )}
    </div>
  );
}
