# Deploy da API na VPS da Hostinger com Supabase (Postgres)

Este guia descreve, passo a passo, como fazer o deploy desta API Node.js/Express em uma VPS da Hostinger, usando o Postgres gerenciado do Supabase, com PM2 (process manager), Nginx (reverse proxy) e Redis (para filas BullMQ). Instruções em Ubuntu 22.04/24.04.

Observação: a API utiliza Sequelize (Postgres), BullMQ (Redis), e expõe um painel de filas em `/admin/queues`. O arquivo de exemplo de ambiente está em `.env.example`.


## Pré‑requisitos

- VPS Hostinger (Ubuntu 22.04/24.04) com acesso SSH e um domínio configurado (ex.: `api.seudominio.com`).
- Projeto Supabase criado, com credenciais de conexão ao Postgres e senha do usuário principal.
- Chaves opcionais (se for usar): Stripe, SMTP (Mailgun, etc.).
- Porta que a API irá rodar internamente (ex.: `3000`).


## 1) Acessar a VPS

Conecte via SSH:

```bash
ssh root@IP_DA_VPS
# ou usuário configurado
```

Atualize o sistema:

```bash
apt update && apt upgrade -y
apt install -y git curl build-essential ufw
```


## 2) Instalar Node.js LTS e PM2

Recomendado: NVM para instalar Node LTS estável.

```bash
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash
source ~/.bashrc
nvm install --lts
node -v
npm -v
```

Instale PM2 globalmente:

```bash
npm i -g pm2
pm2 -v
```


## 3) Clonar o projeto ou enviar os arquivos

Opção A — Clonar do seu repositório (substitua pela sua URL):

```bash
cd /var/www
git clone SUA_URL_DO_REPO.git api
cd api
```

Opção B — Enviar um `.zip` via SFTP e descompactar em `/var/www/api`.

Dê permissão mínima apropriada ao diretório:

```bash
chown -R $USER:$USER /var/www/api
chmod -R 755 /var/www/api
```


## 4) Configurar Redis (requisito para BullMQ)

Instale e habilite o Redis local (padrão em 127.0.0.1:6379):

```bash
apt install -y redis-server
systemctl enable redis-server
systemctl start redis-server
systemctl status redis-server --no-pager
```

Deixe acessível apenas localmente (padrão já é `bind 127.0.0.1`):

```bash
grep -n "^bind" /etc/redis/redis.conf
# se necessário, edite e mantenha: bind 127.0.0.1 ::1
```

A API lê `REDIS_URL` (ex.: `redis://127.0.0.1:6379`).


## 5) Obter a Connection String do Supabase (Postgres)

No painel do Supabase:

- Vá em Database → Connection string → escolha Node.js e copie a URL “Direct” (não a versão com pgbouncer/pooled, a menos que você saiba usá-la com Sequelize).
- Garanta SSL obrigatório. Se a URL não tiver, acrescente `?sslmode=require` no final. Exemplo:

```
postgresql://postgres:senha@db.xxxxx.supabase.co:5432/postgres?sslmode=require
```

Observação: Sequelize usa `pg` e aceita a URL com `sslmode=require`. Alternativamente, você pode configurar `dialectOptions.ssl`, mas nesta base a conexão é feita apenas pela `DATABASE_URL` (veja `config/database.js`).


## 6) Configurar variáveis de ambiente

Use `.env.example` como referência e crie o `.env`:

```bash
cd /var/www/api
cp .env.example .env
nano .env
```

Ajuste pelo menos:

