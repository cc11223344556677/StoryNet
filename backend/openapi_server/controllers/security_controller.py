from typing import List
import jwt
from flask import current_app, request
from openapi_server.db import get_mongo
from bson import ObjectId

def info_from_bearerAuth(token):
    """
    Check and retrieve authentication information from custom bearer token.
    Returned value will be passed in 'token_info' parameter of your operation function, if there is one.
    'sub' or 'uid' will be set in 'user' parameter of your operation function, if there is one.

    :param token Token provided by Authorization header
    :type token: str
    :return: Decoded token information or None if token is invalid
    :rtype: dict | None
    """
    try:
        secret = current_app.config.get("JWT_SECRET_KEY", "changeme")
        payload = jwt.decode(token, secret, algorithms=["HS256"])
        user_id = payload.get("sub")
        if not user_id:
            return None

        # Verify user still exists
        mongo = get_mongo()
        user = user = mongo["users"].find_one({"_id": ObjectId(user_id)})
        if not user:
            return None

        return {"uid": user_id, "email": payload.get("email")}
    except jwt.ExpiredSignatureError:
        return None
    except jwt.InvalidTokenError:
        return None
    except Exception:
        return None

