FROM nginxinc/nginx-unprivileged
WORKDIR /usr/share/nginx/html/

COPY . .

USER nginx

EXPOSE 8080
