# Plano de recuperação — Nexus Stream

## Estado atual (diagnóstico)

Repositório local aponta para `https://github.com/BrunoBarelli/nexus-stream.git` (novo, público).
O `git ls-tree HEAD` **não** contém o binário de 109 MB — esse problema já está resolvido no novo repo.

O único bloqueio restante é a **secret scanning do GitHub**: o arquivo `src/fly.toml` linha 8 contém
`DISCORD_TOKEN=MTU1ODkxODI2NzE5MDM4Njc5OQ...`. O GitHub recusa o push com:

```
path: src/fly.toml:8
To push, remove secret from commit(s) or follow this URL to allow the secret.
```

## Raiz da falha

`src/fly.toml` é configuração **morta** — o deploy no Fly.io falhou (token inválido) e estamos usando
Render. Ele só existe no repositório porque foi commitado por acidente, e carrega o token do Discord.

O `.env` local **não** está no repositório (está no `.gitignore`), então o token não vaza por ele.

## Plano (4 passos)

1. **Excluir `src/fly.toml`** — tira o segredo do repositório e elimina configuração morta.
2. **Commitar e dar push** — a secret scanning deve passar; o novo repo `nexus-stream` fica limpo.
3. **Render já tem as env vars configuradas** (PORT, NODE_ENV, DISCORD_TOKEN, CLIENT_ID, PRIVACY_URL,
   TERMS_URL) via `PUT /services/srv-db6pb0ij9qps739vt780/env-vars` — nenhuma ação necessária.
   O `dockerfilePath` já foi corrigido para `./src/Dockerfile` via PATCH.
4. **Disparar deploy manual no Render** (`POST /services/srv-db6pb0ij9qps739vt780/deploys`) e aguardar
   `status: live`. A URL ficará `https://nexus-stream-server.onrender.com`.

## Estado das demais peças (já OK)

- Vercel: `nexus-privacy.vercel.app`, `terms-lyart-omega.vercel.app`, `nexus-web-silk-pi.vercel.app` — todos respondem 200.
- Server local + túnel HTTPS: `https://hot-banks-begin.loca.lt` — rodando.
- Bot do Discord: logado como `Nexus bot#0362`, comandos `/stream`, `/painel`, `/ajuda` registrados.

## Critério de sucesso

- `git push origin main` sem erro.
- `https://nexus-stream-server.onrender.com/` retorna o `index.html` do Nexus.
- `.env` com `PUBLIC_URL=https://nexus-stream-server.onrender.com` (substitui o túnel).
- Activity Settings no Discord Developer Portal com:
  - Privacy Policy URL: `https://nexus-privacy.vercel.app`
  - Terms of Service URL: `https://terms-lyart-omega.vercel.app`
  - Target URL: `https://nexus-stream-server.onrender.com`
- Status da Activity: `Active`.