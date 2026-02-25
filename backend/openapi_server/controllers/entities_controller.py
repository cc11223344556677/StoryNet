import connexion
from typing import Dict
from typing import Tuple
from typing import Union

from openapi_server.models.document_list_response import DocumentListResponse  # noqa: E501
from openapi_server.models.entity_search_response import EntitySearchResponse  # noqa: E501
from openapi_server.models.error_response import ErrorResponse  # noqa: E501
from openapi_server.models.ft_m_entity import FtMEntity  # noqa: E501
from openapi_server import util


def entities_id_documents_get(id, page=None, page_size=None):  # noqa: E501
    """Get documents that are the source of an entity

    Returns all documents in which this entity appears via its provenance entries. Only documents that are public or owned by the authenticated user are returned.  # noqa: E501

    :param id: 
    :type id: str
    :param page: 
    :type page: int
    :param page_size: 
    :type page_size: int

    :rtype: Union[DocumentListResponse, Tuple[DocumentListResponse, int], Tuple[DocumentListResponse, int, Dict[str, str]]
    """
    return 'do some magic!'


def entities_id_get(id):  # noqa: E501
    """Get a specific entity by ID

    Returns the current live state of an entity from Neo4j. Use this endpoint when reopening a project to check whether saved entities have changed since the project snapshot was taken. Returns 404 if the entity does not exist or is not visible to the user.  # noqa: E501

    :param id: 
    :type id: str

    :rtype: Union[FtMEntity, Tuple[FtMEntity, int], Tuple[FtMEntity, int, Dict[str, str]]
    """
    return 'do some magic!'


def entities_id_relationships_get(id, depth=None, _schema=None, page=None, page_size=None):  # noqa: E501
    """Get all relationships connected to an entity

    Returns FtM interstitial entities (Ownership, Membership, Directorship, etc.) that reference this entity in any of their entity-typed properties. This is the primary graph traversal endpoint; call it recursively from the frontend to build the relationship graph. Results respect visibility rules. The &#x60;depth&#x60; parameter performs server-side recursive expansion up to the requested number of hops.  # noqa: E501

    :param id: 
    :type id: str
    :param depth: Number of relationship hops to expand recursively (1 &#x3D; immediate neighbours only). Values above 3 may be slow on large graphs. 
    :type depth: int
    :param _schema: Filter returned relationships by FtM schema type.
    :type _schema: str
    :param page: 
    :type page: int
    :param page_size: 
    :type page_size: int

    :rtype: Union[EntitySearchResponse, Tuple[EntitySearchResponse, int], Tuple[EntitySearchResponse, int, Dict[str, str]]
    """
    return 'do some magic!'


def entities_search_get(q=None, _schema=None, fuzzy=None, page=None, page_size=None):  # noqa: E501
    """Search for entities with optional fuzzy matching

    Searches the Neo4j database for FtM entities matching the given query. Results are filtered by visibility: only entities that are public OR owned by the authenticated user are returned. The &#x60;schema&#x60; parameter narrows results to a specific FtM schema type. Any combination of parameters may be used; at least one of &#x60;q&#x60; or &#x60;schema&#x60; is recommended.  # noqa: E501

    :param q: Free-text query matched against entity properties (name, aliases, identifiers, etc.). Fuzzy matching is applied when &#x60;fuzzy&#x3D;true&#x60;. 
    :type q: str
    :param _schema: Filter by FtM schema type (e.g. Person, Organization, Ownership).
    :type _schema: str
    :param fuzzy: Enable fuzzy/approximate string matching (default true).
    :type fuzzy: bool
    :param page: 
    :type page: int
    :param page_size: 
    :type page_size: int

    :rtype: Union[EntitySearchResponse, Tuple[EntitySearchResponse, int], Tuple[EntitySearchResponse, int, Dict[str, str]]
    """
    return 'do some magic!'


def relationships_id_documents_get(id, page=None, page_size=None):  # noqa: E501
    """Get documents that are the source of a relationship

    Returns all documents in which this relationship entity appears via its provenance. Visibility rules apply.  # noqa: E501

    :param id: 
    :type id: str
    :param page: 
    :type page: int
    :param page_size: 
    :type page_size: int

    :rtype: Union[DocumentListResponse, Tuple[DocumentListResponse, int], Tuple[DocumentListResponse, int, Dict[str, str]]
    """
    return 'do some magic!'


def relationships_id_get(id):  # noqa: E501
    """Get a specific interstitial (relationship) entity by ID

    Convenience endpoint equivalent to GET /entities/{id}, but semantically signals that the caller expects an Interval-subtype entity. Returns the same FtMEntity schema. Visibility rules apply.  # noqa: E501

    :param id: 
    :type id: str

    :rtype: Union[FtMEntity, Tuple[FtMEntity, int], Tuple[FtMEntity, int, Dict[str, str]]
    """
    return 'do some magic!'
