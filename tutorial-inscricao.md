# Tutorial de Inscrição e Gestão de Assentos

Este guia apresenta as rotas necessárias para:
1. **Fazer uma inscrição** (criar um tenant e iniciar a assinatura).
2. **Acompanhar a assinatura**.
3. **Modificar a quantidade de assentos**.

Para todas as rotas protegidas, envie o cabeçalho `Authorization: Bearer <seu-token>` obtido no fluxo de autenticação.

## 1. Fazer uma inscrição

### 1.1 Criar um tenant
`POST /api/tenants`

**O que faz:** cria um tenant e um customer correspondente no Stripe.

**Recebe:**
```json
{
  "name": "Nome da Empresa",
  "email": "contato@empresa.com"
}
```

**Retorna (201):**
```json
{
  "id": "uuid-do-tenant",
  "name": "Nome da Empresa",
  "stripe_customer_id": "cus_xxxxxx",
  "status_billing": "incomplete",
  "created_at": "2025-01-01T12:00:00.000Z"
}
```

### 1.2 Criar sessão de checkout
`POST /api/billing/checkout`

**O que faz:** gera uma sessão de checkout do Stripe para iniciar a assinatura.

**Recebe:**
```json
{
  "tenant_id": "uuid-do-tenant",
  "price_id": "price_xxxxxx",
  "seatCountInicial": 5,
  "success_url": "https://app.com/sucesso",
  "cancel_url": "https://app.com/cancel"
}
```

**Retorna (201):**
```json
{
  "checkout_url": "https://checkout.stripe.com/...",
  "session_id": "cs_test_xxxxxx"
}
```

O usuário conclui o pagamento através do `checkout_url`.

## 2. Acompanhar a assinatura

### Status da assinatura
`GET /api/billing/status/:tenant_id`

**O que faz:** consulta o status atual de cobrança e assinaturas do tenant.

**Recebe:** parâmetro `tenant_id` na URL.

**Retorna (200):**
```json
{
  "tenant_id": "uuid-do-tenant",
  "status_billing": "active",
  "subscriptions": [
    {
      "id": "uuid-da-assinatura",
      "stripe_subscription_id": "sub_xxxxxx",
      "stripe_price_id": "price_xxxxxx",
      "quantity": 5,
      "status": "active",
      "current_period_end": "2025-02-01T12:00:00.000Z"
    }
  ]
}
```

## 3. Modificar assentos

### 3.1 Sincronizar assentos
`POST /api/seats/sync`

**O que faz:** ajusta a quantidade de assentos pagos para igualar o número de usuários ativos.

**Recebe:**
```json
{ "tenant_id": "uuid-do-tenant" }
```

**Retorna (200):**
```json
{
  "message": "Quantidade de assentos sincronizada com sucesso",
  "tenant_id": "uuid-do-tenant",
  "previous_quantity": 5,
  "new_quantity": 7,
  "active_users_count": 7
}
```

### 3.2 Adicionar assento
`POST /api/seats/add`

**O que faz:** ativa um usuário e atualiza a quantidade de assentos.

**Recebe:**
```json
{
  "tenant_id": "uuid-do-tenant",
  "user_id": "uuid-do-usuario"
}
```

**Retorna (200):** resposta da sincronização de assentos (mesmo formato da rota `/sync`).

### 3.3 Remover assento
`POST /api/seats/remove`

**O que faz:** desativa um usuário e reduz a quantidade de assentos pagos sem proration imediato.

**Recebe:**
```json
{
  "tenant_id": "uuid-do-tenant",
  "user_id": "uuid-do-usuario"
}
```

**Retorna (200):**
```json
{
  "message": "Assento removido com sucesso",
  "user_id": "uuid-do-usuario",
  "tenant_id": "uuid-do-tenant",
  "user_active": false
}
```

### 3.4 Verificar uso de assentos
`GET /api/seats/usage/:tenant_id`

**O que faz:** exibe a quantidade de assentos pagos e o uso atual.

**Recebe:** parâmetro `tenant_id` na URL.

**Retorna (200):**
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

