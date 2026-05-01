# APK Builder

MVP local/self-hosted de builder Android para APK/AAB. Ele recebe um repositório Git ou ZIP, coloca o build em uma fila BullMQ, executa steps em um container Docker Android isolado, persiste logs em tempo real e salva artefatos em storage local.

## Arquitetura

- `apps/api`: Fastify HTTP API, upload ZIP, criação e cancelamento de builds, status, logs, SSE, artefatos e UI mínima em `GET /`.
- `apps/worker`: BullMQ worker que prepara workspace, clona/extrai código, resolve buildspec, executa Docker e coleta APK/AAB.
- `packages/shared`: tipos, estados, parser/validação de buildspec, defaults, redaction de secrets e glob de artefatos.
- `prisma`: SQLite com modelos `Build`, `BuildLog` e `Artifact`.
- `docker/android-builder`: imagem Docker local com OpenJDK 17, Android SDK 35, Node.js 20, pnpm, git, unzip e Gradle.
- `data/uploads`, `data/workspaces`, `data/artifacts`: storage local do MVP.

## Requisitos

- Node.js 20+
- pnpm 9+
- Docker e Docker Compose
- Git instalado no host
- Redis, via `docker compose up -d redis`

Se `pnpm` não estiver habilitado:

```bash
corepack prepare pnpm@9.12.3 --activate
```

## Instalação

```bash
pnpm install
cp .env.example .env
pnpm prisma generate
pnpm prisma migrate deploy
```

Para desenvolvimento local com migrações editáveis:

```bash
pnpm prisma migrate dev
```

## Redis, API E Worker

Suba o Redis:

```bash
docker compose up -d redis
```

Construa a imagem Android local:

```bash
bash scripts/build-android-image.sh
```

Rode a API:

```bash
pnpm --filter api dev
```

Rode o worker em outro terminal:

```bash
pnpm --filter worker dev
```

A API escuta por padrão em `http://localhost:3000`. A página mínima está disponível em `GET /`.

Também existe um script conveniente:

```bash
bash scripts/dev.sh
```

## Modo Local No Windows Sem Docker

Se o PC não tiver Docker Desktop/WSL2 disponível, use o modo local. Ele mantém o modo Docker como padrão do projeto, mas permite testar neste Windows usando SQLite como fila e executando os steps diretamente no host.

Esse modo é menos isolado: o código do app enviado roda no seu Windows. Use apenas com projetos seus.

Instale pnpm no usuário:

```powershell
npm install -g pnpm@9.12.3
```

Baixe JDK 17 e Android SDK localmente:

```powershell
powershell -ExecutionPolicy Bypass -File scripts\setup-windows-local.ps1
```

O script cria `data/toolchains/windows`, instala:

- Temurin JDK 17
- Android command line tools
- `platform-tools`
- `platforms;android-35`
- `build-tools;35.0.0`

Ele também atualiza `.env`:

```env
QUEUE_MODE="sqlite"
RUNNER_MODE="local"
LOCAL_JAVA_HOME="data/toolchains/windows/jdk"
LOCAL_ANDROID_HOME="data/toolchains/windows/android-sdk"
LOCAL_BASH_PATH="C:/Program Files/Git/bin/bash.exe"
```

Inicialize o banco sem depender do schema engine do Prisma:

```powershell
pnpm db:init
```

Suba API e worker:

```powershell
powershell -ExecutionPolicy Bypass -File scripts\dev-local-windows.ps1
```

Acesse:

```text
http://localhost:3000
```

Para parar, use os PIDs impressos pelo script:

```powershell
Stop-Process -Id API_PID,WORKER_PID
```

## Docker Android Builder

A imagem gerada se chama:

```bash
apk-builder-android:latest
```

O runner usa:

- `docker run --rm`
- sem `--privileged`
- sem `docker.sock`
- montagem apenas do workspace em `/workspace`
- limite padrão `--memory 4g`
- limite padrão `--cpus 2`

Esses limites podem ser ajustados no `.env`:

```bash
BUILD_MEMORY="4g"
BUILD_CPUS="2"
DOCKER_IMAGE="apk-builder-android:latest"
```

## Buildspec

Formato YAML:

```yaml
name: android-debug
timeoutMinutes: 30
network: true
environment:
  JAVA_HOME: /usr/lib/jvm/java-17-openjdk-amd64
steps:
  - name: Install dependencies
    run: npm ci
  - name: Build APK
    run: ./gradlew clean assembleDebug
artifacts:
  - app/build/outputs/apk/debug/*.apk
```

Campos:

- `name`: string obrigatória
- `timeoutMinutes`: número, default `30`, máximo `120`
- `network`: boolean, default `true`
- `environment`: mapa string-string
- `steps`: lista de `{ name?: string, run: string }`
- `artifacts`: lista de globs

Se não houver buildspec inline nem `buildspec.yml`/`buildspec.yaml` no repositório, o worker gera defaults para `android-native` ou `expo`, nos perfis `debug`, `release` ou `custom`.

