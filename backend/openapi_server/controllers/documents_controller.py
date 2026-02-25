import connexion
from typing import Dict
from typing import Tuple
from typing import Union

from openapi_server.models.document import Document  # noqa: E501
from openapi_server.models.document_list_response import DocumentListResponse  # noqa: E501
from openapi_server.models.documents_id_patch_request import DocumentsIdPatchRequest  # noqa: E501
from openapi_server.models.entity_search_response import EntitySearchResponse  # noqa: E501
from openapi_server.models.error_response import ErrorResponse  # noqa: E501
from openapi_server.models.job_status import JobStatus  # noqa: E501
from openapi_server import util


def documents_id_delete(id):  # noqa: E501
    """Remove the authenticated user&#39;s ownership of a document

    Removes the calling user from &#x60;owner_ids&#x60;. If no owners remain, the document and all orphaned entities are permanently deleted. If other owners remain, those owners and the document persist.  # noqa: E501

    :param id: 
    :type id: str

    :rtype: Union[None, Tuple[None, int], Tuple[None, int, Dict[str, str]]
    """
    return 'do some magic!'


def documents_id_entities_get(id, _schema=None, page=None, page_size=None):  # noqa: E501
    """Get all entities extracted from a document

    Returns all FtM entities (node-type and interstitial) whose provenance includes this document. Visibility of the document itself must be satisfied first; individual entities further respect their own &#x60;public&#x60; flags.  # noqa: E501

    :param id: 
    :type id: str
    :param _schema: Filter by FtM schema type.
    :type _schema: str
    :param page: 
    :type page: int
    :param page_size: 
    :type page_size: int

    :rtype: Union[EntitySearchResponse, Tuple[EntitySearchResponse, int], Tuple[EntitySearchResponse, int, Dict[str, str]]
    """
    return 'do some magic!'


def documents_id_get(id):  # noqa: E501
    """Get metadata for a specific document

    Returns 404 if the document is not visible to the authenticated user. # noqa: E501

    :param id: 
    :type id: str

    :rtype: Union[Document, Tuple[Document, int], Tuple[Document, int, Dict[str, str]]
    """
    return 'do some magic!'


def documents_id_patch(id, body):  # noqa: E501
    """Update document metadata

    Allows an owner to update mutable fields. The most important use case is releasing a document publicly (&#x60;public: true&#x60;). Any owner may set &#x60;public&#x60; to true; the change propagates to all entities and relationships whose sole source is this document. Only owners may call this endpoint.  # noqa: E501

    :param id: 
    :type id: str
    :param documents_id_patch_request: 
    :type documents_id_patch_request: dict | bytes

    :rtype: Union[Document, Tuple[Document, int], Tuple[Document, int, Dict[str, str]]
    """
    documents_id_patch_request = body
    if connexion.request.is_json:
        documents_id_patch_request = DocumentsIdPatchRequest.from_dict(connexion.request.get_json())  # noqa: E501
    return 'do some magic!'


def documents_mine_get(status=None, type=None, page=None, page_size=None):  # noqa: E501
    """List documents owned by the authenticated user

    Returns only documents where the authenticated user appears in owner_ids.  # noqa: E501

    :param status: 
    :type status: str
    :param type: 
    :type type: str
    :param page: 
    :type page: int
    :param page_size: 
    :type page_size: int

    :rtype: Union[DocumentListResponse, Tuple[DocumentListResponse, int], Tuple[DocumentListResponse, int, Dict[str, str]]
    """
    return 'do some magic!'


def documents_upload_pdf_post(file, make_public=None):  # noqa: E501
    """Upload a PDF document for OCR + NER processing

    Accepts a PDF file. The backend forwards it to pdf_service for OCR, then pipes the page text to ner_service for entity extraction. Returns a job handle for polling.  # noqa: E501

    :param file: PDF file.
    :type file: str
    :param make_public: 
    :type make_public: bool

    :rtype: Union[JobStatus, Tuple[JobStatus, int], Tuple[JobStatus, int, Dict[str, str]]
    """
    return 'do some magic!'


def documents_upload_text_post(file, make_public=None):  # noqa: E501
    """Upload a plain-text document for NER processing

    Accepts a plain-text file. The backend creates a Document record, enqueues a NER job, and returns the job handle. The caller can poll /jobs/{job_id} for status. The &#x60;public&#x60; field on the document is initialised from &#x60;make_public&#x60;.  # noqa: E501

    :param file: Plain-text file (UTF-8).
    :type file: str
    :param make_public: If true, the document is immediately marked public, causing all extracted entities and relationships to be publicly visible. 
    :type make_public: bool

    :rtype: Union[JobStatus, Tuple[JobStatus, int], Tuple[JobStatus, int, Dict[str, str]]
    """
    return 'do some magic!'
