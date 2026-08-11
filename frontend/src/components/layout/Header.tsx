import { Menu, X } from 'lucide-react';
import { Button } from '../ui/button';
import { useDashboardStore } from '../../lib/stores/dashboardStore';

export function Header() {
  const { toggleSidebar, sidebarOpen } = useDashboardStore();

  return (
    <header className="bg-background border-b border-border px-4 py-3 flex items-center justify-between">
      <div className="flex items-center space-x-4">
        <Button
          variant="ghost"
          size="icon"
          onClick={toggleSidebar}
          className="md:hidden"
        >
          {sidebarOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
        </Button>
        
        <div>
          <h1 className="text-xl font-semibold">Dashboard Educacional do Brasil</h1>
          <p className="text-sm text-muted-foreground">
            Análise de infraestrutura educacional com agregação espacial hexagonal
          </p>
        </div>
      </div>

      <div className="flex items-center space-x-2">
        <Button variant="outline" size="sm">
          Exportar Dados
        </Button>
      </div>
    </header>
  );
}