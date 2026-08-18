FROM node:22-slim

WORKDIR /app

# pnpm v9으로 버전 고정
RUN npm install -g pnpm@9.15.4

ENV PNPM_HOME="/root/.local/share/pnpm"
ENV PATH="${PATH}:${PNPM_HOME}"
ENV COREPACK_ENABLE_STRICT=0
ENV PNPM_ALLOW_BUILD="*"

COPY . .

# 줄바꿈(\n)을 강제 보장하여 YAML 파싱 에러 완벽 방지
RUN printf "\nonlyBuiltDependencies:\n  - esbuild\n  - '@esbuild-kit/esm-loader'\n" >> pnpm-workspace.yaml

# 의존성 설치 및 빌드
RUN pnpm install --no-frozen-lockfile
RUN pnpm --filter @workspace/api-spec run codegen
RUN pnpm --filter @workspace/db run push
RUN pnpm build

EXPOSE 5000

CMD ["node", "artifacts/api-server/dist/index.mjs"]
