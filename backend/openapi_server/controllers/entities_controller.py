import connexion
from typing import Dict
from typing import Tuple
from typing import Union
from typing import Optional
import json

from followthemoney import model as ftm_model
from followthemoney.exc import InvalidData

from openapi_server.models.document import Document
from openapi_server.models.document_list_response import DocumentListResponse  # noqa: E501
from openapi_server.models.entity_search_response import EntitySearchResponse  # noqa: E501
from openapi_server.models.error_response import ErrorResponse  # noqa: E501
from openapi_server.models.ft_m_entity import FtMEntity  # noqa: E501
from openapi_server.controllers.ftm_utils import _error, current_user_id
from openapi_server.db import get_neo4j, get_mongo
from openapi_server.controllers.ftm_utils import neo4j_record_to_api_model, get_schema

#helpers
def _records_to_entities(records) -> list:
    """
    Convert a Neo4j result cursor into a list of FtMEntity API models.

    Each record is passed through neo4j_record_to_api_model() which:
      1. Deserialises properties_json.
      2. Calls ftm_model.get_proxy(data, cleaned=True) to reconstruct a
         validated EntityProxy.
      3. Reads proxy.caption and proxy.to_dict() for the API response.

    Records that fail FtM reconstruction are dropped.
    """
    entities = []
    for r in records:
        props = r["props"]
        entity = neo4j_record_to_api_model(props)
        if entity is None:
            print("Skipping Neo4j record with id=%s - FtM reconstruction failed",
                        props.get("id", "?"))
            continue
        entities.append(entity)
    return entities


def _validate_schema_param(schema_name: Optional[str]) -> tuple:
    """
    Validate an optional schema filter parameter against the FtM model.
    Returns (True, None) if valid or absent, (False, error_response) if invalid.
    """
    if schema_name is None:
        return True, None
    if ftm_model.get(schema_name) is None:
        return False, _error(
            "INVALID_SCHEMA",
            f"{schema_name!r} is not a known FtM schema. "
            "See https://followthemoney.tech/explorer/schemata/ for valid values.",
            422,
        )
    return True, None


#endpoints
def entities_id_documents_get(id_, page=None, page_size=None):  # noqa: E501
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
    user_id = current_user_id()
    page = max(1, page or 1)
    page_size = min(100, max(1, page_size or 20))
    skip = (page - 1) * page_size

    driver = get_neo4j()
    mongo = get_mongo()

    with driver.session() as session:
        result = session.run(
            "MATCH (e:Entity {id: $id}) "
            "WHERE e.public = true OR $user_id IN e.owner_ids "
            "RETURN e.provenance_json AS provenance_json",
            id=id_, user_id=user_id,
        ).single()

    if not result:
        return _error("ENTITY_NOT_FOUND", "Entity not found or not visible", 404)

    try:
        provenance = json.loads(result["provenance_json"] or "[]")
    except (json.JSONDecodeError, TypeError):
        provenance = []

    doc_ids = list({p["document_id"] for p in provenance if "document_id" in p})
    if not doc_ids:
        return DocumentListResponse(total=0, page=page, page_size=page_size, results=[]), 200

    visibility = {"$or": [{"public": True}, {"owner_ids": user_id}]}
    query = {"_id": {"$in": doc_ids}, **visibility}

    total = mongo.documents.count_documents(query)
    docs = list(mongo.documents.find(query).skip(skip).limit(page_size))

    results = [
        Document(
            id=str(d["_id"]),
            filename=d.get("filename", ""),
            type=d.get("type", "text"),
            status=d.get("status", "completed"),
            public=d.get("public", False),
            owner_ids=d.get("owner_ids", []),
            entity_count=d.get("entity_count", 0),
            created_at=d.get("created_at"),
            error_message=d.get("error_message"),
        )
        for d in docs
    ]
    return DocumentListResponse(total=total, page=page, page_size=page_size, results=results), 200



def entities_id_get(id_):  # noqa: E501
    """Get a specific entity by ID

    Returns the current live state of an entity from Neo4j. Use this endpoint when reopening a project to check whether saved entities have changed since the project snapshot was taken. Returns 404 if the entity does not exist or is not visible to the user.  # noqa: E501

    :param id: 
    :type id: str

    :rtype: Union[FtMEntity, Tuple[FtMEntity, int], Tuple[FtMEntity, int, Dict[str, str]]
    """
    user_id = current_user_id() #not sure this is correct, may change if can't find user
    driver = get_neo4j()

    with driver.session() as session:
        result = session.run(
            "MATCH (e:Entity {id: $id}) "
            "WHERE e.public = true OR $user_id IN e.owner_ids "
            "RETURN properties(e) AS props",
            id=id_, user_id=user_id,
        ).single()

    if not result:
        return _error("ENTITY_NOT_FOUND", "Entity not found or not visible", 404)

    entity = neo4j_record_to_api_model(result["props"])
    if entity is None:
        return _error(
            "INVALID_ENTITY",
            "Entity data could not be validated against the FtM schema",
            500,
        )
    return entity, 200


