"""
openapi_server/__init__.py

Flask/Connexion application factory.

Call create_app() to get a configured Connexion application. This is the
single place that wires together:
  1. Connexion (reads openapi.yaml, routes requests to controllers)
  2. Database connections (MongoDB + Neo4j via db.py)
  3. The background worker thread

Usage
-----
Development (via __main__.py):
    app = create_app()
    app.run(port=5001)

Production (gunicorn, as configured in the Dockerfile):
    gunicorn "openapi_server:create_app()"

Worker only (standalone process for a dedicated worker pod):
    python -m openapi_server.worker
"""

import os
import logging
import threading

import connexion
from openapi_server.encoder import JSONEncoder
from openapi_server.db import init_db

log = logging.getLogger("storynet")


def create_app():
    """
    Create and configure the Connexion application.

    Returns a connexion.FlaskApp whose underlying Flask app is accessible
    as app.app (for gunicorn: use the FlaskApp itself as the WSGI callable).
    """
    app = connexion.FlaskApp(__name__, specification_dir="openapi/")

    # Use our custom JSON encoder (handles datetime, ObjectId, etc.)
    app.app.json_encoder = JSONEncoder

    # ── Configuration ──────────────────────────────────────────────────────
    app.app.config.update(
        MONGO_URI=os.environ.get("MONGO_URI"),
        NEO4J_URI=os.environ.get("NEO4J_URI"),
        NEO4J_USER=os.environ.get("NEO4J_USER"),
        NEO4J_PASSWORD=os.environ.get("NEO4J_PASSWORD"),
        JWT_SECRET_KEY=os.environ.get("JWT_SECRET"),
    )

    # ── OpenAPI / routing ──────────────────────────────────────────────────
    # Connexion reads openapi.yaml, which has operationId +
    # x-openapi-router-controller on every path to map routes to controllers.
    # pythonic_params=True converts camelCase param names to snake_case so
    # they match the Python function signatures.
    app.add_api(
        "openapi.yaml",
        arguments={"title": "StoryNet API"},
        pythonic_params=True,
        strict_validation=True,
        validate_responses=False,  # set True during development to catch bugs
    )

    # ── Databases ──────────────────────────────────────────────────────────
    init_db(app.app)

    # ── Background worker thread ───────────────────────────────────────────
    # Only start the worker thread if WORKER_ENABLED is not explicitly "false".
    # Set WORKER_ENABLED=false in the worker's own Deployment (it runs the
    # worker via __main__) to avoid double-processing in that pod, while
    # keeping the thread running in the API pod for simple single-pod setups.
    if os.environ.get("WORKER_ENABLED", "true").lower() != "false":
        _start_worker_thread(app.app)

    return app


def _start_worker_thread(flask_app):
    """
    Start the document processing worker in a background daemon thread.

    Daemon=True means the thread will be killed automatically when the main
    process exits, so it won't block a clean shutdown.
    """
    from openapi_server.worker import run_worker

    thread = threading.Thread(
        target=run_worker,
        args=(flask_app,),
        name="storynet-worker",
        daemon=True,
    )
    thread.start()
    log.info("Worker thread started (daemon=True)")