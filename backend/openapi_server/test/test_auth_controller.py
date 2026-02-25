import unittest

from flask import json

from openapi_server.models.auth_me_password_put_request import AuthMePasswordPutRequest  # noqa: E501
from openapi_server.models.auth_refresh_post_request import AuthRefreshPostRequest  # noqa: E501
from openapi_server.models.error_response import ErrorResponse  # noqa: E501
from openapi_server.models.login_request import LoginRequest  # noqa: E501
from openapi_server.models.register_request import RegisterRequest  # noqa: E501
from openapi_server.models.token_response import TokenResponse  # noqa: E501
from openapi_server.models.user_profile import UserProfile  # noqa: E501
from openapi_server.test import BaseTestCase


class TestAuthController(BaseTestCase):
    """AuthController integration test stubs"""

    def test_auth_login_post(self):
        """Test case for auth_login_post

        Authenticate and receive a JWT
        """
        login_request = {"password":"password","email":"email"}
        headers = { 
            'Accept': 'application/json',
            'Content-Type': 'application/json',
        }
        response = self.client.open(
            '/api/auth/login',
            method='POST',
            headers=headers,
            data=json.dumps(login_request),
            content_type='application/json')
        self.assert200(response,
                       'Response body is : ' + response.data.decode('utf-8'))

    def test_auth_me_get(self):
        """Test case for auth_me_get

        Get the authenticated user's profile
        """
        headers = { 
            'Accept': 'application/json',
            'Authorization': 'Bearer special-key',
        }
        response = self.client.open(
            '/api/auth/me',
            method='GET',
            headers=headers)
        self.assert200(response,
                       'Response body is : ' + response.data.decode('utf-8'))

    def test_auth_me_password_put(self):
        """Test case for auth_me_password_put

        Change the authenticated user's password
        """
        auth_me_password_put_request = openapi_server.AuthMePasswordPutRequest()
        headers = { 
            'Accept': 'application/json',
            'Content-Type': 'application/json',
            'Authorization': 'Bearer special-key',
        }
        response = self.client.open(
            '/api/auth/me/password',
            method='PUT',
            headers=headers,
            data=json.dumps(auth_me_password_put_request),
            content_type='application/json')
        self.assert200(response,
                       'Response body is : ' + response.data.decode('utf-8'))

    def test_auth_refresh_post(self):
        """Test case for auth_refresh_post

        Obtain a new access token using a refresh token
        """
        auth_refresh_post_request = openapi_server.AuthRefreshPostRequest()
        headers = { 
            'Accept': 'application/json',
            'Content-Type': 'application/json',
        }
        response = self.client.open(
            '/api/auth/refresh',
            method='POST',
            headers=headers,
            data=json.dumps(auth_refresh_post_request),
            content_type='application/json')
        self.assert200(response,
                       'Response body is : ' + response.data.decode('utf-8'))

    def test_auth_register_post(self):
        """Test case for auth_register_post

        Register a new user account
        """
        register_request = {"password":"password","display_name":"display_name","email":"email"}
        headers = { 
            'Accept': 'application/json',
            'Content-Type': 'application/json',
        }
        response = self.client.open(
            '/api/auth/register',
            method='POST',
            headers=headers,
            data=json.dumps(register_request),
            content_type='application/json')
        self.assert200(response,
                       'Response body is : ' + response.data.decode('utf-8'))


if __name__ == '__main__':
    unittest.main()
