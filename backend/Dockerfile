# Brisca backend — Node.js Socket.io game server
FROM node:20-alpine

WORKDIR /app

# Install production dependencies first for better layer caching.
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# Application source (game engine, AI, server).
COPY . .

ENV NODE_ENV=production
EXPOSE 3000

CMD ["node", "server.js"]
