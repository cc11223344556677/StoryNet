import connexion
import uuid
import datetime
from typing import Dict
from typing import Tuple
from typing import Union

from openapi_server.models.error_response import ErrorResponse  # noqa: E501
from openapi_server.models.project import Project  # noqa: E501
from openapi_server.models.project_list_response import ProjectListResponse  # noqa: E501
from openapi_server.models.projects_id_put_request import ProjectsIdPutRequest  # noqa: E501
from openapi_server.models.projects_post_request import ProjectsPostRequest  # noqa: E501
from openapi_server.models.project_snapshot import ProjectSnapshot
from openapi_server.db import get_mongo
from openapi_server.controllers.ftm_utils import _error, current_user_id



#helpers
def _snapshot_from_dict(d: dict) -> ProjectSnapshot:
    """Deserialise a raw MongoDB snapshot dict into a ProjectSnapshot model."""
    return ProjectSnapshot(
        entities=d.get("entities", []),
    )


def _project_to_model(p: dict) -> Project:
    snapshot_data = p.get("snapshot", {})
    snapshot = _snapshot_from_dict(snapshot_data)
    return Project(
        id=str(p["_id"]),
        name=p.get("name", ""),
        description=p.get("description"),
        owner_id=p.get("owner_id"),
        snapshot=snapshot,
        created_at=p.get("created_at"),
        updated_at=p.get("updated_at"),
    )

def projects_get(page=None, page_size=None):  # noqa: E501
    """List all projects belonging to the authenticated user

     # noqa: E501

    :param page: 
    :type page: int
    :param page_size: 
    :type page_size: int

    :rtype: Union[ProjectListResponse, Tuple[ProjectListResponse, int], Tuple[ProjectListResponse, int, Dict[str, str]]
    """
    user_id = current_user_id()
    mongo = get_mongo()
    page = max(1, page or 1)
    page_size = min(100, max(1, page_size or 20))
    skip = (page - 1) * page_size

    query = {"owner_id": user_id}
    total = mongo.projects.count_documents(query)
    projects = list(
        mongo.projects.find(query)
        .sort("updated_at", -1)
        .skip(skip)
        .limit(page_size)
    )

    return ProjectListResponse(
        total=total,
        results=[_project_to_model(p) for p in projects]
    ), 200


def projects_id_delete(id_):  # noqa: E501
    """Delete a project

    Permanently removes the project from MongoDB. Only the owner may delete. # noqa: E501

    :param id: 
    :type id: str

    :rtype: Union[None, Tuple[None, int], Tuple[None, int, Dict[str, str]]
    """
    user_id = current_user_id()
    mongo = get_mongo()

    project = mongo.projects.find_one({"_id": id_})
    if not project:
        return _error("NOT_FOUND", "Project not found", 404)
    if project.get("owner_id") != user_id:
        return _error("FORBIDDEN", "You do not own this project", 403)

    mongo.projects.delete_one({"_id": id_})
    return None, 204


def projects_id_get(id_):  # noqa: E501
    """Load a saved project by ID

    Returns the full project including the snapshot. The frontend should render the snapshot immediately, then optionally call GET /entities/{id} for each entity to detect changes since the snapshot was taken.  # noqa: E501

    :param id: 
    :type id: str

    :rtype: Union[Project, Tuple[Project, int], Tuple[Project, int, Dict[str, str]]
    """
    user_id = current_user_id()
    mongo = get_mongo()

    project = mongo.projects.find_one({"_id": id_})
    if not project:
        return _error("NOT_FOUND", "Project not found", 404)
    if project.get("owner_id") != user_id:
        return _error("FORBIDDEN", "You do not have access to this project", 403)

    return _project_to_model(project), 200


def projects_id_put(id_, body):  # noqa: E501
    """Overwrite an existing project snapshot

    Replaces the stored snapshot entirely with a new one. Used when the user saves changes to an existing project. The previous snapshot is not retained (no versioning).  # noqa: E501

    :param id: 
    :type id: str
    :param projects_id_put_request: 
    :type projects_id_put_request: dict | bytes

    :rtype: Union[Project, Tuple[Project, int], Tuple[Project, int, Dict[str, str]]
    """
    user_id = current_user_id()
    mongo = get_mongo()
    now = datetime.datetime.now(datetime.timezone.utc)

    project = mongo.projects.find_one({"_id": id_})
    if not project:
        return _error("NOT_FOUND", "Project not found", 404)
    if project.get("owner_id") != user_id:
        return _error("FORBIDDEN", "You do not own this project", 403)

    if connexion.request.is_json:
        req = ProjectsIdPutRequest.from_dict(connexion.request.get_json())
    else:
        return _error("INVALID_REQUEST", "JSON body required", 422)

    updates = {"updated_at": now}
    if req.name:
        updates["name"] = req.name
    if hasattr(req, "description") and req.description is not None:
        updates["description"] = req.description
    if req.snapshot:
        updates["snapshot"] = req.snapshot.to_dict() if hasattr(req.snapshot, "to_dict") else req.snapshot

    mongo.projects.update_one({"_id": id_}, {"$set": updates})
    updated = mongo.projects.find_one({"_id": id_})
    return _project_to_model(updated), 200


def projects_post(body):  # noqa: E501
    """Create and save a new project snapshot

    Saves the complete current graph state (entities, relationships) as a new project in MongoDB. The snapshot is stored in full so the user sees the exact same view on reload.  # noqa: E501

    :param projects_post_request: 
    :type projects_post_request: dict | bytes

    :rtype: Union[Project, Tuple[Project, int], Tuple[Project, int, Dict[str, str]]
    """
    user_id = current_user_id()
    mongo = get_mongo()
    now = datetime.datetime.now(datetime.timezone.utc)

    if connexion.request.is_json:
        req = ProjectsPostRequest.from_dict(connexion.request.get_json())
    else:
        return _error("INVALID_REQUEST", "JSON body required", 422)

    if not req.name:
        return _error("VALIDATION_ERROR", "Project name is required", 422)
    if not req.snapshot:
        return _error("VALIDATION_ERROR", "Snapshot is required", 422)

    project_id = str(uuid.uuid4())

    # Serialise the snapshot to a plain dict for MongoDB storage.
    # We store entities as raw dicts (the FtM-structured data already lives in Neo4j;
    snapshot_dict = req.snapshot.to_dict() if hasattr(req.snapshot, "to_dict") else req.snapshot

    project_doc = {
        "_id": project_id,
        "name": req.name,
        "description": getattr(req, "description", None),
        "owner_id": user_id,
        "snapshot": snapshot_dict,
        "created_at": now,
        "updated_at": now,
    }
    mongo.projects.insert_one(project_doc)

    return _project_to_model(project_doc), 201
