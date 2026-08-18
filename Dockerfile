FROM node:20-slim
WORKDIR /app
COPY . .
RUN npm install -g pnpm
RUN pnpm install --no-frozen-lockfile
RUN pnpm --filter @workspace/api-spec run codegen
RUN pnpm --filter @workspace/db run push
RUN pnpm build
EXPOSE 5000
CMD ["node", "artifacts/api-server/dist/index.mjs"]
