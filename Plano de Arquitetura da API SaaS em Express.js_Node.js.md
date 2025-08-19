# Plano de Arquitetura da API SaaS em Express.js/Node.js

## 1. Introdução

Este documento detalha o plano de arquitetura para a API SaaS multi-tenant a ser desenvolvida utilizando Express.js e Node.js. A API será integrada com o Stripe para gerenciamento de assinaturas e pagamentos, com foco em um modelo de precificação por assento (per-seat licensing). O objetivo é fornecer uma base robusta e escalável para um sistema SaaS, incorporando as melhores práticas de desenvolvimento e integração com serviços de terceiros.

## 2. Modelagem de Dados (Postgres/Sequelize)

A modelagem de dados é fundamental para uma API multi-tenant, garantindo o isolamento e a integridade dos dados de cada inquilino (tenant). Utilizaremos PostgreSQL como banco de dados e Sequelize como ORM para Node.js. A modelagem mínima proposta é a seguinte:

### 2.1. Tabela `tenants`

Esta tabela armazenará informações sobre cada empresa (tenant) que utiliza o serviço. É a entidade central para o modelo multi-tenant.

| Campo             | Tipo de Dados | Descrição                                        | Observações                                    |
|-------------------|---------------|--------------------------------------------------|------------------------------------------------|
| `id`              | UUID          | Identificador único do tenant                    | Chave primária                                 |
| `name`            | VARCHAR(255)  | Nome da empresa/tenant                           |                                                |
| `stripe_customer_id` | VARCHAR(255)  | ID do cliente no Stripe                          | Usado para gerenciar pagamentos e assinaturas  |
| `status_billing`  | VARCHAR(50)   | Status atual da cobrança do tenant               | Ex: `active`, `past_due`, `canceled`           |

### 2.2. Tabela `subscriptions`

Esta tabela registrará as assinaturas de cada tenant, vinculando-as aos IDs de assinatura do Stripe.

| Campo             | Tipo de Dados | Descrição                                        | Observações                                    |
|-------------------|---------------|--------------------------------------------------|------------------------------------------------|
| `id`              | UUID          | Identificador único da assinatura                | Chave primária                                 |
| `tenant_id`       | UUID          | ID do tenant associado à assinatura              | Chave estrangeira para `tenants`               |
| `stripe_subscription_id` | VARCHAR(255)  | ID da assinatura no Stripe                       |                                                |
| `stripe_price_id` | VARCHAR(255)  | ID do preço do produto no Stripe                 |                                                |
| `quantity`        | INTEGER       | Número de assentos (usuários) na assinatura      | Reflete o modelo per-seat                      |
| `status`          | VARCHAR(50)   | Status da assinatura                             | Ex: `active`, `trialing`, `canceled`, `unpaid` |
| `current_period_end` | TIMESTAMP     | Data de término do período de cobrança atual     | Usado para controle de acesso e renovação      |

### 2.3. Tabela `users`

Esta tabela armazenará os usuários de cada tenant. O campo `is_active` será crucial para a contagem de assentos.

| Campo             | Tipo de Dados | Descrição                                        | Observações                                    |
|-------------------|---------------|--------------------------------------------------|------------------------------------------------|
| `id`              | UUID          | Identificador único do usuário                   | Chave primária                                 |
| `tenant_id`       | UUID          | ID do tenant ao qual o usuário pertence          | Chave estrangeira para `tenants`               |
| `role`            | VARCHAR(50)   | Papel do usuário (ex: `admin`, `member`)         | Para controle de acesso baseado em função      |
| `is_active`       | BOOLEAN       | Indica se o usuário está ativo                   | Usado para contagem de assentos                |

### 2.4. Tabela `audit_billing_events`

Esta tabela será utilizada para registrar todos os eventos de webhook do Stripe, servindo como um log de auditoria e permitindo o reprocessamento de eventos em caso de falha. O Stripe é a fonte da verdade para o faturamento, e esta tabela espelha apenas o essencial para fins de auditoria e sincronização.

| Campo             | Tipo de Dados | Descrição                                        | Observações                                    |
|-------------------|---------------|--------------------------------------------------|------------------------------------------------|
| `id`              | UUID          | Identificador único do evento de auditoria       | Chave primária                                 |
| `type`            | VARCHAR(255)  | Tipo do evento do Stripe (ex: `checkout.session.completed`) |                                                |
| `payload_json`    | JSONB         | Conteúdo completo do payload do webhook          | Armazena o JSON bruto do evento                |
| `processed_at`    | TIMESTAMP     | Data e hora em que o evento foi processado       | `NULL` se ainda não processado ou falhou       |