Exemplos estão em:

- `examples/buildspec.android.yml`
- `examples/buildspec.expo.yml`

## Exemplos Curl

Criar build Android nativo debug via Git:

```bash
curl -X POST http://localhost:3000/builds \
  -H "Content-Type: application/json" \
  -d '{
    "source": {
      "type": "git",
      "repoUrl": "https://github.com/user/app.git",
      "branch": "main"
    },
    "projectType": "android-native",
    "profile": "debug",
    "env": {
      "EXAMPLE": "value"
    }
  }'
```

Criar build Expo debug:

```bash
curl -X POST http://localhost:3000/builds \
  -H "Content-Type: application/json" \
  -d '{
    "source": {
      "type": "git",
      "repoUrl": "https://github.com/user/expo-app.git",
      "branch": "main"
    },
    "projectType": "expo",
    "profile": "debug"
  }'
```

Upload ZIP:

```bash
curl -X POST http://localhost:3000/uploads \
  -F "file=@app.zip"
```

Criar build a partir de ZIP:

```bash
curl -X POST http://localhost:3000/builds \
  -H "Content-Type: application/json" \
  -d '{
    "source": {
      "type": "zip",
      "uploadId": "UPLOAD_ID"
    },
    "projectType": "android-native",
    "profile": "debug"
  }'
```

Consultar status:

```bash
curl http://localhost:3000/builds/BUILD_ID
```

Listar builds:

```bash
curl "http://localhost:3000/builds?page=1&limit=20"
```

Ver logs completos:

```bash
curl http://localhost:3000/builds/BUILD_ID/logs
```

Acompanhar logs em tempo real via SSE:

```bash
curl -N http://localhost:3000/builds/BUILD_ID/logs/stream
```

Listar artefatos:

```bash
curl http://localhost:3000/builds/BUILD_ID/artifacts
```

Baixar artefato:

```bash
curl -L -o app.apk \
  http://localhost:3000/builds/BUILD_ID/artifacts/ARTIFACT_ID/download
```

Cancelar build:

```bash
curl -X POST http://localhost:3000/builds/BUILD_ID/cancel
```

## Assinatura De Release

O MVP não integra Play Store. Para builds release assinados, configure seu Gradle para ler variáveis de ambiente:

- `ANDROID_KEYSTORE_BASE64`
- `ANDROID_KEYSTORE_PASSWORD`
- `ANDROID_KEY_ALIAS`
- `ANDROID_KEY_PASSWORD`

Exemplo de estratégia no projeto Android:

1. O buildspec decodifica `ANDROID_KEYSTORE_BASE64` para um arquivo temporário dentro do workspace.
2. O `build.gradle` lê `System.getenv("ANDROID_KEYSTORE_PASSWORD")`, `System.getenv("ANDROID_KEY_ALIAS")` e `System.getenv("ANDROID_KEY_PASSWORD")`.
3. O arquivo temporário fica apenas no workspace do build.

O runner mascara logs de variáveis cujo nome contenha `SECRET`, `TOKEN`, `PASSWORD`, `KEY`, `KEYSTORE` ou `CREDENTIAL`.

## API

Endpoints implementados:

- `POST /uploads`
- `POST /builds`
- `GET /builds`
- `GET /builds/:id`
- `GET /builds/:id/logs`
- `GET /builds/:id/logs/stream`
- `GET /builds/:id/artifacts`
- `GET /builds/:id/artifacts/:artifactId/download`
- `POST /builds/:id/cancel`
- `GET /`

Estados persistidos:

- `queued`
- `running`
- `success`
- `failed`
- `canceled`
- `timed_out`

## Segurança E Riscos

Este MVP executa código arbitrário enviado por Git/ZIP. Rode apenas em ambiente privado/local.

O isolamento atual é Docker básico. Ele reduz o blast radius, mas não equivale a sandbox forte para multiusuário hostil. Antes de expor publicamente, adicione autenticação, autorização, quotas, isolamento de rede, limpeza agressiva de workspaces, auditoria e runners descartáveis em VM/Kubernetes/Firecracker.

## Limitações Do MVP

- Sem autenticação.
- Sem multiusuário.
- Sem cache Gradle/npm.
- Sem webhooks GitHub/GitLab.
- Sem runners distribuídos.
- Sem integração Firebase App Distribution ou Play Console.
- Cancelamento de build em execução depende de `docker stop` no container nomeado.
- Logs SSE usam polling do SQLite para simplicidade.

## Qualidade

```bash
pnpm lint
pnpm test
pnpm build
pnpm format
```

Testes unitários cobrem:

- validação de buildspec
- geração de buildspec default
- redaction de secrets
- detecção de artefatos por glob
- transições de status permitidas

## Roadmap

- Autenticação.
- Multiusuário.
- Isolamento com VM, Firecracker ou Kubernetes.
- Cache Gradle/npm.
- Webhooks GitHub/GitLab.
- Upload Firebase App Distribution.
- Integração Play Console.
- Runners distribuídos.
