# YtoWave — Documentação Técnica v1.0

> **Checkpoint de desenvolvimento** — Estado funcional do projeto após implementação inicial, correção de bugs e adição de suporte a playlists.

---

## Visão Geral

YtoWave é um aplicativo desktop gerenciador de downloads de música em **alta qualidade WAV**. Ele não faz scraping da web diretamente — funciona como uma GUI robusta que orquestra dois binários externos: **yt-dlp** (extração e metadados) e **FFmpeg** (transcodificação de áudio para PCM WAV).

### Stack

| Camada | Tecnologia |
|---|---|
| Container Desktop | Electron 31 |
| Frontend | React 18 + Vite 5 |
| Estilização | TailwindCSS 3 |
| Estado Global | Zustand 4 |
| Extração de Áudio | yt-dlp (binário externo) |
| Conversão | FFmpeg (binário externo) |
| Comunicação | Electron IPC (contextBridge) |

---

## Estrutura de Pastas

```
ytowave/
│
├── bin/                          # Binários externos (não versionados)
│   ├── yt-dlp.exe                # 17.4 MB — extrator universal de mídia
│   └── ffmpeg.exe                # 97.2 MB — conversor/transcodificador de áudio
│
├── scripts/
│   ├── download-binaries.js      # Postinstall: baixa yt-dlp e FFmpeg automaticamente
│   └── get-ffmpeg.ps1            # Fallback PowerShell para FFmpeg no Windows
│
├── electron/                     # PROCESSO PRINCIPAL (Node.js nativo)
│   ├── main.js                   # Entry point — cria BrowserWindow, lifecycle
│   ├── preload.js                # Bridge de segurança (contextBridge API)
│   └── services/
│       ├── binary-resolver.js    # Resolve paths dos binários (dev vs prod)
│       ├── ipc-handlers.js       # Registra todos os canais IPC
│       ├── metadata-service.js   # Executa yt-dlp --dump-json / --flat-playlist
│       └── download-service.js   # Orquestra spawn, parsing de progresso, fila
│
├── src/                          # PROCESSO RENDERER (React — sem acesso Node)
│   ├── index.html
│   ├── main.jsx                  # Entry point React
│   ├── index.css                 # Tailwind + componentes globais
│   ├── App.jsx                   # Shell: header, settings panel, layout
│   │
│   ├── store/
│   │   └── downloadStore.js      # Zustand — única fonte de verdade da fila
│   │
│   ├── hooks/
│   │   └── useDownloadEvents.js  # Escuta IPC 'download:progress' → atualiza store
│   │
│   ├── services/
│   │   └── electronApi.js        # Wrapper de window.electronAPI com fallback
│   │
│   └── components/
│       ├── UrlInput/
│       │   ├── UrlInput.jsx          # Input + detecção playlist/single
│       │   ├── MetadataPreview.jsx   # Preview de faixa única
│       │   └── PlaylistPreview.jsx   # Preview de playlist com checkboxes
│       ├── DownloadQueue/
│       │   ├── QueuePanel.jsx        # Lista scrollável + ações de limpeza
│       │   └── QueueItem.jsx         # Card individual com progresso e ações
│       └── common/
│           ├── ProgressBar.jsx       # Barra animada com glow por status
│           ├── StatusBadge.jsx       # Badge colorido por fase
│           └── Toast.jsx             # Sistema de notificações (sem biblioteca)
│
├── package.json
├── vite.config.js
├── tailwind.config.js
├── postcss.config.js             # CJS (não ESM) — compatível com Electron
└── electron-builder.yml          # Config de empacotamento para produção
```

---

## Arquitetura e Fluxo de Dados

### O Modelo de Processos do Electron

O app roda em **dois processos completamente isolados**:

