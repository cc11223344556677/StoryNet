import connexion
from typing import Dict
from typing import Tuple
from typing import Union
import os
import jwt
import bcrypt
from datetime import datetime, timedelta, timezone
from bson import ObjectId
from openapi_server.db import get_mongo
from flask import request

from openapi_server.models.auth_me_password_put_request import AuthMePasswordPutRequest  # noqa: E501
from openapi_server.models.auth_refresh_post_request import AuthRefreshPostRequest  # noqa: E501
from openapi_server.models.error_response import ErrorResponse  # noqa: E501
from openapi_server.models.login_request import LoginRequest  # noqa: E501
from openapi_server.models.register_request import RegisterRequest  # noqa: E501
from openapi_server.models.token_response import TokenResponse  # noqa: E501
from openapi_server.models.user_profile import UserProfile  # noqa: E501
from openapi_server import util

#helpers:
def _jwt_secret():
    from flask import current_app
    return current_app.config.get("JWT_SECRET", os.environ.get("JWT_SECRET", "changeme"))


def _make_tokens(user_id: str, email: str):
    """Return (access_token, refresh_token) as signed JWTs."""
    secret = _jwt_secret()
    now = datetime.now(tz=timezone.utc)

    access_payload = {
        "sub": user_id,
        "email": email,
        "iat": now,
        "exp": now + timedelta(hours=1),
        "type": "access",
    }
    refresh_payload = {
        "sub": user_id,
        "email": email,
        "iat": now,
        "exp": now + timedelta(days=30),
        "type": "refresh",
    }

    access_token = jwt.encode(access_payload, secret, algorithm="HS256")
    refresh_token = jwt.encode(refresh_payload, secret, algorithm="HS256")
    return access_token, refresh_token


def _token_response(user_id: str, email: str):
    access_token, refresh_token = _make_tokens(user_id, email)
    return TokenResponse(
        access_token=access_token,
        refresh_token=refresh_token,
        token_type="Bearer",
        expires_in=3600,
    )


def _current_uid():
    """Extract the authenticated user ID from the connexion context."""
    token_info = connexion.context.get("token_info", {}) or {}
    return token_info.get("uid")


#endpoints
def auth_login_post(body):  # noqa: E501
    """Authenticate and receive a JWT

     # noqa: E501

    :param login_request: 
    :type login_request: dict | bytes

    :rtype: Union[TokenResponse, Tuple[TokenResponse, int], Tuple[TokenResponse, int, Dict[str, str]]
    """
    if connexion.request.is_json:
        login_request = LoginRequest.from_dict(connexion.request.get_json())
    else:
        return ErrorResponse(error="BAD_REQUEST", message="JSON body required"), 400

    email = login_request.email.lower().strip()
    password = login_request.password

    mongo = get_mongo()
    user = mongo["users"].find_one({"email": email})

    if not user or not bcrypt.checkpw(password.encode(), user["password_hash"]):
        return ErrorResponse(error="INVALID_CREDENTIALS", message="Invalid email or password."), 401

    user_id = str(user["_id"])
    return _token_response(user_id, email), 200


def auth_me_get():  # noqa: E501
    """Get the authenticated user&#39;s profile

     # noqa: E501


    :rtype: Union[UserProfile, Tuple[UserProfile, int], Tuple[UserProfile, int, Dict[str, str]]
    """
    uid = _current_uid()
    if not uid:
        return ErrorResponse(error="UNAUTHORIZED", message="Not authenticated."), 401

    mongo = get_mongo()
    try:
        user = mongo["users"].find_one({"_id": ObjectId(uid)})
    except Exception:
        return ErrorResponse(error="INVALID_USER_ID", message="Invalid user ID."), 401

    if not user:
        return ErrorResponse(error="USER_NOT_FOUND", message="User not found."), 404

    return UserProfile(
        id=str(user["_id"]),
        email=user["email"],
        display_name=user.get("display_name", ""),
        created_at=user.get("created_at"),
    ), 200


