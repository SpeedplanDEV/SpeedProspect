import { useState, type CSSProperties } from 'react';

interface Props {
  src?: string;
  alt: string;
  className?: string;
  /** Imagem principal (acima da dobra): carrega com prioridade */
  prioridade?: boolean;
  /** Cor base do placeholder quando não há foto */
  cor: string;
  style?: CSSProperties;
}

/** Foto real do Google com fallback elegante (gradiente da marca) quando não existe ou falha */
export function Foto({ src, alt, className = '', prioridade, cor, style }: Props) {
  const [falhou, setFalhou] = useState(false);
  if (!src || falhou) {
    return (
      <div
        role="img"
        aria-label={alt}
        className={className}
        style={{
          ...style,
          backgroundColor: cor,
          backgroundImage: `radial-gradient(circle at 20% 20%, rgba(255,255,255,.35), transparent 45%), radial-gradient(circle at 80% 70%, rgba(0,0,0,.25), transparent 50%), linear-gradient(135deg, rgba(255,255,255,.15), rgba(0,0,0,.2))`,
        }}
      />
    );
  }
  return (
    <img
      src={src}
      alt={alt}
      className={`${className} object-cover`}
      style={style}
      loading={prioridade ? 'eager' : 'lazy'}
      decoding={prioridade ? 'sync' : 'async'}
      // @ts-expect-error atributo válido em navegadores modernos
      fetchpriority={prioridade ? 'high' : 'auto'}
      onError={() => setFalhou(true)}
    />
  );
}
