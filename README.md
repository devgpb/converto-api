# API SaaS Multi-tenant com Stripe

API RESTful desenvolvida em Node.js/Express para gerenciamento de SaaS multi-tenant com integração completa ao Stripe para modelo de precificação per-seat.

## Características

- **Multi-tenant**: Isolamento completo de dados por empresa
- **Integração Stripe**: Pagamentos, assinaturas e webhooks
- **Modelo Per-seat**: Precificação baseada no número de usuários ativos
- **Webhooks**: Sincronização automática com eventos do Stripe
- **Auditoria**: Log completo de eventos de faturamento
- **Segurança**: Autenticação JWT e validação de dados

## Tecnologias

- Node.js 20+
- Express.js
- PostgreSQL
- Sequelize ORM
- Stripe API
- JWT para autenticação

## Instalação

1. Clone o repositório
2. Instale as dependências:
```bash
npm install
```

3. Configure as variáveis de ambiente:
```bash
cp .env.example .env
```

4. Configure o banco PostgreSQL e atualize a `DATABASE_URL` no `.env`

5. Configure suas chaves do Stripe no `.env`:
   - `STRIPE_SECRET_KEY`: Sua chave secreta do Stripe
   - `STRIPE_WEBHOOK_SECRET`: Secret do webhook configurado no Stripe

6. Configure as credenciais de email no `.env` para envio de notificações:
   - `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`
   - `SMTP_FROM` (remetente padrão) e `SMTP_SECURE` (`true` para TLS)

7. Configure o Redis (veja `tutorial-redis-local.md` para desenvolvimento ou `tutorial-redis-pm2.md` para produção) e ajuste `REDIS_URL` no `.env`

## Execução

### Desenvolvimento
```bash
npm run dev
```

### Produção
```bash
npm start
```

## Estrutura da API

### Endpoints Principais

#### Autenticação
- `POST /api/auth/register` - Registrar novo usuário
- `POST /api/auth/login` - Autenticar e obter token JWT
- `GET /api/auth/me` - Obter dados do usuário autenticado

#### Perfil
- `GET /api/profile` - Obter dados do perfil do usuário autenticado; admins recebem informações de assentos
- `PUT /api/profile/password` - Trocar senha do usuário autenticado com confirmação por email
- `POST /api/profile/forgot-password` - Solicitar link de recuperação de senha
- `POST /api/profile/reset-password` - Redefinir senha utilizando token enviado por email

#### Tenants
- `POST /api/tenants` - Criar novo tenant
- `GET /api/tenants/:id` - Buscar tenant
- `PUT /api/tenants/:id` - Atualizar tenant

#### Billing
- `POST /api/billing/checkout` - Criar sessão de checkout
- `POST /api/billing/portal` - Criar sessão do portal do cliente
- `GET /api/billing/status/:tenant_id` - Status da assinatura

#### Assentos
- `POST /api/seats/sync` - Sincronizar quantidade de assentos
- `GET /api/seats/usage/:tenant_id` - Uso atual de assentos
- `POST /api/seats/add` - Adicionar assento
- `POST /api/seats/remove` - Remover assento

#### Clientes
- `POST /api/clientes` - Criar ou atualizar cliente
- `GET /api/clientes` - Listar clientes com filtros
- `DELETE /api/clientes/:id` - Remover cliente
- `POST /api/clientes/bulk` - Importar clientes via CSV
- `GET /api/clientes/:id_cliente/eventos?inicio=&fim=&tz=` - Listar eventos do cliente (aninhado ao recurso cliente)
- `POST /api/clientes/:id_cliente/eventos` - Registrar evento para o cliente (usa `id_usuario` autenticado por padrão)
- `POST /api/clientes/eventos` - Registrar evento (forma antiga)
- `GET /api/clientes/eventos` - Listar eventos do usuário (forma antiga)
- `POST /api/clientes/dashboard` - Consolidar dados do dashboard

#### CRM
- `GET /api/crm/contatos` - Pesquisar número no CRM
- `POST /api/crm/cliente/primeiro-contato` - Marcar primeiro contato do dia

#### Sugestões
- `POST /api/sugestoes` - Enviar comentário, sugestão ou bug
- `GET /api/sugestoes` - Listar sugestões enviadas (somente moderadores)

#### Usuários
- `POST /api/usuarios` - Criar usuário
- `GET /api/usuarios` - Listar usuários
- `GET /api/usuarios/colaboradores` - Listar colaboradores
- `GET /api/usuarios/:id` - Buscar usuário por ID
- `PUT /api/usuarios/:id` - Atualizar usuário
- `DELETE /api/usuarios/:id` - Deletar usuário

#### Webhook
- `POST /api/stripe/webhook` - Webhook do Stripe

