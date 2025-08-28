# Tutorial: Instalando e executando Redis com PM2

Este passo a passo mostra como instalar o Redis e mantê-lo ativo usando o [PM2](https://pm2.keymetrics.io/).

## 1. Instalar Redis
```bash
sudo apt update
sudo apt install redis-server -y
```

## 2. Testar serviço
```bash
redis-cli ping
# Deve responder com PONG
```

## 3. Instalar PM2 (caso ainda não tenha)
```bash
npm install -g pm2
```

## 4. Rodar o Redis com PM2
```bash
pm2 start `which redis-server` --name redis
pm2 save
```

## 5. Gerenciar
```bash
pm2 status
pm2 logs redis
pm2 stop redis
```

Assim o Redis fica ativo em segundo plano e reinicia automaticamente após reboot.
