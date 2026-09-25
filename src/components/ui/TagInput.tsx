import { useState, type KeyboardEvent } from 'react';
import { X } from 'lucide-react';

interface Props {
  valor: string[];
  aoMudar: (v: string[]) => void;
  placeholder?: string;
  id?: string;
}

/** Campo de tags: Enter ou vírgula adiciona, Backspace no campo vazio remove a última */
export function TagInput({ valor, aoMudar, placeholder, id }: Props) {
  const [texto, setTexto] = useState('');

  const adicionar = (bruto: string) => {
    const novos = bruto
      .split(',')
      .map((t) => t.trim())
      .filter((t) => t && !valor.some((v) => v.toLowerCase() === t.toLowerCase()));
    if (novos.length) aoMudar([...valor, ...novos]);
    setTexto('');
  };

  const aoTeclar = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      adicionar(texto);
    } else if (e.key === 'Backspace' && !texto && valor.length) {
      aoMudar(valor.slice(0, -1));
    }
  };

  return (
    <div className="input flex min-h-[34px] flex-wrap items-center gap-1 py-1 focus-within:border-marca focus-within:ring-2 focus-within:ring-marca/20">
      {valor.map((t) => (
        <span key={t} className="inline-flex items-center gap-1 rounded bg-marca/10 px-1.5 py-0.5 text-xs text-marca">
          {t}
          <button type="button" onClick={() => aoMudar(valor.filter((v) => v !== t))} aria-label={`Remover ${t}`}>
            <X size={12} />
          </button>
        </span>
      ))}
      <input
        id={id}
        value={texto}
        onChange={(e) => setTexto(e.target.value)}
        onKeyDown={aoTeclar}
        onBlur={() => texto && adicionar(texto)}
        placeholder={valor.length ? '' : placeholder}
        className="min-w-[120px] flex-1 bg-transparent text-sm outline-none placeholder:text-fraco"
      />
    </div>
  );
}
