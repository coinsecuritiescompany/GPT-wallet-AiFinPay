FROM node:24-alpine AS build
WORKDIR /app
COPY package*.json ./
COPY apps/mcp-server/package.json apps/mcp-server/package.json
COPY apps/wallet-widget/package.json apps/wallet-widget/package.json
COPY packages/shared/package.json packages/shared/package.json
COPY packages/aifinpay-adapter/package.json packages/aifinpay-adapter/package.json
COPY packages/demo-ledger/package.json packages/demo-ledger/package.json
RUN npm ci
COPY . .
RUN npm run build

FROM node:24-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production PORT=8787 AIFINPAY_DEMO_MODE=true DATABASE_URL=/app/data/aifinpay-demo.sqlite
COPY --from=build /app/package*.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/apps ./apps
COPY --from=build /app/packages ./packages
RUN mkdir -p /app/data && chown -R node:node /app
USER node
EXPOSE 8787
HEALTHCHECK --interval=30s --timeout=3s --retries=3 CMD wget -qO- http://127.0.0.1:8787/health || exit 1
CMD ["node", "apps/mcp-server/dist/index.js"]

