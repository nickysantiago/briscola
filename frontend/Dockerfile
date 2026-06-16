# Brisca frontend — nginx serving the static site + a Socket.io reverse proxy.
FROM nginxinc/nginx-unprivileged

# Install the server config (static + /socket.io proxy). /etc/nginx is root-owned,
# so copy as root, then drop back to the unprivileged runtime user.
USER root
COPY nginx.conf /etc/nginx/conf.d/default.conf
USER nginx

# Static site assets, served from the default web root.
COPY index.html /usr/share/nginx/html/
COPY style.css /usr/share/nginx/html/
COPY css/ /usr/share/nginx/html/css/
COPY js/ /usr/share/nginx/html/js/
COPY cards/ /usr/share/nginx/html/cards/

EXPOSE 8080
