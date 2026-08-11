import { useId, useState } from 'react';
import { cn } from '@/lib/utils';
import { X, ChevronDown, ChevronUp } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

export type MultiSelectOption = {
  value: string;
  label: string;
  chipLabel?: string;
};

export interface MultiSelectProps {
  options: MultiSelectOption[];
  value: string[];
  onChange: (next: string[]) => void;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
}

export function MultiSelect({
  options,
  value,
  onChange,
  placeholder = 'Selecionar...',
  className,
  disabled,
}: MultiSelectProps) {
  const [open, setOpen] = useState(false);
  const listId = useId();

  const toggle = (v: string) => {
    const exists = value.includes(v);
    const next = exists ? value.filter((x) => x !== v) : [...value, v];
    onChange(next);
  };

  const clearAll = () => onChange([]);

  const handleTriggerKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (disabled) return;

    if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown') {
      e.preventDefault();
      setOpen(true);
      return;
    }

    if (e.key === 'Escape') {
      e.preventDefault();
      setOpen(false);
      return;
    }

    if ((e.key === 'Backspace' || e.key === 'Delete') && value.length > 0) {
      e.preventDefault();
      onChange(value.slice(0, -1));
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <div
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-haspopup="listbox"
          tabIndex={disabled ? -1 : 0}
          onKeyDown={handleTriggerKeyDown}
          onClick={() => !disabled && setOpen(true)}
          className={cn(
            'w-full min-h-10 rounded-md border border-input bg-transparent text-sm shadow-sm',
            'flex items-center gap-2 px-2 py-1.5',
            'focus:outline-none focus-visible:ring-2 focus-visible:ring-ring',
            open && 'ring-1 ring-ring',
            disabled && 'opacity-50 cursor-not-allowed',
            className
          )}
        >
          <div className="min-w-0 flex-1">
            {value.length === 0 ? (
              <span className="text-muted-foreground">{placeholder}</span>
            ) : (
              <div className="overflow-x-auto overflow-y-hidden whitespace-nowrap">
                <div className="inline-flex min-w-max items-center gap-1 pr-1">
                  {value.map((v) => {
                    const opt = options.find((o) => o.value === v);
                    const chipText = opt?.chipLabel ?? opt?.label ?? v;
                    return (
                      <span key={v} className="inline-flex max-w-[11rem] items-center gap-1 rounded-md border bg-muted/70 px-2 py-0.5">
                        <span className="truncate text-xs">{chipText}</span>
                        <button
                          type="button"
                          aria-label={`Remover ${chipText}`}
                          className="hover:text-destructive"
                          onClick={(e) => {
                            e.stopPropagation();
                            toggle(v);
                          }}
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </span>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          <div className="ml-1 flex shrink-0 items-center gap-1">
            {value.length > 0 && (
              <button
                type="button"
                aria-label="Limpar seleção"
                className="text-muted-foreground hover:text-foreground"
                onClick={(e) => {
                  e.stopPropagation();
                  clearAll();
                }}
              >
                <X className="h-4 w-4" />
              </button>
            )}
            <button
              type="button"
              aria-label={open ? 'Fechar' : 'Abrir'}
              className="text-muted-foreground hover:text-foreground"
              onClick={(e) => {
                e.stopPropagation();
                setOpen((o) => !o);
              }}
            >
              {open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </button>
          </div>
        </div>
      </PopoverTrigger>

      <PopoverContent
        align="start"
        sideOffset={6}
        className="z-[400] w-[var(--radix-popover-trigger-width)] max-h-64 overflow-auto rounded-md border bg-card/95 p-0 text-foreground shadow-lg backdrop-blur-sm"
      >
        <ul id={listId} role="listbox" aria-multiselectable className="divide-y divide-border">
          {options.map((opt) => {
            const checked = value.includes(opt.value);
            return (
              <li
                key={opt.value}
                role="option"
                aria-selected={checked}
                className={cn(
                  'flex items-center gap-2 px-3 py-2 cursor-pointer text-sm',
                  checked ? 'bg-accent text-accent-foreground' : 'hover:bg-accent'
                )}
                onClick={() => {
                  toggle(opt.value);
                }}
              >
                <input
                  type="checkbox"
                  checked={checked}
                  readOnly
                  className="h-4 w-4 accent-blue-500"
                />
                <span className="truncate">{opt.label}</span>
              </li>
            );
          })}
        </ul>
      </PopoverContent>
    </Popover>
  );
}

export default MultiSelect;
