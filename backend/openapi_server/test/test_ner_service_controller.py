import unittest

from flask import json

from openapi_server.models.error_response import ErrorResponse  # noqa: E501
from openapi_server.models.ner_request import NerRequest  # noqa: E501
from openapi_server.models.ner_response import NerResponse  # noqa: E501
from openapi_server.test import BaseTestCase


class TestNERServiceController(BaseTestCase):
    """NERServiceController integration test stubs"""

    def test_ner_post(self):
        """Test case for ner_post

        Extract FtM entities from page text (ner_service)
        """
        ner_request = {"pages":[{"page_number":1,"text":"text"},{"page_number":1,"text":"text"}],"document_id":"document_id"}
        headers = { 
            'Accept': 'application/json',
            'Content-Type': 'application/json',
        }
        response = self.client.open(
            '/api/ner',
            method='POST',
            headers=headers,
            data=json.dumps(ner_request),
            content_type='application/json')
        self.assert200(response,
                       'Response body is : ' + response.data.decode('utf-8'))


if __name__ == '__main__':
    unittest.main()
