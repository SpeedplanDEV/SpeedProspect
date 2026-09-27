import { useEffect } from 'react';

/** Carrega fontes do Google Fonts sem bloquear a renderização (display=swap + fallback no CSS) */
export function useFontes(href: string) {
  useEffect(() => {
    const garantir = (rel: string, url: string, extra?: (l: HTMLLinkElement) => void) => {
      if (document.head.querySelector(`link[rel="${rel}"][href="${url}"]`)) return;
      const l = document.createElement('link');
      l.rel = rel;
      l.href = url;
      extra?.(l);
      document.head.appendChild(l);
    };
    garantir('preconnect', 'https://fonts.googleapis.com');
    garantir('preconnect', 'https://fonts.gstatic.com', (l) => (l.crossOrigin = 'anonymous'));
    garantir('stylesheet', href);
  }, [href]);
}