```
┌─────────────────────────────────────────────────────────┐
│  MAIN PROCESS  (Node.js — acesso total ao sistema)      │
│                                                          │
│  main.js → ipc-handlers.js                              │
│              ├── metadata-service.js  → yt-dlp spawn    │
│              ├── download-service.js  → yt-dlp spawn    │
│              └── binary-resolver.js                      │
└──────────────────────┬──────────────────────────────────┘
                       │  IPC (contextBridge)
                       │  preload.js (mediador)
┌──────────────────────┴──────────────────────────────────┐
│  RENDERER PROCESS  (React — ZERO acesso Node.js)        │
│                                                          │
│  App.jsx                                                 │
│  ├── store/downloadStore.js  (Zustand)                   │
│  ├── hooks/useDownloadEvents.js  (escuta IPC)            │
│  └── components/  (UrlInput, QueuePanel, etc.)           │
└─────────────────────────────────────────────────────────┘
```

> **Regra de ouro de segurança**: o renderer NUNCA toca em `require()`, `fs`, `child_process` ou qualquer API Node. Toda comunicação passa pela API tipada do `preload.js`.

---

### Mapa de Canais IPC

| Canal | Tipo | Direção | Descrição |
|---|---|---|---|
| `metadata:fetch` | `invoke` | renderer → main | Busca metadados de faixa única via `--dump-json` |
| `metadata:fetchPlaylist` | `invoke` | renderer → main | Busca faixas de playlist via `--flat-playlist` |
| `download:start` | `invoke` | renderer → main | Inicia download + conversão WAV |
| `download:cancel` | `send` | renderer → main | Mata o processo yt-dlp pelo ID |
| `download:progress` | `send` | main → renderer | Eventos de progresso em tempo real |
| `dialog:chooseDir` | `invoke` | renderer → main | Abre picker de pasta nativo |
| `shell:openOutputDir` | `invoke` | renderer → main | Abre pasta no Explorer/Finder |
| `binary:check` | `invoke` | renderer → main | Verifica existência dos binários |
| `app:getDefaultOutputDir` | `invoke` | renderer → main | Retorna `~/Music/YtoWave` |

---

## Pipeline de Áudio

### Fase 1 — Análise (sem download)

```
URL colada pelo usuário
    │
    ├─ isPlaylistUrl(url)?  ← detecta ?list= em qualquer URL YouTube
    │       ├─ SIM → yt-dlp --dump-json --flat-playlist [URL]
    │       │           → JSON por linha (uma por faixa)
    │       │           → PlaylistPreview com checkboxes
    │       │
    │       └─ NÃO → yt-dlp --dump-json --no-playlist [URL]
    │                   → JSON único
    │                   → MetadataPreview (thumbnail + título + duração)
    │
    └─ Usuário confirma → addToQueue() → startDownload()
```

### Fase 2 — Download e Conversão

```bash
yt-dlp \
  --no-playlist \
  --extract-audio \
  --audio-format wav \        # instrui FFmpeg a converter para PCM WAV
  --audio-quality 0 \         # melhor qualidade da fonte (opus/aac)
  --add-metadata \             # escreve tags ID3 (título, artista, álbum)
  --no-overwrites \            # SKIP imediato se .wav já existe no destino
  --ffmpeg-location [/bin] \  # aponta para ffmpeg local
  --output "%(title)s.%(ext)s" \
  --newline --progress \       # uma linha de progresso por stdout flush
  [URL]
```

### Ciclo de Vida de um Item

```
pending
  └─► downloading (0–100%)
        └─► converting (FFmpeg transcoding)
              └─► embedding (tags ID3)
                    └─► done ✓
                    └─► skipped (arquivo já existe)
                    └─► error ✗
                    └─► cancelled
```

### Parsing de Progresso em Tempo Real

O `download-service.js` lê **stdout linha a linha** via regex:

```
"[download]  47.3% of 5.32MiB at 1.23MiB/s ETA 00:02"
→ { status: 'downloading', progress: 47.3, speed: '1.23MiB/s', eta: '00:02' }

"[ExtractAudio] Destination: arquivo.wav"
→ { status: 'converting', progress: 99 }

"[Metadata] Adding metadata..."
→ { status: 'embedding', progress: 99 }
```

