const express = require('express');
const router = express.Router();

// Metadados e conteúdo da Política de Privacidade do Converto (PT-BR)
const POLICY = {
  name: 'Converto — Política de Privacidade',
  version: '1.0.0',
  last_updated: '2025-09-06',
  controller: {
    name: 'Converto',
    email: 'privacidade@converto.app'
  },
  summary: 'Esta Política descreve como coletamos, usamos, compartilhamos e protegemos dados pessoais no Converto, em conformidade com a LGPD (Lei nº 13.709/2018) e, quando aplicável, o GDPR.',
  data_collected: [
    'Dados de conta: nome, e-mail, senha (hash).',
    'Dados organizacionais: tenant/equipe, cargos, permissões.',
    'Dados de clientes importados pelo usuário: nomes, e-mails, telefones e outras informações fornecidas por você.',
    'Dados técnicos: logs de acesso, IP, identificadores de dispositivo, cookies.',
    'Faturamento/assinatura: identificadores de pagamento (por ex., Stripe), status e histórico de cobrança.'
  ],
  purposes: [
    'Prestar e melhorar o serviço (provisionamento, operação e suporte).',
    'Segurança, prevenção a fraudes e auditoria.',
    'Cumprimento de obrigações legais/regulatórias.',
    'Comunicações transacionais e atendimento.',
    'Analytics agregada para melhoria de produto.'
  ],
  legal_bases: [
    'Execução de contrato (art. 7º, V da LGPD): para operar o Converto.',
    'Cumprimento de obrigação legal/regulatória (art. 7º, II).',
    'Legítimo interesse (art. 7º, IX): segurança, prevenção a fraudes e melhoria do serviço, sempre com avaliação de impacto.',
    'Consentimento (art. 7º, I): quando exigido para cookies não-essenciais e comunicações de marketing.'
  ],
  sharing: [
    'Provedores de infraestrutura e e-mail (por exemplo, hospedagem, envio de e-mails).',
    'Processadores de pagamento (ex.: Stripe) para cobrança.',
    'Prestadores de serviços de monitoramento, logs e analytics agregada.',
    'Autoridades competentes, quando exigido por lei.'
  ],
  international_transfers: 'Podemos transferir dados para fora do Brasil com garantias adequadas (contratuais e técnicas) e observância da LGPD.',
  cookies: 'Usamos cookies/identificadores similares para autenticação, preferências e analytics. Cookies não-essenciais podem requerer consentimento.',
  retention: 'Mantemos dados pelo tempo necessário para cumprir as finalidades e requisitos legais. Você pode solicitar exclusão conforme limites legais.',
  security: 'Adotamos medidas técnicas e organizacionais razoáveis (criptografia em trânsito, controle de acesso, logs, segregação por tenant). Nenhum sistema é 100% seguro.',
  data_subject_rights: [
    'Confirmação de tratamento e acesso.',
    'Correção de dados incompletos, inexatos ou desatualizados.',
    'Anonimização, bloqueio ou eliminação de dados desnecessários/excessivos.',
    'Portabilidade de dados quando aplicável.',
    'Informações sobre compartilhamento e revogação de consentimento.',
    'Oposição a tratamento baseado em legítimo interesse.'
  ],
  children: 'O Converto não é destinado a menores de 13 anos. Não coletamos intencionalmente dados de crianças.',
  changes: 'Podemos atualizar esta Política. Notificaremos alterações materiais por meio do produto ou e-mail.',
  contact: 'Para exercer direitos ou esclarecer dúvidas, contate privacidade@converto.app.'
};

// Retorna JSON por padrão e HTML quando requisitado via Accept: text/html
router.get('/', async (req, res) => {
  const accept = String(req.headers['accept'] || 'application/json');
  if (accept.includes('text/html')) {
    // Renderiza uma página simples (requer view engine configurada no servidor)
    return res.status(200).render('privacy', { policy: POLICY });
  }
  return res.status(200).json(POLICY);
});

module.exports = router;

