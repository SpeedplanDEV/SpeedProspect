import type { PropsTemplate } from '../types';

/** Créditos obrigatórios (Google), link de opt-out (LGPD) e autoria da prévia */
export function InfoLegal({ previa, atribuicoes, classeLink = 'underline underline-offset-2 hover:opacity-80' }: Pick<PropsTemplate, 'previa' | 'atribuicoes'> & { classeLink?: string }) {
  const autores = [...new Set(atribuicoes.filter(Boolean))].slice(0, 6);
  const linkOptout = previa.tokenOptout ? `/optout/${previa.tokenOptout}` : null;
  return (
    <div className="space-y-1.5 text-xs leading-relaxed opacity-90">
      <p>
        Informações, avaliações e fotos: Google Maps{autores.length ? ` · Fotos de ${autores.join(', ')}` : ''}.
      </p>
      <p>
        Prévia criada por {previa.negocioNome}.{' '}
        {linkOptout && !previa.demo && (
          <a href={linkOptout} className={classeLink} rel="nofollow">
            Não quero receber propostas
          </a>
        )}
      </p>
    </div>
  );
}
