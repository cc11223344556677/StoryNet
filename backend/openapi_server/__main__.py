import connexion
import os
from openapi_server.db import init_db
from openapi_server import encoder


def main():
    app = connexion.App(__name__, specification_dir='./openapi/')
    flask_app = app.app
    
    flask_app.config["MONGO_URI"] = os.getenv("MONGO_URI")
    flask_app.config["NEO4J_URI"] = os.getenv("NEO4J_URI")
    flask_app.config["NEO4J_USER"] = os.getenv("NEO4J_USER")
    flask_app.config["NEO4J_PASSWORD"] = os.getenv("NEO4J_PASSWORD")
    flask_app.config["JWT_SECRET"] = os.getenv("JWT_SECRET")
    
    init_db(flask_app)
    
    app.app.json_encoder = encoder.JSONEncoder
    app.add_api('openapi.yaml',
                arguments={'title': 'StoryNet API'},
                pythonic_params=True)

    app.run(port=8080)


if __name__ == '__main__':
    main()