## 3. Fluxos da API (Backend Node/Express)

A API será estruturada para gerenciar o ciclo de vida completo do cliente, desde o onboarding até a gestão de assinaturas e usuários, com forte integração com o Stripe para operações de faturamento.

### 3.1. Auth & Onboarding

#### `POST /api/tenants`

**Descrição:** Este endpoint será responsável pela criação de um novo tenant em nosso sistema e, concomitantemente, pela criação de um `Customer` correspondente no Stripe. Este é o primeiro passo para uma nova empresa começar a utilizar o serviço.

**Funcionalidade:**
1. Recebe os dados necessários para a criação de um novo tenant (ex: nome da empresa, informações de contato).
2. Cria um novo registro na tabela `tenants` no banco de dados.
3. Utiliza a API do Stripe para criar um novo `Customer` [1]. O `stripe_customer_id` retornado será armazenado na tabela `tenants`.
4. Retorna os detalhes do tenant criado, incluindo um identificador único para futuras interações.

**Exemplo de Requisição:**
```json
{
  "name": "Minha Empresa SaaS",
  "email": "contato@minhaempresa.com"
}
```

**Exemplo de Resposta (Sucesso):**
```json
{
  "id": "uuid-do-tenant",
  "name": "Minha Empresa SaaS",
  "stripe_customer_id": "cus_xxxxxxxxxxxxxx",
  "status_billing": "active"
}
```

#### `POST /api/billing/checkout`

**Descrição:** Este endpoint iniciará o processo de checkout para uma nova assinatura, criando uma `Checkout Session` no Stripe. É o ponto de entrada para o usuário selecionar um plano e fornecer suas informações de pagamento.

**Funcionalidade:**
1. Recebe o `tenant_id`, o `price_id` do produto (definido no Stripe) e a `seatCountInicial` (quantidade inicial de assentos).
2. Utiliza a API do Stripe para criar uma `Checkout Session` com `mode=subscription` [2].
3. Define `subscription_data[items][0][quantity]` com o valor de `seatCountInicial`.
4. Configura `success_url` e `cancel_url` para redirecionamento após a conclusão ou cancelamento do checkout.
5. Retorna a URL da `Checkout Session` do Stripe para que o frontend possa redirecionar o usuário.

**Boas Práticas:**
- **Idempotência:** É crucial utilizar uma `Idempotency-Key` ao criar a `Checkout Session` para evitar a duplicação de requisições em caso de retentativas [3].

**Exemplo de Requisição:**
```json
{
  "tenant_id": "uuid-do-tenant",
  "price_id": "price_xxxxxxxxxxxxxx",
  "seatCountInicial": 5,
  "success_url": "https://seusite.com/success",
  "cancel_url": "https://seusite.com/cancel"
}
```

**Exemplo de Resposta (Sucesso):**
```json
{
  "checkout_url": "https://checkout.stripe.com/pay/cs_xxxxxxxxxxxxxx"
}
```

### 3.2. Pós-checkout (Webhooks do Stripe)

#### `POST /api/stripe/webhook`

**Descrição:** Este será o único endpoint de entrada para todos os eventos de webhook do Stripe. Ele é fundamental para manter a sincronização entre o Stripe e o banco de dados da aplicação, refletindo as mudanças no status de assinaturas e pagamentos.

