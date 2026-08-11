import { useState, useEffect } from 'react';
import { Monitor } from 'lucide-react';
import { BrandHeader } from './BrandHeader';

const MIN_WIDTH = 768;

/** Static map tile centred on Brazil used as a decorative blurred background. */
const MAP_BG_URL =
  'https://a.basemaps.cartocdn.com/light_all/3/2/4.png'; // zoom-4 tile covering most of Brazil

export function MobileGuard({ children }: { children: React.ReactNode }) {
  const [isMobile, setIsMobile] = useState(() => window.innerWidth < MIN_WIDTH);

  useEffect(() => {
    const mql = window.matchMedia(`(max-width: ${MIN_WIDTH - 1}px)`);
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mql.addEventListener('change', handler);
    return () => mql.removeEventListener('change', handler);
  }, []);

  if (isMobile) {
    return (
      <div className="fixed inset-0 z-[10000] flex flex-col items-center justify-center bg-white">
        {/* Blurred map background */}
        <div
          className="absolute inset-0 bg-cover bg-center blur-sm"
          style={{ backgroundImage: `url(${MAP_BG_URL})` }}
          aria-hidden="true"
        />

        {/* Content */}
        <div className="relative z-10 flex flex-col items-center gap-8 px-8 text-center">
          <BrandHeader />

          <div className="flex flex-col items-center gap-3">
            <Monitor className="h-10 w-10 text-slate-500" />
            <h2 className="text-lg font-semibold leading-snug text-slate-800">
              Esta plataforma não é compatível com dispositivos móveis.
            </h2>
            <p className="max-w-xs text-sm text-slate-500">
              Por favor, acesse pelo computador.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
