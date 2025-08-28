# Tutorial: Instalando e executando o Redis localmente

Este guia mostra como configurar o Redis para desenvolvimento local sem PM2.

## 1. Instalar o Redis

No Ubuntu/Debian:
```bash
sudo apt update
sudo apt install redis-server -y
```

No macOS (Homebrew):
```bash
brew install redis
```

## 2. Iniciar o servidor

Execute o comando abaixo para iniciar o Redis no terminal:
```bash
redis-server
```
O processo ficará em primeiro plano. Deixe este terminal aberto enquanto estiver usando o Redis.

## 3. Testar a conexão

Em outro terminal, rode:
```bash
redis-cli ping
# Deve responder com PONG
```

## 4. Encerrar o servidor

Use `Ctrl+C` no terminal onde o Redis está rodando para parar o serviço.

Pronto! Agora o Redis está configurado para uso local no desenvolvimento.
