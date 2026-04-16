FROM node:20-bookworm-slim

WORKDIR /app
ENV NODE_ENV=production
ENV DATA_DIR=/data
ENV DB_PATH=/data/zan.sqlite
ENV IMAGE_CACHE_DIR=/data/image-cache-v5
ENV PORT=3000

COPY package*.json ./
RUN npm ci --omit=dev

COPY public ./public
COPY src ./src
COPY README.md ./README.md

RUN mkdir -p /data /app/data

EXPOSE 3000
CMD ["node", "src/app.js"]