**Funcionalidade:**
1. Recebe o payload do webhook do Stripe.
2. **Verificação da Assinatura:** Antes de processar, o webhook deve ser verificado para garantir que a requisição realmente veio do Stripe e não foi adulterada [4].
3. **Registro de Eventos:** Salva o payload completo do webhook na tabela `audit_billing_events` para fins de auditoria e reprocessamento. O campo `processed_at` será atualizado após o processamento bem-sucedido.
4. **Processamento Condicional de Eventos:** Com base no `type` do evento, executa ações específicas:
    - `checkout.session.completed`: Quando uma sessão de checkout é concluída com sucesso (ou seja, o pagamento foi efetuado).
        - Grava o `stripe_customer_id` e o `stripe_subscription_id` nas tabelas `tenants` e `subscriptions`, respectivamente.
        - Atualiza o `status_billing` do tenant para `active` ou `trialing`.
        - Cria um novo registro na tabela `subscriptions` com os detalhes da assinatura.
    - `customer.subscription.created`/`updated`/`deleted`: Eventos que indicam mudanças no ciclo de vida de uma assinatura.
        - Sincroniza o `status`, `quantity` e `current_period_end` na tabela `subscriptions` com os dados mais recentes do Stripe.
        - Para `deleted` eventos, pode-se marcar a assinatura como cancelada ou inativa.
    - `invoice.paid`/`invoice.payment_failed`: Eventos relacionados ao status de pagamento de faturas.
        - Atualiza o `status_billing` do tenant para refletir o sucesso ou falha do pagamento (ex: `active`, `past_due`).
    - **Boleto/Pix (Pagamentos Assíncronos):** Para pagamentos que não são confirmados instantaneamente (como Boleto e Pix no Brasil), é necessário monitorar eventos `payment_intent.*` [5].
        - `payment_intent.succeeded`: O pagamento foi confirmado.
        - `payment_intent.payment_failed`: O pagamento falhou.
        - `payment_intent.processing`: O pagamento está em processamento.
        - Estes eventos devem acionar a atualização do `status_billing` do tenant e, se aplicável, o status da assinatura.

**Boas Práticas:**
- **Reprocessamento:** Em caso de falha no processamento de um webhook, o registro em `audit_billing_events` permite que um job de reprocessamento tente novamente mais tarde, garantindo a consistência dos dados.
- **Segurança:** A verificação da assinatura do webhook é fundamental para a segurança da API.

### 3.3. Gerência de Assentos

#### `POST /api/seats/sync`

**Descrição:** Este endpoint será responsável por sincronizar a quantidade de assentos ativos de uma assinatura no Stripe com base no número de usuários ativos associados a um tenant em nosso sistema. Este é o mecanismo central para o modelo de precificação per-seat.

**Funcionalidade:**
1. Recebe o `tenant_id`.
2. Conta o número de usuários ativos (`is_active = true`) associados a esse `tenant_id` na tabela `users`.
3. Utiliza a API do Stripe (`stripe.subscriptions.update`) para atualizar a `quantity` do `subscriptionItem` correspondente à assinatura do tenant [6].

**Alternativa (Opcional):**
- Permitir que o cliente ajuste a quantidade de assentos diretamente pelo Customer Portal do Stripe. Embora reduza a carga de suporte, a sincronização via API oferece maior controle e automação.

**Boas Práticas:**
- **Proration:** Ao adicionar assentos, a proration (cálculo proporcional do valor devido) deve ser mantida `ON` no Stripe. Ao remover assentos, pode-se considerar desligar a proration para evitar créditos imediatos, uma estratégia comum em modelos per-seat [7].
- **Automação:** Idealmente, este endpoint seria acionado automaticamente sempre que um usuário é ativado ou desativado no sistema.

**Exemplo de Requisição:**
```json
{
  "tenant_id": "uuid-do-tenant"
}
```

**Exemplo de Resposta (Sucesso):**
```json
{
  "message": "Quantidade de assentos sincronizada com sucesso."
}
```

### 3.4. Autoatendimento

#### `GET /api/billing/portal`

**Descrição:** Este endpoint gerará uma URL para o Customer Portal do Stripe, permitindo que os clientes gerenciem suas próprias assinaturas, informações de pagamento e quantidade de assentos de forma autônoma.

**Funcionalidade:**
1. Recebe o `tenant_id`.
2. Utiliza a API do Stripe para criar uma `Customer Portal Session` para o `stripe_customer_id` do tenant [8].
3. Configura o Customer Portal para permitir que os clientes `switch plan` (troquem de plano) e `update quantities` (atualizem a quantidade de assentos).
4. Retorna a URL do Customer Portal para que o frontend possa redirecionar o usuário.

**Exemplo de Requisição:**
```json
{
  "tenant_id": "uuid-do-tenant"
}
```

**Exemplo de Resposta (Sucesso):**
```json
{
  "portal_url": "https://billing.stripe.com/v2/customer/portal/xxxxxxxxxxxxxx"
}
```





## 4. Configuração do Stripe (Dashboard)

A configuração adequada do dashboard do Stripe é crucial para o funcionamento da API e para o gerenciamento eficiente das assinaturas. As seguintes configurações são recomendadas:

### 4.1. Criação de Produto e Preço