Cada evento é emitido via `sender.send('download:progress', { id, ...payload })` para o renderer.

---

## Gotchas e Decisões de Arquitetura

### 1. Exit Code 1 ≠ Erro no yt-dlp

yt-dlp sai com código `1` quando emite `WARNING` no stderr (ex: "No JS runtime found"), mesmo tendo completado com 100% de sucesso. A solução é detectar conclusão por **marcadores no stdout**, não pelo exit code:

```javascript
const completedOk =
  fullStdout.includes('[Metadata]')     ||
  fullStdout.includes('[ExtractAudio]') ||
  (fullStdout.includes('[download] 100%') && code <= 1);
```

### 2. WAV não suporta artwork embutida

`--embed-thumbnail` causa falha silenciosa quando o formato de saída é WAV (container PCM não tem campo para imagem). A flag foi removida. Thumbnail é exibida na UI via URL da plataforma.

### 3. Detecção de Playlist com `?v=&list=`

URLs do tipo `?v=XKbbd7...&list=PLGp...` têm `v=` E `list=`. A lógica `if (list && !v)` as tratava incorretamente como faixa única. Corrigido: qualquer URL com `list=` é uma playlist.

```javascript
// ANTES (errado):
if (list && !v) return true;

// DEPOIS (correto):
if (u.searchParams.has('list')) return true;
```

### 4. CJS vs ESM no mesmo projeto

Electron usa CJS (`require()`), Vite usa ESM. Colocar `"type": "module"` quebra o Electron. Solução: projeto em CJS + `postcss.config.js` com `module.exports` em vez de `export default`.

### 5. Download de Binários no Windows

`https.get()` do Node falha em seguir múltiplos redirects do GitHub (CDN com 302). Arquivo chegava com 0 bytes. Solução: `curl` como downloader primário (Windows 10+ nativo) + fallback `Invoke-WebRequest` via `.ps1`.

### 6. FFmpeg: BtbN vs Gyan.dev

ZIP do BtbN (~162MB) teve conexão resetada aos 96%. Solução: **gyan.dev essentials** (~71MB ZIP, ~97MB extraído). Contém apenas `ffmpeg.exe` — suficiente para todo o pipeline do app.

---

## Estado Global — Zustand Store

```javascript
// Estrutura de cada item na queue:
{
  id:          'dl-1720476234-1',   // gerado localmente (timestamp + seq)
  url:         'https://...',
  title:       'Nome da Música',
  uploader:    'Nome do Artista',
  artist:      'Nome do Artista',
  album:       null,
  thumbnail:   'https://i.ytimg.com/vi/.../hqdefault.jpg',
  duration:    214,                 // segundos
  status:      'done',              // ver ciclo de vida acima
  progress:    100,                 // 0-100
  speed:       '3.48MiB/s',
  eta:         '00:00',
  error:       null,
  addedAt:     Date,
}

// Configurações globais:
outputDir:    null,   // null → ~/Music/YtoWave
audioBitDepth: 24,    // 16 ou 24 bit
binariesOk:   { 'yt-dlp': { ok: true }, 'ffmpeg': { ok: true } }
```

---

## Sistema de Design

Baseado em **glassmorphism dark**. Tokens definidos em `tailwind.config.js`:

| Token | Valor | Uso |
|---|---|---|
| `surface` | `#0f0f13` | Fundo base da janela |
| `surface-2` | `#1d1d27` | Cards glass |
| `surface-3` | `#252533` | Inputs, botões secundários |
| `brand-500` | `#6366f1` | Indigo — cor principal |
| `accent` | `#a78bfa` | Violeta — gradientes |

**Classes customizadas em `index.css`:**

