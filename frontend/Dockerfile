# Brisca frontend — SvelteKit static build served by nginx, which also
# reverse-proxies Socket.io to the backend (single origin, no CORS).

# Build stage: compile the SvelteKit app to static assets.
FROM node:20-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

# Serve stage: unchanged nginx-unprivileged runtime with the /socket.io proxy.
FROM nginxinc/nginx-unprivileged

# Install the server config (static + /socket.io proxy). /etc/nginx is root-owned,
# so copy as root, then drop back to the unprivileged runtime user.
USER root
COPY nginx.conf /etc/nginx/conf.d/default.conf
USER nginx

# The prerendered site: index.html, hashed _app/ assets, and cards/.
COPY --from=build /app/build /usr/share/nginx/html

EXPOSE 8080