#### Jobs
- `POST /api/jobs/import-clients` - Criar job para importação de clientes
- `POST /api/jobs/export-clients` - Criar job para exportação de clientes
- `GET /api/jobs/:queue/:id` - Consultar status do job
- `DELETE /api/jobs/:queue/:id` - Cancelar job
- `GET /admin/queues` - Painel de acompanhamento dos jobs

- `GET /api/jobs/user` - Listar jobs do usuário autenticado (todas as filas)
##### `GET /api/jobs/user`
- Parâmetros de query:
  - `states`: estados separados por vírgula. Ex.: `waiting,active,completed,failed`. Padrão: todos.
  - `limit`: quantidade máxima a retornar. Padrão: 50, máx.: 500.
  - `userId` (opcional): somente moderadores podem consultar jobs de outro usuário (`id_usuario`).
- Retorna para cada job: `queue`, `id`, `name`, `state`, `progress`, `data` (sem `filePath`), `failedReason`, `returnvalue`, `timestamp`, `attemptsMade`.

Observação: novos jobs criados passam a registrar `userId` automaticamente a partir do usuário autenticado.

##### Retorno com Metadados de Jobs

Alguns jobs podem retornar metadados opcionais no resultado (`returnvalue`) quando concluídos. O endpoint `GET /api/jobs/:queue/:id` inclui o campo `result` com o retorno do job. Quando houver, o campo `metadata` segue o padrão:

```
metadata: [
  { label: "Nome do metadado", value: <numero|texto> }
]
```

Exemplo para o job de importação de clientes ao finalizar:

```
GET /api/jobs/import/:id
{
  "id": "123",
  "state": "completed",
  "progress": 100,
  "data": { "enterpriseId": "...", "userId": "..." },
  "result": {
    "success": true,
    "summary": {
      "criados": 10,
      "atualizados": 2,
      "pulados": 1,
      "erros": [
        { "linha": 3, "motivo": "Falta nome ou celular" }
      ]
    },
    "metadata": [
      { "label": "Clientes Cadastrados", "value": 12 },
      { "label": "Erros de Importação", "value": 1 }
    ]
  },
  "failedReason": null,
  "attemptsMade": 0
}
```

Notas da importação:
- Sucesso considera linhas criadas + atualizadas.
- Erros contabilizam todas as linhas com falha; o processamento continua mesmo com erros por linha.

## Configuração do Stripe

### 1. Produto e Preço
1. Acesse o dashboard do Stripe
2. Crie um `Product` (ex: "CRM SaaS")
3. Adicione um `Price` mensal (ex: R$ 59,90)
4. Configure para usar quantidade da assinatura

### 2. Webhook
1. Configure um webhook endpoint: `https://sua-api.com/api/stripe/webhook`
2. Selecione os eventos:
   - `checkout.session.completed`
   - `customer.subscription.created`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
   - `invoice.paid`
   - `invoice.payment_failed`
   - `payment_intent.succeeded`
   - `payment_intent.payment_failed`

### 3. Customer Portal
1. Ative o Customer Portal
2. Configure permissões:
   - ✅ Update quantities
   - ✅ Switch plan
   - ✅ Cancel subscription

## Fluxo de Uso

### 1. Onboarding
```javascript
// 1. Criar tenant
POST /api/tenants
{
  "name": "Minha Empresa",
  "email": "contato@empresa.com"
}

// 2. Criar checkout
POST /api/billing/checkout
{
  "tenant_id": "uuid-do-tenant",
  "price_id": "price_xxxxxx",
  "seatCountInicial": 5,
  "success_url": "https://app.com/success",
  "cancel_url": "https://app.com/cancel"
}
```

### 2. Gerenciamento de Assentos
```javascript
// Sincronizar assentos automaticamente
POST /api/seats/sync
{
  "tenant_id": "uuid-do-tenant"
}

// Verificar uso atual
GET /api/seats/usage/uuid-do-tenant
```

### 3. Portal do Cliente
```javascript
// Gerar link do portal
POST /api/billing/portal
{
  "tenant_id": "uuid-do-tenant"
}
```

## Banco de Dados

### Modelo de Dados

#### tenants
- `id` (UUID) - PK
- `name` (VARCHAR) - Nome da empresa
- `stripe_customer_id` (VARCHAR) - ID do customer no Stripe
- `status_billing` (ENUM) - Status da cobrança

#### subscriptions
- `id` (UUID) - PK
- `tenant_id` (UUID) - FK para tenants
- `stripe_subscription_id` (VARCHAR) - ID da assinatura no Stripe
- `stripe_price_id` (VARCHAR) - ID do preço no Stripe
- `quantity` (INTEGER) - Número de assentos
- `status` (ENUM) - Status da assinatura
- `current_period_end` (TIMESTAMP) - Fim do período atual

#### sugestoes
- `id_sugestao` (INTEGER) - PK
- `id_usuario` (UUID) - FK para users
- `tipo` (ENUM) - Pode ser `Comentário`, `Sugestão` ou `Bug`
- `mensagem` (STRING) - Texto de até 800 caracteres

