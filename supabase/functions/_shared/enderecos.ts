// Endereço real de cada Edge Function no projeto. Funções criadas pelo editor do painel do Supabase ficam
// com o endereço sugerido por ele (não dá para renomear depois). Arquivo puro: usado pelo painel e pelo pipeline.

export const ENDERECO_FUNCOES: Record<string, string> = {
  'gerar-previa': 'quick-handler',
  track: 'smart-responder',
  optout: 'super-endpoint',
};

export const enderecoFuncao = (nome: string) => ENDERECO_FUNCOES[nome] ?? nome;
