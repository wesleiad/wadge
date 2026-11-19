# WADGE

Navegador desktop leve para Windows 10/11 (Electron + TypeScript + Vite). Sem login: abre direto para uso.

## Recursos
- **Abas com economia de RAM**: `WebContentsView` por aba; abas inativas há 5 min (configurável) têm o WebContents destruído e continuam na barra (título, favicon, URL) até o clique. Botão 💤 suspende todas as inativas; a barra mostra a RAM aproximada do app.
- **AdBlock nativo** (`@ghostery/adblocker-electron`, camada de rede): botão 🛡 liga/pausa globalmente ou por site.
- **Importador de favoritos do Chrome**: lê `%LOCALAPPDATA%\Google\Chrome\User Data\` (Default, Profile N). Oferece na primeira abertura; também em Menu ⋮ → Importar favoritos.
- **Extensões do Chrome** (`electron-chrome-extensions`): pasta `extensions/` em `%APPDATA%\WADGE`; ícones e popups na barra. Menu ⋮ → Extensões para carregar pastas descompactadas.
- **Vault**: painel lateral retrátil que abre a URL do cofre (Vaultwarden/Bitwarden) definida em Configurações. Para a extensão do Bitwarden, carregue-a em Extensões.
- **Instalador NSIS** x64 via electron-builder.

## Desenvolvimento
```bash
npm install
npm run dev          # modo desenvolvimento
npm run typecheck
```

## Gerar o instalador (.exe)
```bash
npm run dist         # saída: release/WADGE-Setup-<versão>.exe
```
O ícone fica em `build/icon.ico` e `build/icon.png`.

## Atalhos
Ctrl+T nova aba · Ctrl+W fechar · Ctrl+L endereço · Ctrl+R/F5 recarregar · Ctrl+Tab alternar · Alt+←/→ · Ctrl+D favoritar · F12 DevTools

## Limitações conhecidas
- Instalação direta pela Chrome Web Store não é suportada (carregue a pasta descompactada); extensões MV3 têm suporte parcial.
- Com o AdBlock pausado em um site, filtros cosméticos (ocultar elementos) podem continuar ativos até recarregar.
- `electron-chrome-extensions` é GPL-3.0; o projeto usa a mesma licença.

## Atualização automática
O app instalado verifica o GitHub Releases ao abrir (e a cada 4 h), baixa a nova versão e pergunta se quer reiniciar.
Para publicar uma versão: aumente `version` no `package.json`, faça `$env:GH_TOKEN = (gh auth token)` e rode `npm run release`
(cria a Release com o instalador e o `latest.yml`). Requer repositório público.
