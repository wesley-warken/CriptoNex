import { Star } from 'lucide-react';
import { CoinLogo } from '@/components/ui/coin-logo';
import { thesisDirection, type Setup, type ThesisDirection } from '../domain/entities';
import { price, setupShort } from './format';

export interface SetupsTableProps {
  rows: Setup[];
  logos: Map<string, string>;
  favorites: string[];
  onToggleFav: (symbol: string) => void;
  selected: string | null;
  onSelect: (symbol: string) => void;
}

const DIR_COLOR: Record<ThesisDirection, { text: string; bar: string; dot: string }> = {
  aligned: { text: 'text-[var(--bull)]', bar: 'bg-[var(--bull)]', dot: 'bg-[var(--bull)]' },
  against: { text: 'text-[var(--bear)]', bar: 'bg-[var(--bear)]', dot: 'bg-[var(--bear)]' },
  neutral: { text: 'text-[var(--text-primary)]', bar: 'bg-[var(--text-muted)]', dot: 'bg-[var(--text-muted)]' },
};

function LiquidityLabel({ value }: { value: string }) {
  return <span className="text-xs text-[var(--text-secondary)]">{value === 'alta' ? 'Alta' : value === 'media' ? 'Média' : 'Baixa'}</span>;
}

/**
 * Tabela de setups: densa e calma. Linhas sem tint — direção só na cor
 * do sinal (dot do setup) e do score (número + barra de 40px).
 * Números com tabular-nums, alinhados à direita. Clique abre o painel.
 */
export function SetupsTable({ rows, logos, favorites, onToggleFav, selected, onSelect }: SetupsTableProps) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[760px] border-collapse text-sm">
        <thead>
          <tr className="border-b border-[var(--border)] text-left text-xs font-medium uppercase tracking-wider text-[var(--text-muted)]">
            <th className="w-10 py-2 pr-2 font-medium"><span className="sr-only">Favorito</span></th>
            <th className="py-2 pr-4 font-medium">Ativo</th>
            <th className="py-2 pr-4 font-medium">Setup</th>
            <th className="py-2 pr-4 text-right font-medium">Entrada · stop · alvo</th>
            <th className="w-16 py-2 pr-4 text-right font-medium">R:R</th>
            <th className="w-28 py-2 pr-4 text-right font-medium">Score</th>
            <th className="w-20 py-2 text-right font-medium">Liquidez</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[var(--border)]">
          {rows.map((o) => {
            const dir = thesisDirection(o);
            const c = DIR_COLOR[dir];
            const fav = favorites.includes(o.symbol);
            const isSel = selected === o.symbol;
            return (
              <tr
                key={o.symbol}
                onClick={() => onSelect(o.symbol)}
                title="Ver detalhe"
                aria-selected={isSel}
                className={`cursor-pointer transition-colors duration-150 ease-out hover:bg-[var(--surface-2)] ${
                  isSel ? 'shadow-[inset_2px_0_0_0_var(--brand)] bg-[var(--surface-2)]/60' : ''
                }`}
              >
                <td className="py-2 pr-2">
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); onToggleFav(o.symbol); }}
                    aria-label={fav ? `Remover ${o.symbol} dos favoritos` : `Favoritar ${o.symbol}`}
                    aria-pressed={fav}
                    className={`p-1 transition-all duration-150 ease-out active:scale-[0.98] ${
                      fav ? 'text-amber-500' : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
                    }`}
                  >
                    <Star size={16} aria-hidden="true" fill={fav ? 'currentColor' : 'none'} />
                  </button>
                </td>
                <td className="py-2 pr-4">
                  <span className="flex items-center gap-2.5">
                    <CoinLogo symbol={o.symbol} image={logos.get(o.symbol)} size={18} />
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); onSelect(o.symbol); }}
                      className="min-w-0 text-left"
                    >
                      <span className={`block truncate font-semibold leading-5 ${isSel ? 'text-[var(--brand)]' : 'text-[var(--text-primary)]'}`}>
                        {o.symbol}
                      </span>
                      <span className="block truncate text-xs leading-4 text-[var(--text-muted)]">{o.name}</span>
                    </button>
                  </span>
                </td>
                <td className="whitespace-nowrap py-2 pr-4">
                  <span className="inline-flex items-center gap-1.5 text-[var(--text-secondary)]">
                    <span className={`h-1.5 w-1.5 rounded-full ${c.dot}`} aria-hidden="true" />
                    {setupShort(o.setup)}
                  </span>
                </td>
                <td className="whitespace-nowrap py-2 pr-4 text-right tabular-nums">
                  <span className="block text-[var(--text-primary)]">
                    {o.entryLow != null ? `${price(o.entryLow)}–${price(o.entryHigh)}` : '—'}
                  </span>
                  <span className="block text-xs text-[var(--text-muted)]">
                    S {price(o.stop)} · T1 {price(o.t1)}
                  </span>
                </td>
                <td className={`whitespace-nowrap py-2 pr-4 text-right tabular-nums font-semibold ${o.rr1 != null && o.rr1 >= 2 ? 'text-[var(--bull)]' : 'text-[var(--text-secondary)]'}`}>
                  {o.rr1 != null ? o.rr1.toFixed(1) : '—'}
                </td>
                <td className="whitespace-nowrap py-2 pr-4">
                  <span className="flex items-center justify-end gap-2">
                    <span className={`tabular-nums text-sm font-semibold ${c.text}`}>{o.score}</span>
                    <span className="h-1.5 w-10 overflow-hidden rounded-full bg-[var(--surface-2)] border border-[var(--border)]" aria-hidden="true">
                      <span className={`block h-full rounded-full ${c.bar}`} style={{ width: `${o.score}%` }} />
                    </span>
                  </span>
                </td>
                <td className="whitespace-nowrap py-2 text-right">
                  <LiquidityLabel value={o.liquidity} />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
