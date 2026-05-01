# AGENTS.md

## Projeto

Este repositório implementa um builder próprio de APK/AAB Android, self-hosted, inspirado em GitHub Actions e Expo EAS Build.

O sistema tem:

- API HTTP em Fastify
- Worker em BullMQ
- Redis para fila
- SQLite/Prisma para persistência
- Docker CLI para executar builds Android isolados
- Storage local em `./data/uploads`, `./data/workspaces` e `./data/artifacts`

## Arquitetura

- `apps/api`: expõe endpoints HTTP, upload ZIP, criação/cancelamento de builds, consulta de status, logs, SSE e download de artefatos.
- `apps/worker`: consome jobs BullMQ, prepara workspace, obtém código Git/ZIP, resolve buildspec, executa Docker e salva artefatos.
- `packages/shared`: tipos, constantes, validação de buildspec, geração de defaults, redaction, descoberta de artefatos e regras de status.
- `prisma`: schema SQLite e migração inicial.
- `docker/android-builder`: imagem Android local `apk-builder-android:latest`.

## Comandos

Instalar dependências:

```bash
pnpm install
```

Se `pnpm` não estiver habilitado, use Corepack:

```bash
corepack prepare pnpm@9.12.3 --activate
```

Subir Redis:

```bash
docker compose up -d redis
```

Configurar ambiente:

```bash
cp .env.example .env
```

Gerar Prisma e aplicar migrações:

```bash
pnpm prisma generate
pnpm prisma migrate deploy
```

Em desenvolvimento, também pode usar:

```bash
pnpm prisma migrate dev
```

Rodar API:

```bash
pnpm --filter api dev
```

Rodar worker:

```bash
pnpm --filter worker dev
```

Buildar imagem Android:

```bash
bash scripts/build-android-image.sh
```

Rodar testes:

```bash
pnpm test
```

Lint:

```bash
pnpm lint
```

Build TypeScript:

```bash
pnpm build
```

## Convenções

- Usar TypeScript estrito.
- Validar entradas HTTP com Zod.
- Persistir estado com Prisma.
- Manter lógica compartilhada em `packages/shared`.
- Não vazar secrets em logs.
- Não usar `--privileged` em Docker.
- Não montar `/var/run/docker.sock` dentro dos containers de build.
- Não adicionar serviços pagos como dependência do funcionamento.
- Toda mudança relevante deve atualizar o README.

## Como Rodar API E Worker

1. Suba o Redis com `docker compose up -d redis`.
2. Gere o client Prisma e aplique migrações.
3. Construa a imagem Android com `bash scripts/build-android-image.sh`.
4. Rode a API e o worker em terminais separados.

O worker precisa acessar o Docker CLI do host. O container de build recebe apenas o workspace montado em `/workspace`.

## Modo Windows Local Sem Docker

Este repositório também tem um fallback para ambiente Windows sem Docker/WSL2:

- `QUEUE_MODE=sqlite`: a API cria builds no SQLite e o worker busca `queued` por polling.
- `RUNNER_MODE=local`: o worker executa os steps no host, não em container.
- `scripts/setup-windows-local.ps1`: baixa JDK 17 e Android SDK em `data/toolchains/windows`.
- `scripts/dev-local-windows.ps1`: sobe API e worker em background.

Esse modo existe para desenvolvimento local e não deve ser usado com código não confiável.

## Segurança

Este MVP deve ser tratado como ferramenta privada/local. Builds executam código arbitrário do projeto enviado.

Cuidados implementados:

- Runner Docker sem `--privileged`.
- Sem montagem de `docker.sock` nos containers de build.
- Montagem apenas do workspace do build.
- Limites padrão de CPU e memória.
- Timeout por buildspec.
- Redaction de envs com nomes contendo `SECRET`, `TOKEN`, `PASSWORD`, `KEY`, `KEYSTORE` ou `CREDENTIAL`.

Para uso multiusuário ou público, será necessário isolamento mais forte, autenticação, quotas, rede controlada e possivelmente VMs descartáveis.