def auth_me_password_put(body):  # noqa: E501
    """Change the authenticated user&#39;s password

     # noqa: E501

    :param auth_me_password_put_request: 
    :type auth_me_password_put_request: dict | bytes

    :rtype: Union[None, Tuple[None, int], Tuple[None, int, Dict[str, str]]
    """
    print("AUTH HEADER:", request.headers.get("Authorization"))
    uid = _current_uid()
    if not uid:
        return ErrorResponse(error="UNAUTHORIZED", message="Not authenticated."), 401

    if connexion.request.is_json:
        data = connexion.request.get_json()
    else:
        return ErrorResponse(error="BAD_REQUEST", message="JSON body required"), 400

    current_password = data.get("current_password", "")
    new_password = data.get("new_password", "")

    if len(new_password) < 8:
        return ErrorResponse(error="VALIDATION_ERROR", message="new_password must be at least 8 characters."), 422

    mongo = get_mongo()
    try:
        user = mongo["users"].find_one({"_id": ObjectId(uid)})
    except Exception:
        return ErrorResponse(error="INVALID_USER_ID", message="Invalid user ID."), 401

    if not user:
        return ErrorResponse(error="USER_NOT_FOUND", message="User not found."), 404

    if not bcrypt.checkpw(current_password.encode(), user["password_hash"]):
        return ErrorResponse(error="INVALID_CREDENTIALS", message="Current password is incorrect."), 401

    new_hash = bcrypt.hashpw(new_password.encode(), bcrypt.gensalt())
    mongo["users"].update_one({"_id": ObjectId(uid)}, {"$set": {"password_hash": new_hash}})

    return None, 204


def auth_refresh_post(body):  # noqa: E501
    """Obtain a new access token using a refresh token

     # noqa: E501

    :param auth_refresh_post_request: 
    :type auth_refresh_post_request: dict | bytes

    :rtype: Union[TokenResponse, Tuple[TokenResponse, int], Tuple[TokenResponse, int, Dict[str, str]]
    """
    print("AUTH HEADER:", request.headers.get("Authorization"))
    if connexion.request.is_json:
        data = connexion.request.get_json()
    else:
        return ErrorResponse(error="BAD_REQUEST", message="JSON body required"), 400

    refresh_token = data.get("refresh_token")
    if not refresh_token:
        return ErrorResponse(error="MISSING_TOKEN", message="refresh_token is required."), 401

    try:
        secret = _jwt_secret()
        payload = jwt.decode(refresh_token, secret, algorithms=["HS256"])
        if payload.get("type") != "refresh":
            raise jwt.InvalidTokenError("Not a refresh token")
    except jwt.ExpiredSignatureError:
        return ErrorResponse(error="TOKEN_EXPIRED", message="Refresh token has expired."), 401
    except jwt.InvalidTokenError as e:
        return ErrorResponse(error="INVALID_TOKEN", message=str(e)), 401

    user_id = payload["sub"]
    email = payload.get("email", "")
    return _token_response(user_id, email), 200


def auth_register_post(body):  # noqa: E501
    """Register a new user account

     # noqa: E501

    :param register_request: 
    :type register_request: dict | bytes

    :rtype: Union[TokenResponse, Tuple[TokenResponse, int], Tuple[TokenResponse, int, Dict[str, str]]
    """
    if connexion.request.is_json:
        register_request = RegisterRequest.from_dict(connexion.request.get_json())
    else:
        return ErrorResponse(error="BAD_REQUEST", message="JSON body required"), 400

    email = register_request.email.lower().strip()
    password = register_request.password
    display_name = register_request.display_name

    mongo = get_mongo()
    users = mongo["users"]

    if users.find_one({"email": email}):
        return ErrorResponse(error="EMAIL_TAKEN", message="Email already registered."), 409

    hashed_pw = bcrypt.hashpw(password.encode(), bcrypt.gensalt())

    result = users.insert_one({
        "email": email,
        "password_hash": hashed_pw,
        "display_name": display_name,
        "created_at": datetime.now(tz=timezone.utc),
    })

    user_id = str(result.inserted_id)
    return _token_response(user_id, email), 201