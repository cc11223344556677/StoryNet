import unittest

from flask import json

from openapi_server.models.document_list_response import DocumentListResponse  # noqa: E501
from openapi_server.models.entity_search_response import EntitySearchResponse  # noqa: E501
from openapi_server.models.error_response import ErrorResponse  # noqa: E501
from openapi_server.models.ft_m_entity import FtMEntity  # noqa: E501
from openapi_server.test import BaseTestCase


class TestEntitiesController(BaseTestCase):
    """EntitiesController integration test stubs"""

    def test_entities_id_documents_get(self):
        """Test case for entities_id_documents_get

        Get documents that are the source of an entity
        """
        query_string = [('page', 1),
                        ('page_size', 20)]
        headers = { 
            'Accept': 'application/json',
            'Authorization': 'Bearer special-key',
        }
        response = self.client.open(
            '/api/entities/{id}/documents'.format(id='id_example'),
            method='GET',
            headers=headers,
            query_string=query_string)
        self.assert200(response,
                       'Response body is : ' + response.data.decode('utf-8'))

    def test_entities_id_get(self):
        """Test case for entities_id_get

        Get a specific entity by ID
        """
        headers = { 
            'Accept': 'application/json',
            'Authorization': 'Bearer special-key',
        }
        response = self.client.open(
            '/api/entities/{id}'.format(id='id_example'),
            method='GET',
            headers=headers)
        self.assert200(response,
                       'Response body is : ' + response.data.decode('utf-8'))

    def test_entities_id_relationships_get(self):
        """Test case for entities_id_relationships_get

        Get all relationships connected to an entity
        """
        query_string = [('depth', 1),
                        ('schema', '_schema_example'),
                        ('page', 1),
                        ('page_size', 20)]
        headers = { 
            'Accept': 'application/json',
            'Authorization': 'Bearer special-key',
        }
        response = self.client.open(
            '/api/entities/{id}/relationships'.format(id='id_example'),
            method='GET',
            headers=headers,
            query_string=query_string)
        self.assert200(response,
                       'Response body is : ' + response.data.decode('utf-8'))

    def test_entities_search_get(self):
        """Test case for entities_search_get

        Search for entities with optional fuzzy matching
        """
        query_string = [('q', 'John Doe'),
                        ('schema', 'Person'),
                        ('fuzzy', True),
                        ('page', 1),
                        ('page_size', 20)]
        headers = { 
            'Accept': 'application/json',
            'Authorization': 'Bearer special-key',
        }
        response = self.client.open(
            '/api/entities/search',
            method='GET',
            headers=headers,
            query_string=query_string)
        self.assert200(response,
                       'Response body is : ' + response.data.decode('utf-8'))

    def test_relationships_id_documents_get(self):
        """Test case for relationships_id_documents_get

        Get documents that are the source of a relationship
        """
        query_string = [('page', 1),
                        ('page_size', 20)]
        headers = { 
            'Accept': 'application/json',
            'Authorization': 'Bearer special-key',
        }
        response = self.client.open(
            '/api/relationships/{id}/documents'.format(id='id_example'),
            method='GET',
            headers=headers,
            query_string=query_string)
        self.assert200(response,
                       'Response body is : ' + response.data.decode('utf-8'))

    def test_relationships_id_get(self):
        """Test case for relationships_id_get

        Get a specific interstitial (relationship) entity by ID
        """
        headers = { 
            'Accept': 'application/json',
            'Authorization': 'Bearer special-key',
        }
        response = self.client.open(
            '/api/relationships/{id}'.format(id='id_example'),
            method='GET',
            headers=headers)
        self.assert200(response,
                       'Response body is : ' + response.data.decode('utf-8'))


if __name__ == '__main__':
    unittest.main()