| Classe | Descrição |
|---|---|
| `.glass` | Card com backdrop-blur, border sutil, shadow |
| `.glass-hover` | `.glass` + hover com borda brand e glow |
| `.btn-primary` | Gradiente brand→accent, scale hover, glow shadow |
| `.btn-secondary` | Superfície dark, border hover |
| `.input-field` | Input escuro, focus ring brand |
| `.gradient-text` | Texto com gradiente brand→accent |
| `.shimmer` | Animação de loading skeleton |
| `.drag-area` / `.no-drag` | Controle de arrastar janela no Electron |

---

## Como Rodar e Buildar

```bash
# Desenvolvimento
npm install          # instala deps + baixa binários (postinstall)
npm run dev          # Vite (porta 5173) + Electron em paralelo

# Produção
npm run build        # build Vite → /dist, electron-builder → /dist-electron

# Re-download de binários (se corrompidos)
Remove-Item bin\*.exe
node scripts/download-binaries.js
# ou:
powershell -ExecutionPolicy Bypass -File scripts/get-ffmpeg.ps1
```

---

## Roadmap — Próximas Evoluções

### 🟢 Baixa Complexidade

| # | Feature | Onde implementar |
|---|---|---|
| 1 | **Persistência de configurações** (outputDir, bitDepth não resetam) | Criar `electron/services/settings-service.js` com `fs` em `app.getPath('userData')` |
| 2 | **Notificação nativa** ao concluir download | `new Notification()` no main process após status `done` |
| 3 | **Atualização automática do yt-dlp** | `yt-dlp --version` + GitHub API `releases/latest`; criar `updater-service.js` |
| 4 | **Controle de concorrência configurável** (1–5 downloads simultâneos) | Mover `CONCURRENCY = 3` de `PlaylistPreview.jsx` para o store |
| 5 | **Drag & Drop de URL** | Listener `drop` na área do input; passar URL para `handleFetch()` |

### 🟡 Média Complexidade

| # | Feature | Onde implementar |
|---|---|---|
| 6 | **Múltiplos formatos** (FLAC, MP3, AAC além de WAV) | Seletor no settings; `--audio-format flac/mp3/aac` no `download-service.js` |
| 7 | **Thumbnail como arquivo separado** `.jpg` | `--write-thumbnail --convert-thumbnails jpg` (WAV não suporta embutida) |
| 8 | **Histórico de downloads** persistente | Append em `history.json`; nova aba na UI |
| 9 | **Autenticação para conteúdo restrito** | `--cookies-from-browser chrome`; UI para escolher browser |
| 10 | **Paginação de playlists longas** | Carregar primeiros 50 itens, lazy-load no scroll |

### 🔴 Alta Complexidade

| # | Feature | Considerações |
|---|---|---|
| 11 | **Integração Spotify** via spotDL | Terceiro binário `/bin/spotdl`; detectar `open.spotify.com` |
| 12 | **Editor de metadados** pré-download | Novo componente `MetadataEditor.jsx`; flags `--parse-metadata` |
| 13 | **Monitoramento de clipboard** | Polling `clipboard.readText()` no main process; requer opt-in do usuário |
| 14 | **Build e CI/CD automatizado** | GitHub Actions + code signing (obrigatório para distribuição sem alertas) |

---

## Bugs Conhecidos

| # | Descrição | Workaround | Prioridade |
|---|---|---|---|
| 1 | Artwork **não** embutida no WAV | Thumbnail exibida na UI | Baixa (salvar `.jpg` separado como feature) |
| 2 | Configurações **não persistem** ao fechar | Reconfigurar manualmente | Alta |
| 3 | Playlists muito longas (+200 faixas) carregam todas antes de exibir | `--flat-playlist` não tem paginação | Média |
| 4 | Ícone `.png` não existe para build de produção | Criar `public/icon.png` antes de buildar | Alta para distribuição |
| 5 | YouTube Music playlists não detectadas automaticamente | Usar URL do YouTube padrão | Baixa |

---

*YtoWave v1.0 — Checkpoint 09/07/2026*
