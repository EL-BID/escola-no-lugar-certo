import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { BookOpen, ChevronDown, ChevronUp, Scale } from 'lucide-react';

export function InfoWidget() {
  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <Card className="w-auto bg-card/95 shadow-lg backdrop-blur-sm">
      <CardHeader className={`${isExpanded ? 'pb-3' : 'py-4'}`}>
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="text-sm flex items-center leading-none">
            <BookOpen className="mr-2 h-4 w-4" />
            Informações
          </CardTitle>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setIsExpanded(!isExpanded)}
            className={`p-0 ${isExpanded ? 'h-6 w-6' : 'h-5 w-5'} transition-all duration-300 ease-in-out`}
          >
            {isExpanded ? (
              <ChevronDown className="h-4 w-4" />
            ) : (
              <ChevronUp className="h-4 w-4" />
            )}
          </Button>
        </div>
      </CardHeader>
      {isExpanded && (
        <CardContent className="pb-4">
          <div className="flex flex-col gap-2">
            <a
              href="/legal"
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-primary hover:underline flex items-center gap-2"
            >
              <Scale className="h-3.5 w-3.5 shrink-0" />
              Aviso legal
            </a>
          </div>
        </CardContent>
      )}
    </Card>
  );
}
