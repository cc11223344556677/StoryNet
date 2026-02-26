import connexion
from typing import Dict
from typing import Tuple
from typing import Union
from typing import Optional

import uuid
import datetime
import base64
import json

from followthemoney import model as ftm_model

from openapi_server.models.document import Document  # noqa: E501
from openapi_server.models.document_list_response import DocumentListResponse  # noqa: E501
from openapi_server.models.documents_id_patch_request import DocumentsIdPatchRequest  # noqa: E501
from openapi_server.models.entity_search_response import EntitySearchResponse  # noqa: E501
from openapi_server.models.error_response import ErrorResponse  # noqa: E501
from openapi_server.models.job_status import JobStatus  # noqa: E501
from openapi_server.db import get_mongo, get_neo4j
from openapi_server.controllers.ftm_utils import neo4j_record_to_api_model
from openapi_server.controllers.ftm_utils import _error, current_user_id

#helpers
def _mongo_doc_to_model(d: dict) -> Document:
    return Document(
        id=str(d["_id"]),
        filename=d.get("filename", ""),
        type=d.get("type", "text"),
        status=d.get("status", "queued"),
        public=d.get("public", False),
        owner_ids=d.get("owner_ids", []),
        entity_count=d.get("entity_count", 0),
        created_at=d.get("created_at"),
        error_message=d.get("error_message"),
    )


def _job_to_model(j: dict) -> JobStatus:
    return JobStatus(
        job_id=str(j["_id"]),
        document_id=j.get("document_id"),
        status=j.get("status", "queued"),
        progress=j.get("progress", 0),
        message=j.get("message"),
        created_at=j.get("created_at"),
        updated_at=j.get("updated_at"),
    )


def _enqueue_job(mongo, user_id, document_id: str, doc_type: str) -> dict:
    """Insert a job record into MongoDB for the background worker to pick up."""
    now = datetime.datetime.now(datetime.timezone.utc)
    job = {
        "_id": str(uuid.uuid4()),
        "user_id": user_id,
        "document_id": document_id,
        "status": "queued",
        "progress": 0,
        "message": None,
        "doc_type": doc_type,
        "created_at": now,
        "updated_at": now,
    }
    mongo.jobs.insert_one(job)
    return job


def _validate_schema_filter(schema_name: Optional[str]):
    """
    Validate an optional FtM schema name query parameter.
    Returns (canonical_name, None) on success or (None, error_response) on failure.
    """
    if schema_name is None:
        return None, None
    ftm_schema = ftm_model.get(schema_name)
    if ftm_schema is None:
        return None, _error(
            "INVALID_SCHEMA",
            f"{schema_name!r} is not a known FtM schema. "
            "See https://followthemoney.tech/explorer/schemata/ for valid values.",
            422,
        )
    # Use the canonical schema name (normalises casing)
    return ftm_schema.name, None

#endpoints
def documents_id_delete(id_):  # noqa: E501
    """Remove the authenticated user'ss ownership of a document

    Removes the calling user from owner_ids. If no owners remain, the document and all orphaned entities are permanently deleted. If other owners remain, those owners and the document persist.  # noqa: E501

    :param id: 
    :type id: str

    :rtype: Union[None, Tuple[None, int], Tuple[None, int, Dict[str, str]]
    """
    user_id = current_user_id()
    mongo = get_mongo()
    driver = get_neo4j()

    doc = mongo.documents.find_one({"_id": id_})
    if not doc:
        return _error("NOT_FOUND", "Document not found", 404)
    if user_id not in doc.get("owner_ids", []):
        return _error("FORBIDDEN", "You do not own this document", 403)

    remaining_owners = [oid for oid in doc.get("owner_ids", []) if oid != user_id]

    if remaining_owners:
        # Other owners remain – just remove this user
        mongo.documents.update_one({"_id": id_}, {"$set": {"owner_ids": remaining_owners}})
        with driver.session() as session:
            session.run(
                """
                MATCH (e:Entity)
                "WHERE e.provenance_json CONTAINS $doc_id "
                SET e.owner_ids = [x IN e.owner_ids WHERE x <> $user_id]
                """,
                doc_id=id_, user_id=user_id,
            )
    else:
        # Last owner – delete document and orphaned entities from Neo4j
        mongo.documents.delete_one({"_id": id_})
        mongo.document_texts.delete_one({"_id": id_})
        mongo.document_pdfs.delete_one({"_id": id_})
        mongo.jobs.delete_many({"document_id": id_})

        with driver.session() as session:
            # Delete entities whose only provenance is this document
            session.run(
                """
                MATCH (e:Entity)
                "WHERE e.provenance_json CONTAINS $doc_id "
                DETACH DELETE e
                """,
                doc_id=id_,
            )
            # For entities with mixed provenance, strip this document from their records
            session.run(
                """
                MATCH (e:Entity)
                "WHERE e.provenance_json CONTAINS $doc_id "
                SET e.provenance_json  = [p IN e.provenance_json WHERE p.document_id <> $doc_id],
                    e.owner_ids   = [x IN e.owner_ids WHERE x <> $user_id]
                """,
                doc_id=id_,
            )

    return None, 204


