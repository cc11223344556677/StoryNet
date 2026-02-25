import unittest

from flask import json

from openapi_server.models.error_response import ErrorResponse  # noqa: E501
from openapi_server.models.project import Project  # noqa: E501
from openapi_server.models.project_list_response import ProjectListResponse  # noqa: E501
from openapi_server.models.projects_id_put_request import ProjectsIdPutRequest  # noqa: E501
from openapi_server.models.projects_post_request import ProjectsPostRequest  # noqa: E501
from openapi_server.test import BaseTestCase


class TestProjectsController(BaseTestCase):
    """ProjectsController integration test stubs"""

    def test_projects_get(self):
        """Test case for projects_get

        List all projects belonging to the authenticated user
        """
        query_string = [('page', 1),
                        ('page_size', 20)]
        headers = { 
            'Accept': 'application/json',
            'Authorization': 'Bearer special-key',
        }
        response = self.client.open(
            '/api/projects',
            method='GET',
            headers=headers,
            query_string=query_string)
        self.assert200(response,
                       'Response body is : ' + response.data.decode('utf-8'))

    def test_projects_id_delete(self):
        """Test case for projects_id_delete

        Delete a project
        """
        headers = { 
            'Accept': 'application/json',
            'Authorization': 'Bearer special-key',
        }
        response = self.client.open(
            '/api/projects/{id}'.format(id='id_example'),
            method='DELETE',
            headers=headers)
        self.assert200(response,
                       'Response body is : ' + response.data.decode('utf-8'))

    def test_projects_id_get(self):
        """Test case for projects_id_get

        Load a saved project by ID
        """
        headers = { 
            'Accept': 'application/json',
            'Authorization': 'Bearer special-key',
        }
        response = self.client.open(
            '/api/projects/{id}'.format(id='id_example'),
            method='GET',
            headers=headers)
        self.assert200(response,
                       'Response body is : ' + response.data.decode('utf-8'))

    def test_projects_id_put(self):
        """Test case for projects_id_put

        Overwrite an existing project snapshot
        """
        projects_id_put_request = openapi_server.ProjectsIdPutRequest()
        headers = { 
            'Accept': 'application/json',
            'Content-Type': 'application/json',
            'Authorization': 'Bearer special-key',
        }
        response = self.client.open(
            '/api/projects/{id}'.format(id='id_example'),
            method='PUT',
            headers=headers,
            data=json.dumps(projects_id_put_request),
            content_type='application/json')
        self.assert200(response,
                       'Response body is : ' + response.data.decode('utf-8'))

    def test_projects_post(self):
        """Test case for projects_post

        Create and save a new project snapshot
        """
        projects_post_request = openapi_server.ProjectsPostRequest()
        headers = { 
            'Accept': 'application/json',
            'Content-Type': 'application/json',
            'Authorization': 'Bearer special-key',
        }
        response = self.client.open(
            '/api/projects',
            method='POST',
            headers=headers,
            data=json.dumps(projects_post_request),
            content_type='application/json')
        self.assert200(response,
                       'Response body is : ' + response.data.decode('utf-8'))


if __name__ == '__main__':
    unittest.main()
