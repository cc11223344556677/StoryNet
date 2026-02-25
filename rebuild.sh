eval $(minikube docker-env)

docker build --no-cache -t frontend:latest ./frontend
docker build --no-cache -t backend:latest ./backend
docker build --no-cache -t ner_service:latest ./ner_service
docker build --no-cache -t pdf_service:latest ./pdf_service

kubectl apply -f manifests/

kubectl rollout restart deployment/backend -n app
kubectl rollout restart deployment/frontend -n app
kubectl rollout restart deployment/pdf_service -n app
kubectl rollout restart deployment/ner_service -n app