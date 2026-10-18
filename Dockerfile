FROM node:20-slim

# Install ffmpeg and essential tools for media/sticker processing
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
    ffmpeg \
    curl \
    git \
    ca-certificates && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json .npmrc ./
RUN npm install --omit=dev --no-audit --no-fund

COPY . .

ENV PORT=8080
EXPOSE 8080

CMD ["node", "--no-warnings", "--max-old-space-size=450", "index.js"]