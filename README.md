docker stop briscola && docker rm briscola && docker image rm briscola
docker build -t briscola . && sleep 1 && docker run -d --name briscola -p 8095:8080 briscola
