import unittest

from flask import json

from openapi_server.models.document import Document  # noqa: E501
from openapi_server.models.document_list_response import DocumentListResponse  # noqa: E501
from openapi_server.models.documents_id_patch_request import DocumentsIdPatchRequest  # noqa: E501
from openapi_server.models.entity_search_response import EntitySearchResponse  # noqa: E501
from openapi_server.models.error_response import ErrorResponse  # noqa: E501
from openapi_server.models.job_status import JobStatus  # noqa: E501
from openapi_server.test import BaseTestCase


class TestDocumentsController(BaseTestCase):
    """DocumentsController integration test stubs"""

    def test_documents_id_delete(self):
        """Test case for documents_id_delete

        Remove the authenticated user's ownership of a document
        """
        headers = { 
            'Accept': 'application/json',
            'Authorization': 'Bearer special-key',
        }
        response = self.client.open(
            '/api/documents/{id}'.format(id='id_example'),
            method='DELETE',
            headers=headers)
        self.assert200(response,
                       'Response body is : ' + response.data.decode('utf-8'))

    def test_documents_id_entities_get(self):
        """Test case for documents_id_entities_get

        Get all entities extracted from a document
        """
        query_string = [('schema', '_schema_example'),
                        ('page', 1),
                        ('page_size', 20)]
        headers = { 
            'Accept': 'application/json',
            'Authorization': 'Bearer special-key',
        }
        response = self.client.open(
            '/api/documents/{id}/entities'.format(id='id_example'),
            method='GET',
            headers=headers,
            query_string=query_string)
        self.assert200(response,
                       'Response body is : ' + response.data.decode('utf-8'))

    def test_documents_id_get(self):
        """Test case for documents_id_get

        Get metadata for a specific document
        """
        headers = { 
            'Accept': 'application/json',
            'Authorization': 'Bearer special-key',
        }
        response = self.client.open(
            '/api/documents/{id}'.format(id='id_example'),
            method='GET',
            headers=headers)
        self.assert200(response,
                       'Response body is : ' + response.data.decode('utf-8'))

    def test_documents_id_patch(self):
        """Test case for documents_id_patch

        Update document metadata
        """
        documents_id_patch_request = openapi_server.DocumentsIdPatchRequest()
        headers = { 
            'Accept': 'application/json',
            'Content-Type': 'application/json',
            'Authorization': 'Bearer special-key',
        }
        response = self.client.open(
            '/api/documents/{id}'.format(id='id_example'),
            method='PATCH',
            headers=headers,
            data=json.dumps(documents_id_patch_request),
            content_type='application/json')
        self.assert200(response,
                       'Response body is : ' + response.data.decode('utf-8'))

    def test_documents_mine_get(self):
        """Test case for documents_mine_get

        List documents owned by the authenticated user
        """
        query_string = [('status', 'status_example'),
                        ('type', 'type_example'),
                        ('page', 1),
                        ('page_size', 20)]
        headers = { 
            'Accept': 'application/json',
            'Authorization': 'Bearer special-key',
        }
        response = self.client.open(
            '/api/documents/mine',
            method='GET',
            headers=headers,
            query_string=query_string)
        self.assert200(response,
                       'Response body is : ' + response.data.decode('utf-8'))

    @unittest.skip("multipart/form-data not supported by Connexion")
    def test_documents_upload_pdf_post(self):
        """Test case for documents_upload_pdf_post

        Upload a PDF document for OCR + NER processing
        """
        headers = { 
            'Accept': 'application/json',
            'Content-Type': 'multipart/form-data',
            'Authorization': 'Bearer special-key',
        }
        data = dict(file='/path/to/file',
                    make_public=False)
        response = self.client.open(
            '/api/documents/upload/pdf',
            method='POST',
            headers=headers,
            data=data,
            content_type='multipart/form-data')
        self.assert200(response,
                       'Response body is : ' + response.data.decode('utf-8'))

    @unittest.skip("multipart/form-data not supported by Connexion")
    def test_documents_upload_text_post(self):
        """Test case for documents_upload_text_post

        Upload a plain-text document for NER processing
        """
        headers = { 
            'Accept': 'application/json',
            'Content-Type': 'multipart/form-data',
            'Authorization': 'Bearer special-key',
        }
        data = dict(file='/path/to/file',
                    make_public=False)
        response = self.client.open(
            '/api/documents/upload/text',
            method='POST',
            headers=headers,
            data=data,
            content_type='multipart/form-data')
        self.assert200(response,
                       'Response body is : ' + response.data.decode('utf-8'))


if __name__ == '__main__':
    unittest.main()
