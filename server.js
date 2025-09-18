const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
require('dotenv').config();
const fileUpload = require('express-fileupload');
const fs = require('fs');
const path = require('path');
const { sequelize } = require('./models');

// Importar rotas
const tenantRoutes = require('./routes/tenants');
const billingRoutes = require('./routes/billing');
const seatRoutes = require('./routes/seats');
const webhookRoutes = require('./routes/webhook');
const clientesRoutes = require('./routes/clientesRouter')
const crmRoutes = require('./routes/crmRouter')
const usuariosRoutes = require('./routes/usuariosRouter')
const enterpriseRoutes = require('./routes/enterprises');
const profileRoutes = require('./routes/profile');
const sugestoesRoutes = require('./routes/sugestoesRouter');
const jobsRoutes = require('./routes/jobs');
const mensagensPadraoRoutes = require('./routes/mensagensPadrao');
const ligacoesRoutes = require('./routes/ligacoesRouter');
const privacyRoutes = require('./routes/privacy');
const relatoriosRoutes = require('./routes/relatoriosRouter');

require('./queues/workers');

const { createBullBoard } = require('@bull-board/api');
const { ExpressAdapter } = require('@bull-board/express');
const { BullMQAdapter } = require('@bull-board/api/bullMQAdapter');
const importQueue = require('./queues/importClientsQueue');
const exportQueue = require('./queues/exportClientsQueue');


const authRoutes = require('./routes/auth');
const { cleanupExports, getEnvPrefix } = require('./services/cleanupExports');

// Limpeza diária configurável por constante (hora local)
const CLEANUP_DAILY_HOUR = 0;   // 0 = meia-noite
const CLEANUP_DAILY_MINUTE = 0; // minuto

function scheduleDailyCleanup() {
  const envPrefix = getEnvPrefix();
  const now = new Date();
  const next = new Date(now);
  next.setHours(CLEANUP_DAILY_HOUR, CLEANUP_DAILY_MINUTE, 0, 0);
  if (next <= now) {
    next.setDate(next.getDate() + 1);
  }
  const delay = next.getTime() - now.getTime();
  console.log(`🧹 Limpeza diária agendada para ${next.toString()} [env=${envPrefix}]`);
  setTimeout(async () => {
    try {
      const summary = await cleanupExports({ env: envPrefix });
      console.log(`🧹 Limpeza executada [${envPrefix}] -> removidos: ${summary.removedCount}/${summary.expiredCount}`);
    } catch (e) {
      console.warn('Falha ao executar limpeza diária:', e.message);
    } finally {
      // Reagendar para o próximo dia
      scheduleDailyCleanup();
    }
  }, Math.max(1, delay));
}

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware de segurança
app.use(helmet());

app.use(morgan('dev'));

// View engine para páginas simples (ex.: política de privacidade)
app.set('views', path.join(__dirname, 'templates'));
app.set('view engine', 'ejs');

// CORS - permitir requisições de qualquer origem
app.use(cors({
  origin: true,
  credentials: true
}));

// Logging


// Middleware para webhook (deve vir antes do express.json())
app.use('/api/stripe', webhookRoutes);

// Middleware para parsing JSON (após webhook)
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Garante que o diretório temporário exista mesmo no Windows
try {
  fs.mkdirSync('/tmp/', { recursive: true });
} catch (_) {}

app.use(fileUpload({
  useTempFiles: true,
  tempFileDir: '/tmp/',   // ou outro diretório de temp
  createParentPath: true
}));

// Rotas da API
app.use('/api/tenants', tenantRoutes);
app.use('/api/billing', billingRoutes);
app.use('/api/seats', seatRoutes);
app.use('/api/clientes',clientesRoutes)
app.use('/api/crm',crmRoutes)
app.use('/api/usuarios',usuariosRoutes)
app.use('/api/enterprises', enterpriseRoutes);
app.use('/api/profile', profileRoutes);
app.use('/api/sugestoes', sugestoesRoutes);
app.use('/api/jobs', jobsRoutes);
app.use('/api/mensagens-padrao', mensagensPadraoRoutes)
app.use('/api/ligacoes', ligacoesRoutes)
app.use('/api/privacy', privacyRoutes);
app.use('/api/relatorios', relatoriosRoutes);


// Auth routes supported under both /api and /api/auth for compatibility
app.use('/api', authRoutes);
app.use('/api/auth', authRoutes);

// Rota de health check
app.get('/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development'
  });
});

const serverAdapter = new ExpressAdapter();
serverAdapter.setBasePath('/admin/queues');
createBullBoard({
  queues: [new BullMQAdapter(importQueue), new BullMQAdapter(exportQueue)],
  serverAdapter,
});
app.use('/admin/queues', serverAdapter.getRouter());

// Rota raiz
app.get('/', (req, res) => {
  res.json({
    message: 'API SaaS Multi-tenant com Stripe',
    version: '1.0.0',
    endpoints: {
      health: '/health',
      tenants: '/api/tenants',
      billing: '/api/billing',
      seats: '/api/seats',
      webhook: '/api/stripe/webhook',
      auth: '/api/auth',
      profile: '/api/profile'
    }
  });
});

// Middleware de tratamento de erros
app.use((err, req, res, next) => {
  console.error('Erro não tratado:', err);
  
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'JSON inválido' });
  }
  
  res.status(500).json({ 
    error: 'Erro interno do servidor',
    message: process.env.NODE_ENV === 'development' ? err.message : 'Algo deu errado'
  });
});

// Middleware para rotas não encontradas
app.use('*', (req, res) => {
  res.status(404).json({ error: 'Endpoint não encontrado' });
});

// Função para inicializar o servidor
const startServer = async () => {
  try {
    // Testar conexão com o banco de dados
    await sequelize.authenticate();
    console.log('✅ Conexão com o banco de dados estabelecida com sucesso.');

    // Iniciar servidor
    app.listen(PORT, '0.0.0.0', () => {
      console.log(`🚀 Servidor rodando na porta ${PORT}`);
      console.log(`📡 Ambiente: ${process.env.NODE_ENV || 'development'}`);
      console.log(`🔗 URL: http://localhost:${PORT}`);

      // Agendamento diário (meia-noite local por padrão)
      scheduleDailyCleanup();
    });

  } catch (error) {
    console.error('❌ Erro ao inicializar o servidor:', error);
    process.exit(1);
  }
};

// Tratamento de sinais para graceful shutdown
process.on('SIGTERM', async () => {
  console.log('🛑 Recebido SIGTERM, encerrando servidor...');
  await sequelize.close();
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('🛑 Recebido SIGINT, encerrando servidor...');
  await sequelize.close();
  process.exit(0);
});

// Inicializar servidor
startServer();

module.exports = app;

