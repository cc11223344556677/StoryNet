# ner_service Dockerfile
#
# Build strategy:
#   Stage 1 (model-pull): Installs Ollama, pulls the model weights, then exports
#   the Ollama model store so that Stage 2 can COPY it in.  This keeps the final
#   image self-contained (no internet access required at runtime) at the cost of
#   a larger image (~7-8 GB total).
#
# To change the model, update MODEL_NAME in ner.py AND the ARG below.
# The model tag must be a valid `ollama pull` target.
#
# Build:
#   docker build -t ner-service:latest .
#
# Run locally:
#   docker run --rm -p 5000:5000 ner-service:latest

# ---------------------------------------------------------------------------
# Stage 1: pull model weights
# ---------------------------------------------------------------------------
FROM ubuntu:24.04 AS model-pull

ARG MODEL_NAME="qwen2.5:7b-instruct-q4_K_M"

RUN apt-get update && apt-get install -y --no-install-recommends \
        curl ca-certificates zstd\
    && rm -rf /var/lib/apt/lists/*

# Install Ollama
RUN curl -fsSL https://ollama.com/install.sh | sh

# Pull the model (starts the Ollama daemon, pulls, then stops)
RUN ollama serve & \
    sleep 5 && \
    ollama pull ${MODEL_NAME} && \
    pkill ollama || true

# ---------------------------------------------------------------------------
# Stage 2: application image
# ---------------------------------------------------------------------------
FROM ubuntu:24.04

ARG MODEL_NAME="qwen2.5:7b-instruct-q4_K_M"
ENV MODEL_NAME=${MODEL_NAME}

# System dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
        python3 python3-pip python3-venv python3.12-dev zstd\
        curl ca-certificates pkg-config \
        libicu-dev g++  \
    && rm -rf /var/lib/apt/lists/*

# Install Ollama runtime (no model weights yet — copied below)
RUN curl -fsSL https://ollama.com/install.sh | sh

# Copy model weights from the build stage
COPY --from=model-pull /root/.ollama /root/.ollama

WORKDIR /app

# Python dependencies
COPY requirements.txt .
RUN pip3 install --no-cache-dir --break-system-packages -r requirements.txt

# Application source
COPY app.py ner.py ./

# Expose the Flask port
EXPOSE 5000

# Start Ollama daemon in the background, then launch gunicorn.
# gunicorn is used instead of Flask's dev server for production durability.
#
# Workers=1 because the LLM is a shared resource; horizontal scaling is
# achieved by running multiple pod replicas, not multiple workers per pod.
CMD ["sh", "-c", "ollama serve & sleep 3 && gunicorn --bind 0.0.0.0:5000 --workers 1 --timeout 300 app:app"]