import unittest

from flask import json

from openapi_server.models.error_response import ErrorResponse  # noqa: E501
from openapi_server.models.job_status import JobStatus  # noqa: E501
from openapi_server.models.jobs_get200_response import JobsGet200Response  # noqa: E501
from openapi_server.test import BaseTestCase


class TestJobsController(BaseTestCase):
    """JobsController integration test stubs"""

    def test_jobs_get(self):
        """Test case for jobs_get

        List all processing jobs for the authenticated user
        """
        query_string = [('status', 'status_example'),
                        ('page', 1),
                        ('page_size', 20)]
        headers = { 
            'Accept': 'application/json',
            'Authorization': 'Bearer special-key',
        }
        response = self.client.open(
            '/api/jobs',
            method='GET',
            headers=headers,
            query_string=query_string)
        self.assert200(response,
                       'Response body is : ' + response.data.decode('utf-8'))

    def test_jobs_id_get(self):
        """Test case for jobs_id_get

        Poll the processing status of a document upload job
        """
        headers = { 
            'Accept': 'application/json',
            'Authorization': 'Bearer special-key',
        }
        response = self.client.open(
            '/api/jobs/{id}'.format(id='id_example'),
            method='GET',
            headers=headers)
        self.assert200(response,
                       'Response body is : ' + response.data.decode('utf-8'))


if __name__ == '__main__':
    unittest.main()
