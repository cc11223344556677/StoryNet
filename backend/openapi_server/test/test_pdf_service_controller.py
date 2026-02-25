import unittest

from flask import json

from openapi_server.models.error_response import ErrorResponse  # noqa: E501
from openapi_server.models.ocr_request import OcrRequest  # noqa: E501
from openapi_server.models.ocr_response import OcrResponse  # noqa: E501
from openapi_server.test import BaseTestCase


class TestPDFServiceController(BaseTestCase):
    """PDFServiceController integration test stubs"""

    def test_pdf_post(self):
        """Test case for pdf_post

        Extract text from a PDF (pdf_service)
        """
        ocr_request = {"mime_type":"application/pdf","file_base64":"file_base64","document_id":"document_id"}
        headers = { 
            'Accept': 'application/json',
            'Content-Type': 'application/json',
        }
        response = self.client.open(
            '/api/pdf',
            method='POST',
            headers=headers,
            data=json.dumps(ocr_request),
            content_type='application/json')
        self.assert200(response,
                       'Response body is : ' + response.data.decode('utf-8'))


if __name__ == '__main__':
    unittest.main()
