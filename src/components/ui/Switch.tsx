interface Props {
  marcado: boolean;
  aoMudar: (v: boolean) => void;
  rotulo?: string;
  descricao?: string;
  id?: string;
}

export function Switch({ marcado, aoMudar, rotulo, descricao, id }: Props) {
  return (
    <label htmlFor={id} className="flex cursor-pointer items-start gap-3">
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={marcado}
        onClick={() => aoMudar(!marcado)}
        className={`relative mt-0.5 inline-flex h-5 w-9 shrink-0 rounded-full transition-colors ${
          marcado ? 'bg-marca' : 'bg-borda'
        }`}
      >
        <span
          className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform ${
            marcado ? 'translate-x-[18px]' : 'translate-x-0.5'
          }`}
        />
      </button>
      {(rotulo || descricao) && (
        <span>
          {rotulo && <span className="block text-sm">{rotulo}</span>}
          {descricao && <span className="block text-xs text-suave">{descricao}</span>}
        </span>
      )}
    </label>
  );
}
