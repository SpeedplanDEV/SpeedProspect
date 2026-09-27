// Conversão de custos para R$ (cotação ajustável pelo secret COTACAO_DOLAR; padrão 5,50)
export const cotacaoDolar = () => Number(Deno.env.get('COTACAO_DOLAR') ?? '5.50') || 5.5;
export const paraReais = (usd: number) => Math.round(usd * cotacaoDolar() * 10000) / 10000;
