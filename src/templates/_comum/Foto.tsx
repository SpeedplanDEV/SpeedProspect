import { useState, type CSSProperties } from 'react';
import { useNicho } from './contexto';
import { Ilustracao } from './Ilustracao';

interface Props {
  src?: string;
  alt: string;
  className?: string;
  /** Imagem principal (acima da dobra): carrega com prioridade */
  prioridade?: boolean;
  /** Cor base da ilustração quando não há foto */
  cor: string;
  style?: CSSProperties;
}

/** Foto real do Google; sem foto (ou se falhar), mostra a ilustração do nicho */
export function Foto({ src, alt, className = '', prioridade, cor, style }: Props) {
  const [falhou, setFalhou] = useState(false);
  const nicho = useNicho();
  if (!src || falhou) return <Ilustracao nicho={nicho} cor={cor} className={className} style={style} rotulo={alt} />;
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
