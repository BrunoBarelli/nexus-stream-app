# Guia Passo a Passo — Bot + Activity do Discord

## O que já está funcionando

- **Server**: rodando em `https://nexus-stream-server.onrender.com`
- **Páginas legais**: `/privacy` e `/terms` respondendo corretamente
- **App**: carregando, Socket.IO ok
- **Bot do Discord**: logado, comandos `/stream`, `/painel`, `/ajuda` registrados

## O que ainda falta (3 coisas)

1. Corrigir o app para não travar na tela de autenticação dentro da Activity
2. Configurar a Activity no Discord Developer Portal com as URLs corretas
3. Convidar o bot para um servidor

---

## PASSO 1 — Corrigir o app (bloqueado na Activity)

**Problema**: dentro da Activity do Discord, o `prompt()` (caixa de diálogo que pede um nome) é bloqueado. O site funciona sozinho porque o navegador permite `prompt()`, mas o Discord não.

**Solução**: trocar o `prompt()` por um campo de texto dentro do próprio modal (janela que já abre).

**O que fazer**:
1. Abra `public/app.js` no VS Code (ou Notepad)
2. Procure por `prompt(` — você verá uma linha com `const nick = prompt(...)`
3. Substitua essa linha por:
   `const nick = sanitizeText(el('guestNickInput')?.value, 24);`
4. Salve o arquivo

Depois de salvar, o server no Render atualiza automaticamente em até 1 minuto.

---

## PASSO 2 — Configurar a Activity no Discord

Acesse **https://discord.com/developers/applications** e clique na sua app (ID `1558918267190386799`).

### Aba "Activity" (ou "Activity Settings")

Preencha os campos:

| Campo | Valor |
|---|---|
| Activity Type | `Embedded Application` |
| Name | `Nexus Stream` |
| Description | `Compartilhe tela em tempo real com áudio isolado, até 4K 120 FPS` |
| Banner Image | 1024x1024 (opcional, pode deixar em branco) |
| **Target URL** | `https://nexus-stream-server.onrender.com` |
| **Target ID** | `1558918267190386799` |
| **Privacy Policy URL** | `https://nexus-stream-server.onrender.com/privacy` |
| **Terms of Service URL** | `https://nexus-stream-server.onrender.com/terms` |

Clique em **Save Changes**. O status deve virar **Active**.

### Aba "Bot"

- **Reset Token** (se quiser um novo): clique, copie e guarde em um lugar seguro
- **Privileged Gateway Intents**: ative **Guild Voice States**
- Gere/cole o token no `.env` da sua máquina local

### Aba "OAuth2 → URL Generator"

- **Scopes**: marque `bot` e `applications.commands`
- **Bot Permissions**: marque `CREATE_INSTANT_INVITE`
- Copie a URL gerada

---

## PASSO 3 — Convidar o bot para um servidor

1. Abra a URL do OAuth2 que você copiou no Passo 2
2. Escolha um servidor onde você é dono ou tem permissão
3. Clique em **Continue** / **Autorizar**
4. O bot aparecerá na lista de integrantes do servidor

---

## PASSO 4 — Testar

1. Entre em um **canal de voz** daquele servidor
2. No chat, digite `/stream`
3. O bot responde com um embed e um botão **"Assistir no Canal de Voz"**
4. Clique no botão — a Activity abre
5. Clique em **"Continuar sem conta (Modo Convidado)"**
6. Clique em **"Entrar na Sala"** (ou deixe em branco e clique em "Auto")
7. Agora clique em **"Transmitir"** e escolha uma tela/janela

---

## Se ainda não funcionar

- Verifique se o status da Activity no portal é **Active** (não "In Development")
- Se for "In Development", adicione-se como **Team Member** em Settings → Team, ou mude para "Published"
- Limpe o cache do Discord (Configurações → Aplicativos e atividades → Remover a Activity e adicionar novamente)