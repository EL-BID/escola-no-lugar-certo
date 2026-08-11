import { useDashboardStore } from '../../lib/stores/dashboardStore';
import { Card } from '../ui/card';
import { MapPin, Loader2 } from 'lucide-react';

interface MapPlaceholderProps {
  isLoading?: boolean;
}

export function MapPlaceholder({ isLoading = false }: MapPlaceholderProps) {
  const { selectedState, mapResolution } = useDashboardStore();

  return (
    <div className="w-full h-full flex items-center justify-center">
      <Card className="p-8 max-w-md text-center border-transparent shadow-none bg-transparent">
        {isLoading ? (
          <div className="space-y-4">
            <Loader2 className="h-12 w-12 mx-auto animate-spin text-primary" />
            <div>
              <h3 className="text-lg font-semibold">Carregando dados do mapa...</h3>
              <p className="text-sm text-muted-foreground">
                Buscando dados hexagonais para {selectedState?.name}
              </p>
            </div>
          </div>
        ) : selectedState ? (
          <div className="space-y-4">
            <MapPin className="h-12 w-12 mx-auto text-primary" />
            <div>
              <h3 className="text-lg font-semibold">Mapa Educacional</h3>
              <p className="text-sm text-muted-foreground">
                Estado: {selectedState.name} ({selectedState.code})
              </p>
              <p className="text-sm text-muted-foreground">
                Resolução: {mapResolution}
              </p>
              <p className="text-xs text-muted-foreground mt-2">
                O componente DeckGL será implementado em breve
              </p>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <MapPin className="h-12 w-12 mx-auto text-muted-foreground" />
            <div>
              <h3 className="text-lg font-semibold">Selecione um Estado</h3>
              <p className="text-sm text-muted-foreground">
                Escolha um estado no painel lateral para visualizar os dados educacionais
              </p>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}