def documents_id_entities_get(id_, _schema=None, page=None, page_size=None):  # noqa: E501
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
    user_id = current_user_id()
    mongo = get_mongo()
    driver = get_neo4j()
    page = max(1, page or 1)
    page_size = min(100, max(1, page_size or 20))
    skip = (page - 1) * page_size

    # Validate the schema filter via FtM before touching Neo4j
    canonical_schema, err = _validate_schema_filter(_schema)
    if err:
        return err

    doc = mongo.documents.find_one({"_id": id_})
    if not doc:
        return _error("NOT_FOUND", "Document not found", 404)
    if not doc.get("public") and user_id not in doc.get("owner_ids", []):
        return _error("FORBIDDEN", "You do not have access to this document", 403)

    schema_filter = "AND e.schema = $schema " if canonical_schema else ""
    params = {
        "doc_id": id_,
        "user_id": user_id,
        "skip": skip,
        "limit": page_size,
    }
    if canonical_schema:
        params["schema"] = canonical_schema

    with driver.session() as session:
        count_result = session.run(
            f"MATCH (e:Entity) "
            f"WHERE e.provenance_json CONTAINS $doc_id "
            f"AND (e.public = true OR $user_id IN e.owner_ids) "
            f"{schema_filter}"
            f"RETURN count(e) AS total",
            **params,
        ).single()
        total = count_result["total"] if count_result else 0

        records = session.run(
            f"MATCH (e:Entity) "
            f"WHERE e.provenance_json CONTAINS $doc_id "
            f"AND (e.public = true OR $user_id IN e.owner_ids) "
            f"{schema_filter}"
            f"RETURN properties(e) AS props "
            f"ORDER BY e.caption SKIP $skip LIMIT $limit",
            **params,
        )

        # Reconstruct each entity through FtM (get_proxy → to_dict → FtMEntity)
        entities = []
        for r in records:
            entity = neo4j_record_to_api_model(r["props"])
            if entity is None:
                print(f"Skipping entity in document {id_} FtM reconstruction failed")
                continue
            entities.append(entity)

    return EntitySearchResponse(
        total=total, page=page, page_size=page_size, results=entities
    ), 200


def documents_id_get(id_):  # noqa: E501
    """Get metadata for a specific document

    Returns 404 if the document is not visible to the authenticated user. # noqa: E501

    :param id: 
    :type id: str

    :rtype: Union[Document, Tuple[Document, int], Tuple[Document, int, Dict[str, str]]
    """
    user_id = current_user_id()
    mongo = get_mongo()

    doc = mongo.documents.find_one({"_id": id_})
    if not doc:
        return _error("NOT_FOUND", "Document not found", 404)
    if not doc.get("public") and user_id not in doc.get("owner_ids", []):
        return _error("FORBIDDEN", "You do not have access to this document", 403)
    return _mongo_doc_to_model(doc), 200


def documents_id_patch(id_, body):  # noqa: E501 body not used, remove?
    """Update document metadata

    Allows an owner to update mutable fields. The most important use case is releasing a document publicly (&#x60;public: true&#x60;). Any owner may set &#x60;public&#x60; to true; the change propagates to all entities and relationships whose sole source is this document. Only owners may call this endpoint.  # noqa: E501

    :param id: 
    :type id: str
    :param documents_id_patch_request: 
    :type documents_id_patch_request: dict | bytes

    :rtype: Union[Document, Tuple[Document, int], Tuple[Document, int, Dict[str, str]]
    """
    user_id = current_user_id()
    mongo = get_mongo()
    driver = get_neo4j()

    doc = mongo.documents.find_one({"_id": id_})
    if not doc:
        return _error("NOT_FOUND", "Document not found", 404)
    if user_id not in doc.get("owner_ids", []):
        return _error("FORBIDDEN", "Only owners may update this document", 403)

    if connexion.request.is_json:
        patch = DocumentsIdPatchRequest.from_dict(connexion.request.get_json())
    else:
        return _error("INVALID_REQUEST", "JSON body required", 422)

    updates = {}
    if patch.public is not None:
        updates["public"] = patch.public

    if not updates:
        return _mongo_doc_to_model(doc), 200

    mongo.documents.update_one({"_id": id_}, {"$set": updates})

    if "public" in updates:
        new_public = updates["public"]
        with driver.session() as session:
            # Cascade to entities solely sourced from this document
            session.run(
                """
                MATCH (e:Entity)
                "WHERE e.provenance_json CONTAINS $doc_id "
                SET e.public = $public
                """,
                doc_id=id,
                public=new_public,
            )

    updated = mongo.documents.find_one({"_id": id_})
    return _mongo_doc_to_model(updated), 200


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
    user_id = current_user_id()
    mongo = get_mongo()
    page = max(1, page or 1)
    page_size = min(100, max(1, page_size or 20))
    skip = (page - 1) * page_size

    query = {"owner_ids": user_id}
    if status:
        query["status"] = status
    if type:
        query["type"] = type

    total = mongo.documents.count_documents(query)
    docs = list(mongo.documents.find(query).skip(skip).limit(page_size).sort("created_at", -1))
    return DocumentListResponse(
        total=total, page=page, page_size=page_size,
        results=[_mongo_doc_to_model(d) for d in docs],
    ), 200