def entities_id_relationships_get(id_, depth=None, _schema=None, page=None, page_size=None):  # noqa: E501
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
    if _schema is not None:
        ftm_schema = ftm_model.get(_schema)
        if ftm_schema is None:
            return _error(
                "INVALID_SCHEMA",
                f"{_schema!r} is not a known FtM schema.",
                422,
            )
        if ftm_schema.edge_source is None:
            return _error(
                "INVALID_SCHEMA",
                f"{_schema!r} is a node-type schema, not a relationship schema. "
                "Use an edge-type schema such as Ownership, Membership, Directorship, etc.",
                422,
            )

    user_id = current_user_id()
    page = max(1, page or 1)
    page_size = min(100, max(1, page_size or 20))
    skip = (page - 1) * page_size
    depth = max(1, min(5, depth or 1))

    driver = get_neo4j()

    with driver.session() as session:
        root = session.run(
            "MATCH (e:Entity {id: $id}) "
            "WHERE e.public = true OR $user_id IN e.owner_ids "
            "RETURN e.id AS eid",
            id=id_, user_id=user_id,
        ).single()

        if not root:
            return _error("ENTITY_NOT_FOUND", "Entity not found or not visible", 404)

        schema_filter = "AND r.schema = $schema " if _schema else ""
        params = {
            "id": id_,
            "user_id": user_id,
            "skip": skip,
            "limit": page_size,
        }
        if _schema:
            params["schema"] = ftm_model.get(_schema).name

        if depth == 1:
            base = (
                f"MATCH (r:Entity) WHERE "
                f"(r.public = true OR $user_id IN r.owner_ids) "
                f"AND $id IN r.entity_refs "
                f"{schema_filter}"
            )
            count_q = base + "RETURN count(r) AS total"
            data_q = base + "RETURN properties(r) AS props ORDER BY r.schema SKIP $skip LIMIT $limit"
        else:
            base = (
                f"MATCH path = (start:Entity {{id: $id}})-[:RELATED*1..{depth}]-(neighbor:Entity) "
                f"WITH collect(DISTINCT neighbor.id) + [$id] AS ids "
                f"MATCH (r:Entity) WHERE "
                f"(r.public = true OR $user_id IN r.owner_ids) "
                f"AND any(eid IN ids WHERE eid IN r.entity_refs) "
                f"{schema_filter}"
            )
            count_q = base + "RETURN count(DISTINCT r) AS total"
            data_q = (
                base
                + "RETURN DISTINCT properties(r) AS props "
                + "ORDER BY r.schema SKIP $skip LIMIT $limit"
            )

        total = session.run(count_q, **params).single()["total"]
        records = session.run(data_q, **params)
        entities = _records_to_entities(records)

    return EntitySearchResponse(total=total, page=page, page_size=page_size, results=entities), 200



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
    valid, err = _validate_schema_param(_schema)
    if not valid:
        return err

    user_id = current_user_id()
    page = max(1, page or 1)
    page_size = min(100, max(1, page_size or 20))
    skip = (page - 1) * page_size
    fuzzy = fuzzy if fuzzy is not None else True

    driver = get_neo4j()
    params = {"user_id": user_id, "skip": skip, "limit": page_size}
    conditions = ["(e.public = true OR $user_id IN e.owner_ids)"]

    if _schema:
        canonical_schema = ftm_model.get(_schema).name
        conditions.append("e.schema = $schema")
        params["schema"] = canonical_schema

    if q:
        if fuzzy:
            conditions.append(
                "(toLower(e.caption) CONTAINS toLower($q) "
                "OR any(v IN e.name_search WHERE toLower(v) CONTAINS toLower($q)))"
            )
        else:
            conditions.append("toLower(e.caption) = toLower($q)")
        params["q"] = q

    where = " AND ".join(conditions)

    with driver.session() as session:
        total = session.run(
            f"MATCH (e:Entity) WHERE {where} RETURN count(e) AS total", **params
        ).single()["total"]

        records = session.run(
            f"MATCH (e:Entity) WHERE {where} "
            f"RETURN properties(e) AS props "
            f"ORDER BY e.caption SKIP $skip LIMIT $limit",
            **params,
        )
        entities = _records_to_entities(records)

    return EntitySearchResponse(total=total, page=page, page_size=page_size, results=entities), 200



def relationships_id_documents_get(id_, page=None, page_size=None):  # noqa: E501
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
    return entities_id_documents_get(id_, page=page, page_size=page_size)


def relationships_id_get(id_):  # noqa: E501
    """Get a specific interstitial (relationship) entity by ID

    Convenience endpoint equivalent to GET /entities/{id}, but semantically signals that the caller expects an Interval-subtype entity. Returns the same FtMEntity schema. Visibility rules apply.  # noqa: E501

    :param id: 
    :type id: str

    :rtype: Union[FtMEntity, Tuple[FtMEntity, int], Tuple[FtMEntity, int, Dict[str, str]]
    """
    user_id = current_user_id()
    driver = get_neo4j()

    with driver.session() as session:
        result = session.run(
            "MATCH (e:Entity {id: $id}) "
            "WHERE e.public = true OR $user_id IN e.owner_ids "
            "RETURN properties(e) AS props",
            id=id_, user_id=user_id,
        ).single()

    if not result:
        return _error("NOT_FOUND", "Relationship entity not found or not visible", 404)

    entity = neo4j_record_to_api_model(result["props"])
    if entity is None:
        return _error("INVALID_ENTITY", "Entity data failed FtM validation", 500)

    # Confirm this is actually an edge-type schema
    ftm_schema = ftm_model.get(entity.schema)
    if ftm_schema is None or ftm_schema.edge_source is None:
        return _error(
            "NOT_FOUND",
            f"Entity {id!r} exists but is a node-type entity ({entity.schema}), "
            "not a relationship entity. Use GET /entities/{id} instead.",
            404,
        )

    return entity, 200
