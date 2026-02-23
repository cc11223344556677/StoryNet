eval $(minikube docker-env)

docker build -t frontend:latest ./frontend
docker build -t backend:latest ./backend
docker build -t ner_service:latest ./ner_service
docker build -t pdf_service:latest ./pdf_service