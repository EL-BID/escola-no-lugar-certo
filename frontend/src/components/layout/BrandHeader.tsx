import hexagonLogo from '@/assets/hexagon-logo.svg';

/**
 * BrandHeader — floating brand overlay for the dashboard map.
 * Renders the hexagon logo + app title + subtitle in the top-left corner.
 */
export function BrandHeader() {
  return (
    <div className="flex items-start gap-2.5 pointer-events-none select-none">
      <img
        src={hexagonLogo}
        alt="Escola no Lugar Certo"
        className="h-14 md:h-16 lg:h-[4.5rem] xl:h-20 w-auto"
        draggable={false}
      />
      <div className="relative flex flex-col px-1 py-0.5">
        <div
          aria-hidden="true"
          className="absolute -inset-x-2 -inset-y-1.5 -z-10 rounded-[1rem] bg-[radial-gradient(ellipse_at_center,_rgba(255,255,255,0.9)_0%,_rgba(255,255,255,0.55)_45%,_rgba(255,255,255,0)_78%)] blur-sm"
        />
        <h1 className="text-[0.95rem] md:text-[1.05rem] lg:text-[1.15rem] xl:text-[1.28rem] font-extrabold leading-[1.02] tracking-normal">
          ESCOLA
          <br />
          NO LUGAR
          <br />
          CERTO
        </h1>
        <p className="text-[0.44rem] md:text-[0.48rem] xl:text-[0.52rem] leading-tight font-bold mt-0.5">
          Gestão de Escola é Análise
          <br />
          de Salas de Aula
        </p>
      </div>
    </div>
  );
}
