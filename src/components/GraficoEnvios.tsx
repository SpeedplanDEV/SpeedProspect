import { useEffect, useMemo, useRef, useState } from 'react';
import { formatarNumero } from '@/lib/format';
import type { PontoSerie } from '@/lib/fila';

const SERIES = [
  { chave: 'envios', rotulo: 'Envios', cor: 'var(--serie-1)' },
  { chave: 'aberturas', rotulo: 'Aberturas da prévia', cor: 'var(--serie-2)' },
] as const;

const ALTURA = 220;
const M = { topo: 12, dir: 12, base: 26, esq: 34 };

const diaMes = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
const dataLonga = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;

/** Escala "bonita" para o eixo Y (0, 2, 4… / 0, 5, 10…) */
function ticksY(max: number): number[] {
  const alvo = Math.max(4, max);
  const bruto = alvo / 4;
  const pot = 10 ** Math.floor(Math.log10(bruto));
  const passo = [1, 2, 5, 10].map((m) => m * pot).find((p) => p >= bruto) ?? bruto;
  const topo = Math.ceil(alvo / passo) * passo;
  return Array.from({ length: Math.round(topo / passo) + 1 }, (_, i) => i * passo);
}

/** Envios × aberturas por dia (últimos 30 dias): duas linhas, mesma unidade, um só eixo */
export function GraficoEnvios({ serie }: { serie: PontoSerie[] }) {
  const caixa = useRef<HTMLDivElement>(null);
  const [largura, setLargura] = useState(640);
  const [foco, setFoco] = useState<number | null>(null);
  const [tabela, setTabela] = useState(false);

  useEffect(() => {
    const el = caixa.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setLargura(Math.max(280, e.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, [tabela]);

  const ticks = useMemo(() => ticksY(Math.max(0, ...serie.flatMap((p) => [p.envios, p.aberturas]))), [serie]);
  const topo = ticks[ticks.length - 1] || 1;
  const w = largura - M.esq - M.dir;
  const h = ALTURA - M.topo - M.base;
  const x = (i: number) => M.esq + (serie.length > 1 ? (i / (serie.length - 1)) * w : w / 2);
  const y = (v: number) => M.topo + h - (v / topo) * h;
  const caminho = (k: 'envios' | 'aberturas') => serie.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p[k]).toFixed(1)}`).join(' ');
  const passoRotulo = largura < 480 ? 7 : 5;
  const totais = { envios: serie.reduce((t, p) => t + p.envios, 0), aberturas: serie.reduce((t, p) => t + p.aberturas, 0) };

  const aoMover = (clientX: number) => {
    const r = caixa.current?.getBoundingClientRect();
    if (!r || !serie.length) return;
    const rel = (clientX - r.left - M.esq) / w;
    setFoco(Math.min(serie.length - 1, Math.max(0, Math.round(rel * (serie.length - 1)))));
  };

  const p = foco != null ? serie[foco] : null;

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-suave">
        {SERIES.map((s) => (
          <span key={s.chave} className="inline-flex items-center gap-1.5">
            <span className="h-0.5 w-4 rounded-full" style={{ background: s.cor }} aria-hidden />
            {s.rotulo} <span className="font-medium tabular-nums text-texto">{formatarNumero(totais[s.chave])}</span>
          </span>
        ))}
        <button className="ml-auto text-marca hover:underline" onClick={() => setTabela((t) => !t)}>
          {tabela ? 'Ver gráfico' : 'Ver tabela'}
        </button>
      </div>

      {tabela ? (
        <div className="max-h-[240px] overflow-y-auto">
          <table className="tabela">
            <thead><tr><th>Dia</th><th className="text-right">Envios</th><th className="text-right">Aberturas</th></tr></thead>
            <tbody>
              {[...serie].reverse().map((d) => (
                <tr key={d.dia}><td>{dataLonga(d.dia)}</td><td className="text-right tabular-nums">{d.envios}</td><td className="text-right tabular-nums">{d.aberturas}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div
          ref={caixa}
          className="relative"
          onMouseMove={(e) => aoMover(e.clientX)}
          onMouseLeave={() => setFoco(null)}
          onTouchStart={(e) => aoMover(e.touches[0].clientX)}
          onTouchMove={(e) => aoMover(e.touches[0].clientX)}
        >
          <svg width={largura} height={ALTURA} role="img" aria-label={`Envios e aberturas por dia nos últimos 30 dias: ${totais.envios} envios e ${totais.aberturas} aberturas`}>
            {ticks.map((t) => (
              <g key={t}>
                <line x1={M.esq} x2={largura - M.dir} y1={y(t)} y2={y(t)} stroke="rgb(var(--borda))" strokeDasharray={t ? '2 3' : undefined} />
                <text x={M.esq - 8} y={y(t) + 3.5} textAnchor="end" fontSize="10" fill="rgb(var(--fraco))" className="tabular-nums">{t}</text>
              </g>
            ))}
            {serie.map((d, i) =>
              i % passoRotulo === (serie.length - 1) % passoRotulo ? (
                <text key={d.dia} x={x(i)} y={ALTURA - 8} textAnchor={i === serie.length - 1 ? 'end' : i === 0 ? 'start' : 'middle'} fontSize="10" fill="rgb(var(--fraco))">{diaMes(d.dia)}</text>
              ) : null,
            )}
            {foco != null && <line x1={x(foco)} x2={x(foco)} y1={M.topo} y2={M.topo + h} stroke="rgb(var(--suave))" strokeOpacity="0.5" />}
            {SERIES.map((s) => (
              <path key={s.chave} d={caminho(s.chave)} fill="none" stroke={s.cor} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
            ))}
            {foco != null &&
              SERIES.map((s) => (
                <circle key={s.chave} cx={x(foco)} cy={y(serie[foco][s.chave])} r="4.5" fill={s.cor} stroke="rgb(var(--superficie))" strokeWidth="2" />
              ))}
          </svg>
          {p && foco != null && (
            <div
              className="pointer-events-none absolute top-1 z-10 min-w-[150px] rounded-md border border-borda bg-superficie px-3 py-2 text-xs shadow-lg"
              style={x(foco) > largura / 2 ? { right: largura - x(foco) + 10 } : { left: x(foco) + 10 }}
            >
              <div className="mb-1 font-medium">{dataLonga(p.dia)}</div>
              {SERIES.map((s) => (
                <div key={s.chave} className="flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full" style={{ background: s.cor }} aria-hidden />
                  <span className="text-suave">{s.rotulo}</span>
                  <span className="ml-auto font-medium tabular-nums">{p[s.chave]}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
