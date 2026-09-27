import { ChevronDown } from 'lucide-react';
import type { ConteudoLP } from '../types';

interface Props {
  itens: ConteudoLP['faq'];
  classeItem?: string;
  classePergunta?: string;
  classeResposta?: string;
  corIcone?: string;
}

/** Acordeão acessível sem JavaScript (details/summary) */
export function Faq({ itens, classeItem = '', classePergunta = '', classeResposta = '', corIcone }: Props) {
  return (
    <div className="space-y-3">
      {itens.map((f, i) => (
        <details key={i} className={`group ${classeItem}`} open={i === 0}>
          <summary className={`flex cursor-pointer list-none items-center justify-between gap-4 [&::-webkit-details-marker]:hidden ${classePergunta}`}>
            <span>{f.pergunta}</span>
            <ChevronDown className="h-5 w-5 shrink-0 transition-transform duration-200 group-open:rotate-180" style={{ color: corIcone }} aria-hidden />
          </summary>
          <p className={classeResposta}>{f.resposta}</p>
        </details>
      ))}
    </div>
  );
}