- `DATABASE_URL=postgresql://...@db.xxxxx.supabase.co:5432/postgres?sslmode=require`
- `PORT=3000`
- `NODE_ENV=production`
- `REDIS_URL=redis://127.0.0.1:6379`
- (Opcional) Stripe: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`
- (Opcional) SMTP: `SMTP_*`

Salve o arquivo e restrinja permissões:

```bash
chmod 600 .env
```


## 7) Instalar dependências e rodar migrações

Dentro do diretório do projeto:

```bash
npm ci || npm install
npm run migrar
```

Se as migrações exigirem uma base específica, confira se o usuário do Supabase tem permissão para criar tabelas no schema desejado.


## 8) Teste local rápido

Suba a API em foreground para validar conexão:

```bash
PORT=3000 NODE_ENV=production node server.js
```

Em outro terminal, teste:

```bash
curl -sS http://127.0.0.1:3000/health | jq .
```

Pare com Ctrl+C quando validar.


## 9) Rodar com PM2 (API e Workers)

- API:

```bash
cd /var/www/api
pm2 start server.js --name saas-api
```

- Workers BullMQ (opcional – processam filas de import/export):

```bash
pm2 start queues/workers/index.js --name saas-queues
```

- Persistência e autostart no boot:

```bash
pm2 save
pm2 startup systemd -u $USER --hp $HOME
# Siga a instrução que o PM2 mostra (um comando systemctl) e rode-a
```

- Logs (útil para troubleshooting):

```bash
pm2 logs saas-api --lines 200
pm2 logs saas-queues --lines 200
```


## 10) Nginx como reverse proxy

Instale e habilite Nginx:

```bash
apt install -y nginx
systemctl enable nginx
systemctl start nginx
```

Crie o host do domínio, apontando para a API na porta interna 3000:

```bash
nano /etc/nginx/sites-available/api.conf
```

Conteúdo sugerido (ajuste `server_name`):

```nginx
server {
  listen 80;
  listen [::]:80;
  server_name api.seudominio.com;

  # opcional: limite de upload se necessário
  client_max_body_size 20m;

  location / {
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;

    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";

    proxy_pass http://127.0.0.1:3000;
  }
}
```

Habilite o site e recarregue:

```bash
ln -s /etc/nginx/sites-available/api.conf /etc/nginx/sites-enabled/api.conf
nginx -t
systemctl reload nginx
```

Acesse `http://api.seudominio.com/health` para verificar.


## 11) HTTPS com Certbot

Use o Certbot para emitir SSL automaticamente com Nginx:

```bash
apt install -y snapd
snap install core; snap refresh core
snap install --classic certbot
ln -s /snap/bin/certbot /usr/bin/certbot

certbot --nginx -d api.seudominio.com --redirect
```

O Certbot instalará o certificado e adicionará redireciono para HTTPS.


## 12) Firewall (UFW) – opcional

Permita OpenSSH e Nginx:

```bash
ufw allow OpenSSH
ufw allow 'Nginx Full'
ufw enable
ufw status
```


## 13) Stripe Webhooks (opcional)

Se usar Stripe, configure o endpoint no painel Stripe para:

```
https://api.seudominio.com/api/stripe/webhook
```

A API já monta o middleware de webhook antes do `express.json`. Defina `STRIPE_WEBHOOK_SECRET` no `.env`.


## 14) Endpoints úteis

- Health check: `GET /health`
- API raiz: `GET /`
- Painel BullMQ: `GET /admin/queues` (protegido via rede; considere IP allowlist/VPN se necessário)


## 15) Troubleshooting

- Erro SSL/Sequelize com Supabase:
  - Garanta `?sslmode=require` na `DATABASE_URL`.
  - Verifique se a `DATABASE_URL` é a conexão “Direct” (não pgbouncer), a menos que você tenha configurado pooling compatível.

- Migrações falhando (permissões):
  - Confirme usuário do Supabase e permissões no database/schema utilizado.

- 502/504 no Nginx:
  - Veja `pm2 logs saas-api` para erros da aplicação.
  - Verifique se a app está escutando em `0.0.0.0:3000` (o código usa isso por padrão).

- Redis indisponível / filas travadas:
  - `systemctl status redis-server` e `redis-cli PING` → deve responder `PONG`.
  - Confirme `REDIS_URL=redis://127.0.0.1:6379`.

- Webhook Stripe inválido:
  - Cheque se o endpoint público é HTTPS e se `STRIPE_WEBHOOK_SECRET` está correto.

- Portas bloqueadas:
  - Libere portas 80/443 no UFW/Firewall da VPS.


## 16) Checklist de produção

- NODE_ENV=production no `.env` e no ambiente do PM2.
- PM2 com `pm2 save` e `pm2 startup` configurados.
- SSL ativo e renovação automática do Certbot (cron do snapd já cobre).
- Logs monitorados (PM2, Nginx) e atualizações de segurança do sistema em dia.
- Backups do banco via Supabase habilitados.


## Referências do projeto

- `server.js` – inicializa Express na `PORT` e faz `sequelize.authenticate()`.
- `config/database.js` – usa `process.env.DATABASE_URL` (Postgres via Sequelize).
- `.env.example` – variáveis de ambiente necessárias.
- `queues/*` e `services/redis.js` – BullMQ com Redis (`REDIS_URL`).
- Scripts úteis: `npm run migrar`, `npm run queue:workers` (ou PM2 nos workers).

---

Qualquer dúvida ou se quiser, posso ajustar o guia para seu domínio específico e criar os arquivos de config do Nginx prontos para uso.
