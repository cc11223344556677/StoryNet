minikube start --cpus=8 --memory=24g --gpus=all

eval $(minikube docker-env)

minikube addons enable ingress
kubectl apply -f https://raw.githubusercontent.com/NVIDIA/k8s-device-plugin/v0.14.5/nvidia-device-plugin.yml

docker build -t frontend:latest ./frontend
docker build -t backend:latest ./backend
docker build -t ner-service:latest ./ner_service
docker build -t pdf-service:latest ./pdf_service

kubectl apply -f manifests/

kubectl rollout restart deployment/backend -n app
kubectl rollout restart deployment/frontend -n app
kubectl rollout restart deployment/pdf-service -n app
kubectl rollout restart deployment/ner-service -n app
