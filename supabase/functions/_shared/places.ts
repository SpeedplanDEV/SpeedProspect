// Cliente da Google Places API (New) — somente Text Search oficial. Nada de scraping.
import { ehCelular, extrairBairro, extrairCidade, telefoneE164, type ComponenteEndereco } from './normalizar.ts';
import { cotacaoDolar } from './custos.ts';

export const PLACES_URL = 'https://places.googleapis.com/v1/places:searchText';

export const FIELD_MASK = [
  'places.id', 'places.displayName', 'places.formattedAddress', 'places.addressComponents',
  'places.nationalPhoneNumber', 'places.internationalPhoneNumber', 'places.websiteUri', 'places.rating',
  'places.userRatingCount', 'places.types', 'places.primaryType', 'places.regularOpeningHours', 'places.photos',
  'places.reviews', 'places.googleMapsUri', 'places.businessStatus', 'places.location', 'nextPageToken',
].join(',');

/**
 * Preços unitários (US$ por requisição). Confira a tabela atual em
 * https://developers.google.com/maps/billing-and-pricing/pricing
 * - Text Search com campos de reviews/horários/telefone/site = SKU "Text Search Enterprise + Atmosphere"
 * - Place Photo = SKU "Place Details Photos"
 */
export const PRECO_USD = {
  text_search_enterprise_atmosphere: 0.04,
  foto: 0.007,
};
export const custoBuscaBRL = () => PRECO_USD.text_search_enterprise_atmosphere * cotacaoDolar();

export interface PlaceBruto {
  id: string;
  displayName?: { text?: string };
  formattedAddress?: string;
  addressComponents?: ComponenteEndereco[];
  nationalPhoneNumber?: string;
  internationalPhoneNumber?: string;
  websiteUri?: string;
  rating?: number;
  userRatingCount?: number;
  types?: string[];
  primaryType?: string;
  regularOpeningHours?: { weekdayDescriptions?: string[] };
  photos?: { name: string; widthPx?: number; heightPx?: number; authorAttributions?: { displayName?: string; uri?: string }[] }[];
  reviews?: {
    rating?: number;
    text?: { text?: string };
    originalText?: { text?: string };
    relativePublishTimeDescription?: string;
    authorAttribution?: { displayName?: string };
  }[];
  googleMapsUri?: string;
  businessStatus?: string;
  location?: { latitude?: number; longitude?: number };
}

export interface RespostaBusca {
  places?: PlaceBruto[];
  nextPageToken?: string;
}

/** Uma página do Text Search. Tenta 3 vezes com backoff em erros 429/5xx/rede. */
export async function buscarPagina(textQuery: string, pageToken?: string): Promise<RespostaBusca> {
  const chave = Deno.env.get('GOOGLE_PLACES_API_KEY');
  if (!chave) throw new Error('Secret GOOGLE_PLACES_API_KEY não configurado');
  const corpo: Record<string, unknown> = { textQuery, languageCode: 'pt-BR', regionCode: 'BR', pageSize: 20 };
  if (pageToken) corpo.pageToken = pageToken;

  let ultimoErro = '';
  for (let tentativa = 0; tentativa < 3; tentativa++) {
    if (tentativa) await new Promise((r) => setTimeout(r, 1000 * 2 ** tentativa));
    try {
      const r = await fetch(PLACES_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': chave, 'X-Goog-FieldMask': FIELD_MASK },
        body: JSON.stringify(corpo),
      });
      if (r.ok) return (await r.json()) as RespostaBusca;
      const txt = await r.text();
      ultimoErro = `Places ${r.status}: ${txt.slice(0, 300)}`;
      if (r.status !== 429 && r.status < 500) break; // erro definitivo (chave, cota, requisição)
    } catch (e) {
      ultimoErro = `Falha de rede no Places: ${(e as Error).message}`;
    }
  }
  throw new Error(ultimoErro);
}

/** Converte um place da API para as colunas de `leads` (dados do Google apenas) */
export function placeParaLead(p: PlaceBruto) {
  const telefone = telefoneE164(p.internationalPhoneNumber) ?? telefoneE164(p.nationalPhoneNumber);
  return {
    place_id: p.id,
    nome: p.displayName?.text?.trim() || 'Sem nome',
    bairro: extrairBairro(p.addressComponents),
    endereco: p.formattedAddress ?? null,
    telefone,
    telefone_celular: ehCelular(telefone),
    website: p.websiteUri ?? null,
    google_maps_url: p.googleMapsUri ?? null,
    rating: typeof p.rating === 'number' ? Math.round(p.rating * 10) / 10 : null,
    reviews_count: p.userRatingCount ?? 0,
    tipos: p.types ?? [],
    tipo_principal: p.primaryType ?? null,
    horarios: p.regularOpeningHours?.weekdayDescriptions ?? null,
    fotos: (p.photos ?? []).slice(0, 10).map((f) => ({
      name: f.name,
      width: f.widthPx ?? null,
      height: f.heightPx ?? null,
      atribuicao: f.authorAttributions?.[0]?.displayName ?? null,
      atribuicao_uri: f.authorAttributions?.[0]?.uri ?? null,
    })),
    avaliacoes: (p.reviews ?? []).slice(0, 5).map((r) => ({
      autor: r.authorAttribution?.displayName ?? 'Cliente do Google',
      nota: r.rating ?? null,
      texto: r.text?.text ?? r.originalText?.text ?? '',
      data: r.relativePublishTimeDescription ?? '',
    })),
    lat: p.location?.latitude ?? null,
    lng: p.location?.longitude ?? null,
    status_negocio: p.businessStatus ?? null,
    places_atualizado_em: new Date().toISOString(),
    cidade_google: extrairCidade(p.addressComponents),
  };
}