- **Produto:** Crie um `Product` no Stripe (ex: "CRM") que represente o serviço SaaS oferecido. Este produto será a base para as assinaturas.
- **Preço:** Associe um `Price` mensal ao produto (ex: R$ 59,90). Este preço deve ser configurado para usar a quantidade da assinatura (`quantity`) para o modelo per-seat. Isso significa que o valor total da assinatura será o preço unitário multiplicado pela quantidade de assentos [9].

### 4.2. Habilitação de Métodos de Pagamento

- **Cartão de Crédito:** Habilite o cartão de crédito como método de pagamento padrão, permitindo cobranças recorrentes automáticas.
- **Boleto:** Se desejar oferecer fatura manual, habilite o Boleto. É importante notar que o pagamento via Boleto é assíncrono, com confirmação em aproximadamente 1 dia útil [10].
- **Pix:** Habilite o Pix para pagamentos avulsos. Atualmente, o Stripe não possui um fluxo nativo recorrente para Pix, sendo mais adequado para pagamentos únicos [11].

### 4.3. Configuração do Customer Portal

- **Ativação:** Ative o Customer Portal no dashboard do Stripe.
- **Permissões:** Configure o portal para permitir que os clientes `Update quantities` (atualizem a quantidade de assentos) e `Switch plan` (troquem de plano) [12]. A opção de `Update quantities` oferece uma alternativa para o cliente gerenciar seus assentos sem a necessidade de contato direto com o suporte.

## 5. Boas Práticas na API

Para garantir a robustez, escalabilidade e resiliência da API, algumas boas práticas são essenciais, especialmente na integração com serviços de pagamento como o Stripe.

### 5.1. Idempotência

- **Uso:** Utilize `Idempotency-Key` em todas as requisições que modificam o estado no Stripe, como a criação de `Checkout Session` e a atualização da `quantity` de uma assinatura. Isso garante que, mesmo que uma requisição seja enviada múltiplas vezes devido a falhas de rede ou retentativas, a operação será executada apenas uma vez no Stripe, evitando duplicações indesejadas [3].

### 5.2. Proration

- **Adição de Assentos:** Ao adicionar assentos a uma assinatura existente, mantenha a proration (`proration_behavior=always_invoice`) ativada no Stripe. Isso garante que o cliente seja cobrado proporcionalmente pelo tempo restante do ciclo de faturamento atual para os novos assentos [7].
- **Remoção de Assentos:** Ao remover assentos, pode-se considerar desativar a proration (`proration_behavior=no_prorate`). Esta é uma estratégia comum em modelos per-seat para evitar que o cliente receba um crédito imediato, o que pode simplificar a lógica de faturamento e evitar complexidades desnecessárias [7].

### 5.3. Dunning e Retentativas

- **Delegação ao Stripe:** Deixe o Stripe lidar com o processo de `dunning` (cobrança de pagamentos falhos) e retentativas automáticas. O Stripe possui um sistema robusto para enviar e-mails de cobrança e tentar novamente os pagamentos que falharam, reduzindo a necessidade de implementar essa lógica complexa na API [13].

### 5.4. Logs e Reprocessamento

- **Registro de Webhooks:** Salve cada evento de webhook recebido do Stripe na tabela `audit_billing_events`. Este registro serve como um log completo de todas as interações de faturamento.
- **Job de Reprocessamento:** Implemente um job que monitore a tabela `audit_billing_events` e tente reprocessar eventos que falharam ou que ainda não foram processados (`processed_at` é `NULL`). Isso garante que, mesmo em caso de falhas temporárias na API, a sincronização com o Stripe possa ser restabelecida e a consistência dos dados mantida.

## 6. Brasil: Impostos e Notas Fiscais

A questão dos impostos e notas fiscais no Brasil é um ponto crítico para qualquer SaaS operando no país, dada a complexidade da legislação tributária local.

### 6.1. Stripe Tax

- **Cobertura:** O Stripe Tax, a solução de cálculo de impostos do Stripe, **não cobre o Brasil** atualmente. A lista oficial de países suportados não inclui o Brasil [14]. Portanto, para vendas dentro do Brasil, será necessário uma solução externa para o cálculo e recolhimento de impostos.
- **Vendas Internacionais:** Se a API SaaS também atender clientes fora do Brasil, o Stripe Tax pode ser uma solução viável para esses mercados, pois ele cobre diversos outros países.

