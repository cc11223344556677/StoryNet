from pymongo import MongoClient
from neo4j import GraphDatabase
from flask import current_app, Flask


def init_db(app):
    mongo_uri = app.config.get("MONGO_URI")
    mongo_client = MongoClient(mongo_uri)
    app.mongo = mongo_client.get_database()
    print('mongo connected')

    neo4j_uri = app.config.get("NEO4J_URI")
    neo4j_user = app.config.get("NEO4J_USER")
    neo4j_password = app.config.get("NEO4J_PASSWORD")

    app.neo4j_driver = GraphDatabase.driver(
        neo4j_uri,
        auth=(neo4j_user, neo4j_password),
    )
    print('neo4j connected')


def get_mongo():
    return current_app.mongo


def get_neo4j():
    return current_app.neo4j_driver