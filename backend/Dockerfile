# Brisca backend — Node.js Socket.io game server
FROM node:lts-slim

WORKDIR /app

# Install production dependencies first for better layer caching.
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# Application source (game engine, AI, server).
COPY . .

# Commit this image was built from, reported by /api/status so post-deploy tests
# can tell which build is live. Declared after the npm ci layer to keep it cached.
ARG GIT_COMMIT=unknown
ENV GIT_COMMIT=$GIT_COMMIT

ENV NODE_ENV=production
EXPOSE 3000

CMD ["node", "server.js"]
