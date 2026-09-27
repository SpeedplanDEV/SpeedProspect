// Conteúdos FICTÍCIOS para a página de demonstração dos modelos (/demo/:nicho). Não representam empresas reais.
import type { ConteudoLP, NichoLP } from './types';

const horarios = [
  { dia: 'Segunda', horario: '08:00–18:00' },
  { dia: 'Terça', horario: '08:00–18:00' },
  { dia: 'Quarta', horario: '08:00–18:00' },
  { dia: 'Quinta', horario: '08:00–18:00' },
  { dia: 'Sexta', horario: '08:00–18:00' },
  { dia: 'Sábado', horario: '08:00–12:00' },
  { dia: 'Domingo', horario: 'Fechado' },
];

const base = (nome: string, cor: string, estilo: ConteudoLP['tema']['estilo']): Pick<ConteudoLP, 'empresa' | 'prova_social' | 'horarios' | 'tema'> => ({
  empresa: {
    nome,
    tagline: '',
    cidade: 'Cidade Exemplo',
    bairro: 'Centro',
    endereco: 'Rua Exemplo, 123 - Centro, Cidade Exemplo - SP',
    telefone_exibicao: '(11) 90000-0000',
    whatsapp_e164: '+5511900000000',
    maps_url: 'https://maps.google.com',
  },
  prova_social: { rating: 4.8, reviews_count: 214, frase: 'Nota 4,8 no Google com mais de 210 avaliações' },
  horarios,
  tema: { cor_primaria: cor, estilo },
});

const faqPadrao = (acao: string): ConteudoLP['faq'] => [
  { pergunta: 'Onde vocês ficam?', resposta: 'Estamos na Rua Exemplo, 123, no Centro. Use o botão "Como chegar" para abrir o mapa.' },
  { pergunta: 'Qual o horário de atendimento?', resposta: 'De segunda a sexta, das 8h às 18h, e aos sábados das 8h às 12h.' },
  { pergunta: `Como faço para ${acao}?`, resposta: `É só chamar no WhatsApp pelo botão desta página que a equipe responde e ajuda você a ${acao}.` },
];