#### users
- `id` (UUID) - PK
- `tenant_id` (UUID) - FK para tenants
- `email` (VARCHAR) - Email do usuário
- `name` (VARCHAR) - Nome do usuário
- `role` (ENUM) - Papel do usuário
- `is_active` (BOOLEAN) - Se o usuário está ativo

#### audit_billing_events
- `id` (UUID) - PK
- `type` (VARCHAR) - Tipo do evento
- `payload_json` (JSONB) - Payload completo do webhook
- `processed_at` (TIMESTAMP) - Quando foi processado
- `stripe_event_id` (VARCHAR) - ID do evento no Stripe

## Segurança

- Verificação de assinatura dos webhooks do Stripe
- Autenticação JWT para endpoints protegidos
- Validação de dados de entrada
- Middleware de segurança (Helmet)
- CORS configurado

## Monitoramento

- Logs estruturados com Morgan
- Health check endpoint: `GET /health`
- Auditoria completa de eventos de billing
- Tratamento de erros centralizado

## Deployment

A API está configurada para escutar em `0.0.0.0` e suporta CORS, sendo adequada para deployment em containers ou serviços cloud.

### Variáveis de Ambiente Obrigatórias
- `DATABASE_URL`
- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `JWT_SECRET`

## Suporte

Para dúvidas ou problemas, consulte a documentação do Stripe ou abra uma issue no repositório.

## Comandos

stripe listen --forward-to localhost:3000/api/stripe/webhook
## Postman

Uma coleção Postman está disponível em `postman/converto-api.postman_collection.json` e um arquivo de ambiente em `postman/converto-api.postman_environment.json`.
Importe ambos no Postman, defina a variável `base_url` para o endereço da API e utilize a variável `token` após autenticação.

Exemplo de uso da rota aninhada de eventos por cliente:

`GET http://localhost:3000/api/clientes/<ID_CLIENTE_UUID>/eventos?tz=America/Fortaleza`

## Mensagens Automáticas (Mensagens Padrão)

As rotas de Mensagens Automáticas permitem cadastrar textos prontos para uso em comunicações. Todas as rotas exigem autenticação via JWT e uma assinatura ativa do tenant.

- Base Path: `/api/mensagens-padrao` (conforme configurado atualmente em `server.js`)
- Autenticação: Header `Authorization: Bearer <token>`
- Content-Type: `application/json`

### Criar mensagem
- Método: `POST /api/mensagens-padrao`
- Entrega (body):
  - `nome` (string, obrigatório): nome descritivo
  - `mensagem` (texto, obrigatório): conteúdo; suporta quebras de linha e emojis
- Recebe (200/201):
  - `{ sucesso: true, mensagem: 'Mensagem padrão criada com sucesso.', dado: { idMensagem, nome, mensagem, createdAt, updatedAt, ... } }`
- Erros comuns: 400 (campos obrigatórios), 401/403 (auth), 402 (assinatura), 500

Exemplo:
```
POST {{base_url}}/api/mensagens-padrao
Authorization: Bearer {{token}}
Content-Type: application/json

{
  "nome": "Boas-vindas",
  "mensagem": "Olá! Obrigado por entrar em contato.\nComo posso ajudar? 😊"
}
```

### Listar mensagens (com paginação e busca)
- Método: `GET /api/mensagens-padrao?q=&page=&limit=`
- Entrega (query):
  - `q` (string, opcional): termo para buscar em `nome` e `mensagem`
  - `page` (número, opcional, padrão 1)
  - `limit` (número, opcional, padrão 20)
- Recebe (200):
  - `{ sucesso: true, total, pagina, limite, dados: [ { idMensagem, nome, mensagem, ... } ] }`

### Obter mensagem por ID
- Método: `GET /api/mensagens-padrao/:idMensagem`
- Recebe (200): `{ sucesso: true, dado: { idMensagem, nome, mensagem, ... } }`
- Erros comuns: 404 (não encontrada), 401/403/402

### Atualizar mensagem
- Método: `PUT /api/mensagens-padrao/:idMensagem`
- Entrega (body):
  - `nome` (string, opcional)
  - `mensagem` (texto, opcional)
- Recebe (200): `{ sucesso: true, mensagem: 'Mensagem padrão atualizada com sucesso.', dado: {...} }`
- Erros comuns: 404, 401/403/402

### Deletar mensagem
- Método: `DELETE /api/mensagens-padrao/:idMensagem`
- Recebe (200): `{ sucesso: true, mensagem: 'Mensagem padrão deletada com sucesso.' }`
- Observação: remoção lógica (soft delete) habilitada via `paranoid: true`

Notas de sanitização e segurança:
- Os campos de texto passam por `trim`, remoção de caracteres de controle, e escape básico de HTML preservando quebras de linha e emojis.
- Busca usa `LIKE` em `nome` e `mensagem`.
