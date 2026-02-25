import os
from pymongo import MongoClient
from neo4j import GraphDatabase
from flask import current_app

def init_db(app):
    # Read directly from env as fallback in case app.config isn't populated
    mongo_uri = app.config.get("MONGO_URI") or os.environ.get("MONGO_URI")
    mongo_client = MongoClient(mongo_uri)
    app.mongo = mongo_client.get_database()
    print(f"mongo connected: {mongo_uri}")

    neo4j_uri = app.config.get("NEO4J_URI") or os.environ.get("NEO4J_URI")
    neo4j_user = app.config.get("NEO4J_USER") or os.environ.get("NEO4J_USER")
    neo4j_password = app.config.get("NEO4J_PASSWORD") or os.environ.get("NEO4J_PASSWORD")

    print(f"Connecting to Neo4j at: {neo4j_uri}")  # add this so you can see what URI is actually being used

    app.neo4j_driver = GraphDatabase.driver(
        neo4j_uri,
        auth=(neo4j_user, neo4j_password),
    )
    print("neo4j connected")


def get_mongo():
    return current_app.mongo


def get_neo4j():
    return current_app.neo4j_driver