def documents_upload_pdf_post(file, make_public=None):  # noqa: E501
    """Upload a PDF document for OCR + NER processing

    Accepts a PDF file. The backend forwards it to pdf_service for OCR, then pipes the page text to ner_service for entity extraction. Returns a job handle for polling.  # noqa: E501

    :param file: PDF file.
    :type file: str
    :param make_public: 
    :type make_public: bool

    :rtype: Union[JobStatus, Tuple[JobStatus, int], Tuple[JobStatus, int, Dict[str, str]]
    """
    user_id = current_user_id()
    mongo = get_mongo()
    now = datetime.datetime.now(datetime.timezone.utc)
    make_public = bool(make_public)

    file_obj = connexion.request.files.get("file")
    if not file_obj:
        return _error("NO_FILE", "No file provided", 422)

    filename = file_obj.filename or "upload.pdf"
    content_type = file_obj.content_type or ""
    if "pdf" not in content_type.lower() and not filename.lower().endswith(".pdf"):
        return _error("UNSUPPORTED_MEDIA_TYPE", "Only PDF files are accepted", 415)

    pdf_bytes = file_obj.read()
    if not pdf_bytes:
        return _error("EMPTY_FILE", "Uploaded PDF is empty", 422)

    doc_id = str(uuid.uuid4())
    mongo.documents.insert_one({
        "_id": doc_id,
        "filename": filename,
        "type": "pdf",
        "status": "queued",
        "public": make_public,
        "owner_ids": [user_id],
        "entity_count": 0,
        "created_at": now,
        "error_message": None,
    })
    # Store raw PDF bytes (base64) for the worker to forward to pdf_service
    mongo.document_pdfs.insert_one({
        "_id": doc_id,
        "file_base64": base64.b64encode(pdf_bytes).decode("utf-8"),
        "mime_type": "application/pdf",
    })
    job = _enqueue_job(mongo, user_id, doc_id, "pdf")
    return _job_to_model(job), 202


def documents_upload_text_post(file, make_public=None):  # noqa: E501
    """Upload a plain-text document for NER processing

    Accepts a plain-text file. The backend creates a Document record, enqueues a NER job, and returns the job handle. The caller can poll /jobs/{job_id} for status. The &#x60;public&#x60; field on the document is initialised from &#x60;make_public&#x60;.  # noqa: E501

    :param file: Plain-text file (UTF-8).
    :type file: str
    :param make_public: If true, the document is immediately marked public, causing all extracted entities and relationships to be publicly visible. 
    :type make_public: bool

    :rtype: Union[JobStatus, Tuple[JobStatus, int], Tuple[JobStatus, int, Dict[str, str]]
    """
    user_id = current_user_id()
    mongo = get_mongo()
    now = datetime.datetime.now(datetime.timezone.utc)
    make_public = bool(make_public)

    file_obj = connexion.request.files.get("file")
    if not file_obj:
        return _error("NO_FILE", "No file provided", 422)

    filename = file_obj.filename or "upload.txt"
    try:
        text_content = file_obj.read().decode("utf-8")
    except UnicodeDecodeError:
        return _error("DECODE_ERROR", "File must be valid UTF-8 text", 422)

    if not text_content.strip():
        return _error("EMPTY_FILE", "Uploaded file is empty", 422)

    doc_id = str(uuid.uuid4())
    mongo.documents.insert_one({
        "_id": doc_id,
        "filename": filename,
        "type": "text",
        "status": "queued",
        "public": make_public,
        "owner_ids": [user_id],
        "entity_count": 0,
        "created_at": now,
        "error_message": None,
    })
    # Store raw text pages for the worker
    mongo.document_texts.insert_one({
        "_id": doc_id,
        "pages": [{"page_number": None, "text": text_content}],
    })
    job = _enqueue_job(mongo, user_id, doc_id, "text")
    return _job_to_model(job), 202
