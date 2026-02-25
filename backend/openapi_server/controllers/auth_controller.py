import connexion
from typing import Dict
from typing import Tuple
from typing import Union

from openapi_server.models.auth_me_password_put_request import AuthMePasswordPutRequest  # noqa: E501
from openapi_server.models.auth_refresh_post_request import AuthRefreshPostRequest  # noqa: E501
from openapi_server.models.error_response import ErrorResponse  # noqa: E501
from openapi_server.models.login_request import LoginRequest  # noqa: E501
from openapi_server.models.register_request import RegisterRequest  # noqa: E501
from openapi_server.models.token_response import TokenResponse  # noqa: E501
from openapi_server.models.user_profile import UserProfile  # noqa: E501
from openapi_server import util


def auth_login_post(body):  # noqa: E501
    """Authenticate and receive a JWT

     # noqa: E501

    :param login_request: 
    :type login_request: dict | bytes

    :rtype: Union[TokenResponse, Tuple[TokenResponse, int], Tuple[TokenResponse, int, Dict[str, str]]
    """
    login_request = body
    if connexion.request.is_json:
        login_request = LoginRequest.from_dict(connexion.request.get_json())  # noqa: E501
    return 'do some magic!'


def auth_me_get():  # noqa: E501
    """Get the authenticated user&#39;s profile

     # noqa: E501


    :rtype: Union[UserProfile, Tuple[UserProfile, int], Tuple[UserProfile, int, Dict[str, str]]
    """
    return 'do some magic!'


def auth_me_password_put(body):  # noqa: E501
    """Change the authenticated user&#39;s password

     # noqa: E501

    :param auth_me_password_put_request: 
    :type auth_me_password_put_request: dict | bytes

    :rtype: Union[None, Tuple[None, int], Tuple[None, int, Dict[str, str]]
    """
    auth_me_password_put_request = body
    if connexion.request.is_json:
        auth_me_password_put_request = AuthMePasswordPutRequest.from_dict(connexion.request.get_json())  # noqa: E501
    return 'do some magic!'


def auth_refresh_post(body):  # noqa: E501
    """Obtain a new access token using a refresh token

     # noqa: E501

    :param auth_refresh_post_request: 
    :type auth_refresh_post_request: dict | bytes

    :rtype: Union[TokenResponse, Tuple[TokenResponse, int], Tuple[TokenResponse, int, Dict[str, str]]
    """
    auth_refresh_post_request = body
    if connexion.request.is_json:
        auth_refresh_post_request = AuthRefreshPostRequest.from_dict(connexion.request.get_json())  # noqa: E501
    return 'do some magic!'


def auth_register_post(body):  # noqa: E501
    """Register a new user account

     # noqa: E501

    :param register_request: 
    :type register_request: dict | bytes

    :rtype: Union[TokenResponse, Tuple[TokenResponse, int], Tuple[TokenResponse, int, Dict[str, str]]
    """
    register_request = body
    if connexion.request.is_json:
        register_request = RegisterRequest.from_dict(connexion.request.get_json())  # noqa: E501
    return 'do some magic!'