export const DEMOS: Record<NichoLP, ConteudoLP> = {
  saude: {
    ...base('Clínica Sorriso Exemplo', '#0f766e', 'clean'),
    empresa: { ...base('Clínica Sorriso Exemplo', '#0f766e', 'clean').empresa, tagline: 'Odontologia com calma, cuidado e atenção' },
    hero: { titulo: 'Seu sorriso cuidado com atenção de verdade', subtitulo: 'Atendimento odontológico no Centro, com a tranquilidade que você merece em cada consulta.', cta_primario: 'Agendar pelo WhatsApp', cta_secundario: 'Ver tratamentos', foto_index: 0 },
    servicos: [
      { titulo: 'Limpeza e prevenção', descricao: 'Consultas de rotina para manter dentes e gengivas saudáveis.', icone: 'sparkles' },
      { titulo: 'Restaurações', descricao: 'Tratamento de cáries com materiais da cor do dente.', icone: 'shield' },
      { titulo: 'Clareamento', descricao: 'Orientação para um sorriso mais claro com segurança.', icone: 'smile' },
      { titulo: 'Avaliação completa', descricao: 'Uma conversa sem pressa para entender o que você precisa.', icone: 'stethoscope' },
    ],
    diferenciais: [
      { titulo: 'Avaliada pelos pacientes', descricao: 'Nota 4,8 no Google com mais de 210 avaliações.' },
      { titulo: 'Fácil de chegar', descricao: 'No Centro, perto de tudo.' },
      { titulo: 'Agendamento rápido', descricao: 'Marque seu horário direto pelo WhatsApp.' },
    ],
    depoimentos: [
      { autor: 'Cliente A.', nota: 5, texto: 'Atendimento muito atencioso, me senti tranquila do começo ao fim.', data: 'há 2 meses' },
      { autor: 'Cliente B.', nota: 5, texto: 'Explicaram tudo com calma antes do tratamento. Recomendo.', data: 'há 3 meses' },
      { autor: 'Cliente C.', nota: 4, texto: 'Ambiente limpo e equipe educada. Fui muito bem atendido.', data: 'há 1 mês' },
    ],
    faq: faqPadrao('agendar uma consulta'),
    cta_final: { titulo: 'Agende sua avaliação', texto: 'Fale com a recepção pelo WhatsApp e escolha o melhor horário.', botao: 'Agendar pelo WhatsApp' },
    seo: { title: 'Clínica Sorriso Exemplo | Dentista no Centro', description: 'Modelo de demonstração.' },
  },
  alimentacao: {
    ...base('Cantina Exemplo', '#c2410c', 'bold'),
    empresa: { ...base('Cantina Exemplo', '#c2410c', 'bold').empresa, tagline: 'Comida caseira feita na hora' },
    hero: { titulo: 'Comida caseira com gostinho de casa de vó', subtitulo: 'Pratos feitos na hora, no coração do Centro. Peça pelo WhatsApp ou venha conhecer.', cta_primario: 'Pedir pelo WhatsApp', cta_secundario: 'Ver destaques', foto_index: 0 },
    servicos: [
      { titulo: 'Pratos do dia', descricao: 'Opções caseiras que mudam ao longo da semana.', icone: 'utensils' },
      { titulo: 'Massas', descricao: 'Receitas tradicionais servidas bem quentinhas.', icone: 'heart' },
      { titulo: 'Sobremesas', descricao: 'Aquele doce para fechar a refeição.', icone: 'coffee' },
      { titulo: 'Pedidos para viagem', descricao: 'Peça pelo WhatsApp e retire no balcão.', icone: 'truck' },
    ],
    diferenciais: [
      { titulo: 'Queridinha do bairro', descricao: 'Nota 4,8 com mais de 210 avaliações no Google.' },
      { titulo: 'Feito na hora', descricao: 'Clientes elogiam o sabor e a comida quentinha.' },
      { titulo: 'No Centro', descricao: 'Fácil de chegar para o almoço.' },
    ],
    depoimentos: [
      { autor: 'Cliente A.', nota: 5, texto: 'Comida saborosa e bem servida, parece feita em casa.', data: 'há 1 mês' },
      { autor: 'Cliente B.', nota: 5, texto: 'Atendimento rápido e simpático. Virei cliente fiel.', data: 'há 2 meses' },
    ],
    faq: faqPadrao('fazer um pedido'),
    cta_final: { titulo: 'Bateu a fome?', texto: 'Mande seu pedido pelo WhatsApp e a gente prepara na hora.', botao: 'Pedir agora' },
    seo: { title: 'Cantina Exemplo | Comida caseira no Centro', description: 'Modelo de demonstração.' },
  },
  automotivo: {
    ...base('Auto Center Exemplo', '#f59e0b', 'bold'),
    empresa: { ...base('Auto Center Exemplo', '#f59e0b', 'bold').empresa, tagline: 'Seu carro em boas mãos, sem enrolação' },
    hero: { titulo: 'Mecânica rápida e honesta no Centro', subtitulo: 'Diagnóstico claro e serviço bem feito para você voltar logo para a rua.', cta_primario: 'Pedir orçamento', cta_secundario: 'Ver serviços', foto_index: 0 },
    servicos: [
      { titulo: 'Revisão', descricao: 'Verificação dos itens essenciais do seu veículo.', icone: 'wrench' },
      { titulo: 'Freios', descricao: 'Pastilhas, discos e fluido para frear com segurança.', icone: 'shield' },
      { titulo: 'Suspensão', descricao: 'Mais conforto e estabilidade no dia a dia.', icone: 'car' },
      { titulo: 'Troca de óleo', descricao: 'Troca de óleo e filtros no tempo certo.', icone: 'droplet' },
      { titulo: 'Elétrica', descricao: 'Bateria, luzes e partida funcionando direito.', icone: 'zap' },
      { titulo: 'Diagnóstico', descricao: 'Descubra o que o carro tem antes de gastar.', icone: 'check' },
    ],
    diferenciais: [
      { titulo: 'Bem avaliado', descricao: 'Nota 4,8 no Google com mais de 210 avaliações.' },
      { titulo: 'Explicação clara', descricao: 'Clientes destacam a transparência no atendimento.' },
      { titulo: 'Contato direto', descricao: 'Tire dúvidas e combine tudo pelo WhatsApp.' },
    ],
    depoimentos: [
      { autor: 'Cliente A.', nota: 5, texto: 'Resolveram o problema rápido e explicaram tudo. Confiança total.', data: 'há 3 semanas' },
      { autor: 'Cliente B.', nota: 5, texto: 'Preço justo e serviço caprichado. Recomendo.', data: 'há 2 meses' },
      { autor: 'Cliente C.', nota: 4, texto: 'Atendimento honesto, voltarei com certeza.', data: 'há 1 mês' },
    ],
    faq: faqPadrao('pedir um orçamento'),
    cta_final: { titulo: 'Carro dando sinal?', texto: 'Mande uma mensagem e conte o que está acontecendo.', botao: 'Chamar no WhatsApp' },
    seo: { title: 'Auto Center Exemplo | Mecânica no Centro', description: 'Modelo de demonstração.' },
  },
  beleza: {
    ...base('Studio Exemplo', '#9f4a67', 'elegante'),
    empresa: { ...base('Studio Exemplo', '#9f4a67', 'elegante').empresa, tagline: 'Beleza com cuidado e tempo para você' },
    hero: { titulo: 'Seu momento de cuidado começa aqui', subtitulo: 'Cabelo, unhas e bem-estar no Centro, com atenção a cada detalhe.', cta_primario: 'Agendar horário', cta_secundario: 'Ver serviços', foto_index: 0 },
    servicos: [
      { titulo: 'Corte e escova', descricao: 'Um visual que combina com você.', icone: 'scissors' },
      { titulo: 'Coloração', descricao: 'Cor com cuidado para os fios.', icone: 'sparkles' },
      { titulo: 'Manicure e pedicure', descricao: 'Mãos e pés impecáveis.', icone: 'heart' },
      { titulo: 'Tratamentos capilares', descricao: 'Hidratação e nutrição para os fios.', icone: 'droplet' },
    ],
    diferenciais: [
      { titulo: 'Amado pelas clientes', descricao: 'Nota 4,8 com mais de 210 avaliações no Google.' },
      { titulo: 'Atendimento atencioso', descricao: 'Um tempo só seu, sem pressa.' },
      { titulo: 'Agenda fácil', descricao: 'Marque pelo WhatsApp em poucos minutos.' },
    ],
    depoimentos: [
      { autor: 'Cliente A.', nota: 5, texto: 'Saí me sentindo outra pessoa. Atendimento maravilhoso.', data: 'há 1 mês' },
      { autor: 'Cliente B.', nota: 5, texto: 'Ambiente lindo e profissionais cuidadosas.', data: 'há 2 meses' },
    ],
    faq: faqPadrao('agendar um horário'),
    cta_final: { titulo: 'Reserve seu horário', texto: 'Escolha o serviço e agende pelo WhatsApp.', botao: 'Agendar pelo WhatsApp' },
    seo: { title: 'Studio Exemplo | Beleza no Centro', description: 'Modelo de demonstração.' },
  },
  servicos: {
    ...base('Elétrica Exemplo', '#1d4ed8', 'clean'),
    empresa: { ...base('Elétrica Exemplo', '#1d4ed8', 'clean').empresa, tagline: 'Serviços elétricos com segurança' },
    hero: { titulo: 'Eletricista de confiança no Centro', subtitulo: 'Instalações e reparos elétricos feitos com cuidado. Chame no WhatsApp e explique o que precisa.', cta_primario: 'Pedir orçamento', cta_secundario: 'Ver serviços', foto_index: 0 },
    servicos: [
      { titulo: 'Instalações elétricas', descricao: 'Tomadas, interruptores e pontos novos.', icone: 'zap' },
      { titulo: 'Reparos', descricao: 'Identificação e correção de falhas.', icone: 'wrench' },
      { titulo: 'Iluminação', descricao: 'Troca e instalação de luminárias.', icone: 'sparkles' },
      { titulo: 'Quadro de energia', descricao: 'Organização e manutenção do quadro.', icone: 'shield' },
    ],
    diferenciais: [
      { titulo: 'Bem avaliado', descricao: 'Nota 4,8 no Google com mais de 210 avaliações.' },
      { titulo: 'Resposta rápida', descricao: 'Fale direto pelo WhatsApp.' },
      { titulo: 'Atendimento local', descricao: 'Baseado no Centro da cidade.' },
    ],
    depoimentos: [
      { autor: 'Cliente A.', nota: 5, texto: 'Chegou no horário combinado e resolveu tudo rapidinho.', data: 'há 2 semanas' },
      { autor: 'Cliente B.', nota: 5, texto: 'Trabalho limpo e caprichado. Recomendo.', data: 'há 1 mês' },
    ],
    faq: faqPadrao('pedir um orçamento'),
    cta_final: { titulo: 'Precisa de um eletricista?', texto: 'Mande uma mensagem agora e combine o atendimento.', botao: 'Chamar no WhatsApp' },
    seo: { title: 'Elétrica Exemplo | Eletricista no Centro', description: 'Modelo de demonstração.' },
  },
};
