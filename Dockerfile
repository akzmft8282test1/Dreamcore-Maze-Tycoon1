FROM node:22-slim

WORKDIR /app

ENV PNPM_HOME="/root/.local/share/pnpm"
ENV PATH="${PATH}:${PNPM_HOME}"

RUN npm install -g pnpm@latest

COPY . .

# pnpm-workspace.yaml 파일에 esbuild 빌드 허용 구문 직접 추가
RUN echo "\nonlyBuiltDependencies:\n  - esbuild" >> pnpm-workspace.yaml

# 의존성 설치 및 빌드
RUN pnpm install --no-frozen-lockfile
RUN pnpm --filter @workspace/api-spec run codegen
RUN pnpm --filter @workspace/db run push
RUN pnpm build

EXPOSE 5000

CMD ["node", "artifacts/api-server/dist/index.mjs"]
