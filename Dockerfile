# MetaMesh Plugin: file-info
# Extracts basic file information (type, MIME, size)

FROM node:20-slim AS builder

WORKDIR /app

COPY package.json tsconfig.json ./
RUN npm install

COPY src/ ./src/
RUN npm run build

# Production
FROM node:20-slim

WORKDIR /app

COPY package.json ./
RUN npm install --omit=dev

COPY --from=builder /app/dist ./dist

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:8080/health', (r) => process.exit(r.statusCode === 200 ? 0 : 1))"

CMD ["node", "dist/index.js"]
