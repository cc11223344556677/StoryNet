import connexion
from typing import Dict
from typing import Tuple
from typing import Union

from openapi_server.models.error_response import ErrorResponse  # noqa: E501
from openapi_server.models.project import Project  # noqa: E501
from openapi_server.models.project_list_response import ProjectListResponse  # noqa: E501
from openapi_server.models.projects_id_put_request import ProjectsIdPutRequest  # noqa: E501
from openapi_server.models.projects_post_request import ProjectsPostRequest  # noqa: E501
from openapi_server import util


def projects_get(page=None, page_size=None):  # noqa: E501
    """List all projects belonging to the authenticated user

     # noqa: E501

    :param page: 
    :type page: int
    :param page_size: 
    :type page_size: int

    :rtype: Union[ProjectListResponse, Tuple[ProjectListResponse, int], Tuple[ProjectListResponse, int, Dict[str, str]]
    """
    return 'do some magic!'


def projects_id_delete(id):  # noqa: E501
    """Delete a project

    Permanently removes the project from MongoDB. Only the owner may delete. # noqa: E501

    :param id: 
    :type id: str

    :rtype: Union[None, Tuple[None, int], Tuple[None, int, Dict[str, str]]
    """
    return 'do some magic!'


def projects_id_get(id):  # noqa: E501
    """Load a saved project by ID

    Returns the full project including the snapshot. The frontend should render the snapshot immediately, then optionally call GET /entities/{id} for each entity to detect changes since the snapshot was taken.  # noqa: E501

    :param id: 
    :type id: str

    :rtype: Union[Project, Tuple[Project, int], Tuple[Project, int, Dict[str, str]]
    """
    return 'do some magic!'


def projects_id_put(id, body):  # noqa: E501
    """Overwrite an existing project snapshot

    Replaces the stored snapshot entirely with a new one. Used when the user saves changes to an existing project. The previous snapshot is not retained (no versioning).  # noqa: E501

    :param id: 
    :type id: str
    :param projects_id_put_request: 
    :type projects_id_put_request: dict | bytes

    :rtype: Union[Project, Tuple[Project, int], Tuple[Project, int, Dict[str, str]]
    """
    projects_id_put_request = body
    if connexion.request.is_json:
        projects_id_put_request = ProjectsIdPutRequest.from_dict(connexion.request.get_json())  # noqa: E501
    return 'do some magic!'


def projects_post(body):  # noqa: E501
    """Create and save a new project snapshot

    Saves the complete current graph state (entities, relationships, and viewport) as a new project in MongoDB. The snapshot is stored in full so the user sees the exact same view on reload.  # noqa: E501

    :param projects_post_request: 
    :type projects_post_request: dict | bytes

    :rtype: Union[Project, Tuple[Project, int], Tuple[Project, int, Dict[str, str]]
    """
    projects_post_request = body
    if connexion.request.is_json:
        projects_post_request = ProjectsPostRequest.from_dict(connexion.request.get_json())  # noqa: E501
    return 'do some magic!'
