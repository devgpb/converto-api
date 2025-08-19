# Exemplos de Uso da API SaaS

## Configuração Inicial

Antes de usar a API, configure as variáveis de ambiente no arquivo `.env`:

```bash
# Database
DATABASE_URL=postgresql://postgres:password@localhost:5432/saas_db

# Stripe (obtenha suas chaves no dashboard do Stripe)
STRIPE_SECRET_KEY=sk_test_sua_chave_secreta_aqui
STRIPE_WEBHOOK_SECRET=whsec_seu_webhook_secret_aqui

# JWT
JWT_SECRET=sua-chave-jwt-super-secreta

# Server
PORT=3000
NODE_ENV=development
```

## 1. Criando um Tenant

```bash
curl -X POST http://localhost:3000/api/tenants \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Minha Empresa SaaS",
    "email": "contato@minhaempresa.com"
  }'
```

**Resposta esperada:**
```json
{
  "id": "uuid-do-tenant",
  "name": "Minha Empresa SaaS",
  "stripe_customer_id": "cus_xxxxxxxxxxxxxx",
  "status_billing": "incomplete",
  "created_at": "2025-08-18T20:30:00.000Z"
}
```

## 2. Criando uma Sessão de Checkout

```bash
curl -X POST http://localhost:3000/api/billing/checkout \
  -H "Content-Type: application/json" \
  -d '{
    "tenant_id": "uuid-do-tenant",
    "price_id": "price_xxxxxxxxxxxxxx",
    "seatCountInicial": 5,
    "success_url": "https://seusite.com/success",
    "cancel_url": "https://seusite.com/cancel"
  }'
```

**Resposta esperada:**
```json
{
  "checkout_url": "https://checkout.stripe.com/pay/cs_xxxxxxxxxxxxxx",
  "session_id": "cs_xxxxxxxxxxxxxx"
}
```

## 3. Verificando Status da Assinatura

```bash
# Primeiro, obtenha um token JWT (implementar autenticação)
curl -X GET http://localhost:3000/api/billing/status/uuid-do-tenant \
  -H "Authorization: Bearer seu-jwt-token"
```

**Resposta esperada:**
```json
{
  "tenant_id": "uuid-do-tenant",
  "status_billing": "active",
  "subscriptions": [
    {
      "id": "uuid-da-subscription",
      "stripe_subscription_id": "sub_xxxxxxxxxxxxxx",
      "stripe_price_id": "price_xxxxxxxxxxxxxx",
      "quantity": 5,
      "status": "active",
      "current_period_end": "2025-09-18T20:30:00.000Z"
    }
  ]
}
```

## 4. Sincronizando Assentos

```bash
curl -X POST http://localhost:3000/api/seats/sync \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer seu-jwt-token" \
  -d '{
    "tenant_id": "uuid-do-tenant"
  }'
```

**Resposta esperada:**
```json
{
  "message": "Quantidade de assentos sincronizada com sucesso",
  "tenant_id": "uuid-do-tenant",
  "previous_quantity": 5,
  "new_quantity": 7,
  "active_users_count": 7
}
```

## 5. Verificando Uso de Assentos

```bash
curl -X GET http://localhost:3000/api/seats/usage/uuid-do-tenant \
  -H "Authorization: Bearer seu-jwt-token"
```

**Resposta esperada:**
```json
{
  "tenant_id": "uuid-do-tenant",
  "paid_seats": 7,
  "active_users": 7,
  "total_users": 10,
  "seats_available": 0,
  "needs_sync": false,
  "subscription_status": "active"
}
```

## 6. Criando Portal do Cliente

```bash
curl -X POST http://localhost:3000/api/billing/portal \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer seu-jwt-token" \
  -d '{
    "tenant_id": "uuid-do-tenant",
    "return_url": "https://seuapp.com/dashboard"
  }'
```

**Resposta esperada:**
```json
{
  "portal_url": "https://billing.stripe.com/v2/customer/portal/xxxxxxxxxxxxxx"
}
```

## 7. Webhook do Stripe

Configure o webhook no dashboard do Stripe para apontar para:
```
https://sua-api.com/api/stripe/webhook
```

Eventos a monitorar:
- `checkout.session.completed`
- `customer.subscription.created`
- `customer.subscription.updated`
- `customer.subscription.deleted`
- `invoice.paid`
- `invoice.payment_failed`
- `payment_intent.succeeded`
- `payment_intent.payment_failed`

## Fluxo Completo de Onboarding

1. **Criar Tenant**: `POST /api/tenants`
2. **Criar Checkout**: `POST /api/billing/checkout`
3. **Cliente completa pagamento** (redirecionado para Stripe)
4. **Webhook confirma pagamento**: `POST /api/stripe/webhook`
5. **Status atualizado automaticamente**
6. **Cliente pode gerenciar via Portal**: `POST /api/billing/portal`

## Códigos de Status HTTP

- `200` - Sucesso
- `201` - Criado com sucesso
- `400` - Dados inválidos
- `401` - Não autenticado
- `403` - Sem permissão
- `404` - Não encontrado
- `409` - Conflito (duplicação)
- `500` - Erro interno do servidor

## Tratamento de Erros

Todas as respostas de erro seguem o formato:
```json
{
  "error": "Descrição do erro",
  "details": "Detalhes adicionais (apenas em desenvolvimento)"
}
```

## Teste Simples (Sem Stripe)

Para testar a API sem configurar o Stripe, use o endpoint de teste:

```bash
curl -X POST http://localhost:3001/api/test-tenant \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Empresa Teste",
    "email": "teste@empresa.com"
  }'
```

Este endpoint cria um tenant no banco de dados sem integração com o Stripe.