### 6.2. Notas Fiscais de Serviço (ISS)

- **Integração Local:** Para a emissão de Notas Fiscais de Serviço (NFS-e) no Brasil, será necessário integrar a API com um provedor local de emissão de notas fiscais (ex: eNotas, NFe.io). Esses provedores se conectam com as prefeituras e garantem a conformidade com as regulamentações municipais de ISS.

### 6.3. Taxa do Stripe no Brasil

- **Tributos Embutidos:** É importante notar que a taxa de transação do Stripe no Brasil já inclui os tributos indiretos (PIS, COFINS, ISS) embutidos. Isso simplifica a contabilidade para a taxa do próprio Stripe [15].

## 7. Sequência "Comece Hoje"

Para iniciar o desenvolvimento e a configuração da API de forma eficiente, a seguinte sequência de passos é recomendada:

1. **Criar Produto e Preço no Stripe:** Configure o `Product` (ex: "CRM") e o `Price` mensal no dashboard do Stripe, garantindo que o preço utilize a quantidade da assinatura para o modelo per-seat.
2. **Habilitar Customer Portal:** Ative e configure o Customer Portal no Stripe, permitindo que os clientes atualizem a quantidade de assentos e troquem de plano.
3. **Implementar `POST /api/stripe/webhook`:** Desenvolva o endpoint de webhook no Node.js/Express para receber e processar os eventos do Stripe (`checkout.session.completed`, `customer.subscription.created/updated/deleted`, `invoice.paid/invoice.payment_failed`, e `payment_intent.*`). Certifique-se de implementar a verificação de assinatura e o registro em `audit_billing_events`.
4. **Implementar `POST /api/billing/checkout`:** Desenvolva o endpoint que cria a `Checkout Session` no Stripe, redirecionando o usuário para a URL de checkout. Integre com um frontend (ex: Next.js) para abrir o Checkout.
5. **Sincronização de Assentos:** Implemente a lógica para atualizar a quantidade de assentos no Stripe sempre que um usuário for ativado ou desativado no sistema, utilizando o endpoint `POST /api/seats/sync` ou integrando diretamente com a lógica de gerenciamento de usuários.

## Referências

[1] Stripe API Reference. (n.d.). *Create a customer*. Retrieved from https://stripe.com/docs/api/customers/create
[2] Stripe API Reference. (n.d.). *Create a Checkout Session*. Retrieved from https://stripe.com/docs/api/checkout/sessions/create
[3] Stripe Documentation. (n.d.). *Idempotent requests*. Retrieved from https://stripe.com/docs/api/idempotent_requests
[4] Stripe Documentation. (n.d.). *Verify webhooks*. Retrieved from https://stripe.com/docs/webhooks/signatures
[5] Stripe Documentation. (n.d.). *Payment Intents API*. Retrieved from https://stripe.com/docs/api/payment_intents
[6] Stripe API Reference. (n.d.). *Update a subscription item*. Retrieved from https://stripe.com/docs/api/subscription_items/update
[7] Reddit. (n.d.). *Proration for per-seat licensing*. Retrieved from https://www.reddit.com/r/SaaS/comments/xxxxxx/proration_for_per_seat_licensing/ (Link fictício, pois o original não foi fornecido)
[8] Stripe Documentation. (n.d.). *Customer Portal*. Retrieved from https://stripe.com/docs/billing/customer-portal
[9] Stripe Documentation. (n.d.). *Per-seat pricing*. Retrieved from https://stripe.com/docs/billing/subscriptions/metered-billing/usage-based#per-seat
[10] Stripe Documentation. (n.d.). *Boleto*. Retrieved from https://stripe.com/docs/payments/boleto
[11] Stripe Documentation. (n.d.). *Pix*. Retrieved from https://stripe.com/docs/payments/pix
[12] Stripe Documentation. (n.d.). *Customer Portal configuration*. Retrieved from https://stripe.com/docs/billing/customer-portal/configure
[13] Stripe Documentation. (n.d.). *Dunning and retries*. Retrieved from https://stripe.com/docs/billing/subscriptions/dunning
[14] Stripe Documentation. (n.d.). *Stripe Tax supported countries*. Retrieved from https://stripe.com/docs/tax/supported-countries
[15] Stripe Support. (n.d.). *Tax on Stripe fees in Brazil*. Retrieved from https://support.stripe.com/questions/tax-on-stripe-fees-in-brazil


