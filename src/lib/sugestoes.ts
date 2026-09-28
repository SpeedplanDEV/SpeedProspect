// Sugestões para o formulário de campanha: termos de busca por nicho e municípios oficiais (IBGE)
import { useQuery } from '@tanstack/react-query';
import type { Nicho } from './types';

/**
 * Termos que as pessoas usam no Google Maps, do mais comum para o mais específico.
 * Cada termo vira uma consulta "termo em cidade - UF" (até 60 empresas por consulta).
 */
export const TERMOS_SUGERIDOS: Record<Nicho, string[]> = {
  saude: [
    'dentista', 'clínica odontológica', 'ortodontista', 'implante dentário', 'clínica médica', 'fisioterapia',
    'psicólogo', 'nutricionista', 'dermatologista', 'pediatra', 'ginecologista', 'oftalmologista', 'fonoaudiólogo',
    'clínica de estética', 'clínica veterinária', 'laboratório de análises clínicas', 'pilates', 'quiropraxia',
  ],
  alimentacao: [
    'restaurante', 'lanchonete', 'hamburgueria', 'pizzaria', 'padaria', 'açaí', 'marmitaria', 'cafeteria',
    'confeitaria', 'sorveteria', 'churrascaria', 'restaurante japonês', 'comida caseira', 'pastelaria', 'esfiharia',
    'doceria', 'food truck', 'restaurante vegano',
  ],
  automotivo: [
    'oficina mecânica', 'auto center', 'funilaria e pintura', 'auto elétrica', 'borracharia', 'lava rápido',
    'estética automotiva', 'troca de óleo', 'alinhamento e balanceamento', 'autopeças', 'mecânica de motos',
    'som automotivo', 'insulfilm', 'ar condicionado automotivo', 'guincho', 'retífica de motores',
  ],
  beleza: [
    'salão de beleza', 'barbearia', 'manicure', 'esmalteria', 'cabeleireiro', 'design de sobrancelhas',
    'extensão de cílios', 'estúdio de beleza', 'depilação', 'maquiadora', 'micropigmentação', 'podologia',
    'spa', 'clínica de estética facial', 'trancista',
  ],
  servicos: [
    'eletricista', 'encanador', 'chaveiro', 'dedetizadora', 'desentupidora', 'assistência técnica celular',
    'conserto de eletrodomésticos', 'marido de aluguel', 'pintor residencial', 'vidraçaria', 'serralheria',
    'marcenaria', 'instalação de ar condicionado', 'limpeza de estofados', 'pet shop', 'lavanderia', 'gráfica',
    'jardinagem',
  ],
};

/** Nome sugerido para a campanha ("Dentistas Campinas") */
const NOME_NICHO: Record<Nicho, string> = {
  saude: 'Saúde',
  alimentacao: 'Alimentação',
  automotivo: 'Automotivo',
  beleza: 'Beleza',
  servicos: 'Serviços',
};

export function nomeSugerido(nicho: Nicho, termos: string[], cidade: string): string {
  const base = termos[0] ? termos[0][0].toUpperCase() + termos[0].slice(1) : NOME_NICHO[nicho];
  return [base, cidade.trim()].filter(Boolean).join(' · ');
}

/** Compara nomes sem acento e sem diferença de maiúsculas */
export const normalizarNome = (s: string) =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase();

/** Municípios da UF pela API pública do IBGE (nomes oficiais, iguais aos do Google Maps na maioria dos casos) */
export function useMunicipios(uf: string) {
  return useQuery({
    queryKey: ['ibge', 'municipios', uf],
    enabled: /^[A-Z]{2}$/.test(uf),
    staleTime: Infinity,
    gcTime: Infinity,
    retry: 1,
    queryFn: async ({ signal }) => {
      const r = await fetch(`https://servicodados.ibge.gov.br/api/v1/localidades/estados/${uf}/municipios?orderBy=nome`, { signal });
      if (!r.ok) throw new Error(`IBGE ${r.status}`);
      const lista = (await r.json()) as { nome: string }[];
      return lista.map((m) => m.nome);
    },
  });
}
