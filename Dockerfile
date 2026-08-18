FROM node:22-slim

WORKDIR /app

ENV PNPM_HOME="/root/.local/share/pnpm"
ENV PATH="${PATH}:${PNPM_HOME}"

RUN npm install -g pnpm@latest

COPY . .

# 기존 onlyBuiltDependencies 아래에 esbuild 항목만 깔끔하게 주입 (키 중복 방지)
RUN if grep -q "onlyBuiltDependencies:" pnpm-workspace.yaml; then \
      sed -i '/onlyBuiltDependencies:/a \  - esbuild' pnpm-workspace.yaml; \
    else \
      echo "\nonlyBuiltDependencies:\n  - esbuild" >> pnpm-workspace.yaml; \
    fi

# 의존성 설치 및 빌드 진행
RUN pnpm install --no-frozen-lockfile
RUN pnpm --filter @workspace/api-spec run codegen
RUN pnpm --filter @workspace/db run push
RUN pnpm build

EXPOSE 5000

CMD ["node", "artifacts/api-server/dist/index.mjs"]
