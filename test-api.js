const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
require('dotenv').config();

const { sequelize } = require('./models');

const app = express();
const PORT = 3001;

// Middleware de segurança
app.use(helmet());
app.use(cors({ origin: true, credentials: true }));
app.use(morgan('combined'));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Rota de health check
app.get('/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development'
  });
});

// Rota raiz
app.get('/', (req, res) => {
  res.json({
    message: 'API SaaS Multi-tenant - Teste sem Stripe',
    version: '1.0.0',
    endpoints: {
      health: '/health',
      'test-tenant': '/api/test-tenant'
    }
  });
});

// Endpoint de teste para criar tenant sem Stripe
app.post('/api/test-tenant', async (req, res) => {
  try {
    const { Tenant } = require('./models');
    const { name, email } = req.body;

    if (!name || !email) {
      return res.status(400).json({ error: 'Nome e email são obrigatórios' });
    }

    // Criar tenant no banco de dados sem integração Stripe
    const tenant = await Tenant.create({
      name: name,
      stripe_customer_id: null, // Sem Stripe por enquanto
      status_billing: 'incomplete'
    });

    res.status(201).json({
      id: tenant.id,
      name: tenant.name,
      stripe_customer_id: tenant.stripe_customer_id,
      status_billing: tenant.status_billing,
      created_at: tenant.created_at
    });

  } catch (error) {
    console.error('Erro ao criar tenant:', error);
    res.status(500).json({ 
      error: 'Erro interno do servidor ao criar tenant',
      details: error.message
    });
  }
});

// Middleware de tratamento de erros
app.use((err, req, res, next) => {
  console.error('Erro não tratado:', err);
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
      console.log(`🚀 Servidor de teste rodando na porta ${PORT}`);
      console.log(`📡 Ambiente: ${process.env.NODE_ENV || 'development'}`);
      console.log(`🔗 URL: http://localhost:${PORT}`);
    });

  } catch (error) {
    console.error('❌ Erro ao inicializar o servidor:', error);
    process.exit(1);
  }
};

// Inicializar servidor
startServer();

module.exports = app;

