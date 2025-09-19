# Multi-stage Dockerfile for PolicyIQ backend

FROM node:20-bullseye AS base
ENV PUPPETEER_SKIP_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

RUN apt-get update && apt-get install -y \
    chromium \
    chromium-sandbox \
    python3 \
    python3-pip \
    libx11-6 libx11-xcb1 libxcomposite1 libxcursor1 libxdamage1 libxi6 libxtst6 libnss3 libxss1 libglib2.0-0 libatk1.0-0 libatk-bridge2.0-0 libdrm2 \
    libgbm1 libgtk-3-0 libasound2 fonts-liberation libappindicator3-1 lsb-release xdg-utils wget \
    && rm -rf /var/lib/apt/lists/*

RUN pip3 install python-docx

WORKDIR /app
COPY package*.json ./
COPY tsconfig.json ./
COPY vite.config.ts ./
COPY server ./server
COPY client ./client
COPY shared ./shared
COPY types ./types

RUN npm ci
RUN npm run build

FROM base AS runtime
ENV NODE_ENV=production \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

WORKDIR /app
COPY --from=base /app /app

EXPOSE 5000
CMD ["node", "dist/index.js"]


