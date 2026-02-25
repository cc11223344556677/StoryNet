import connexion
from typing import Dict
from typing import Tuple
from typing import Union

from openapi_server.models.error_response import ErrorResponse  # noqa: E501
from openapi_server.models.job_status import JobStatus  # noqa: E501
from openapi_server.models.jobs_get200_response import JobsGet200Response  # noqa: E501
from openapi_server.controllers.ftm_utils import _error, current_user_id
from openapi_server.db import get_mongo

#helper
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
    
#endpoints
def jobs_get(status=None, page=None, page_size=None):  # noqa: E501
    """List all processing jobs for the authenticated user

     # noqa: E501

    :param status: 
    :type status: str
    :param page: 
    :type page: int
    :param page_size: 
    :type page_size: int

    :rtype: Union[JobsGet200Response, Tuple[JobsGet200Response, int], Tuple[JobsGet200Response, int, Dict[str, str]]
    """
    user_id = current_user_id()
    mongo = get_mongo()

    page = max(1, page or 1)
    page_size = min(100, max(1, page_size or 20))
    skip = (page - 1) * page_size

    query = {"user_id": user_id}
    
    if status:
        query["status"] = status

    total = mongo.jobs.count_documents(query)
    jobs_cursor = (
        mongo.jobs.find(query)
        .sort("created_at", -1)
        .skip(skip)
        .limit(page_size)
    )
    
    jobs = list(jobs_cursor)

    return JobsGet200Response(
        total=total,
        results=[_job_to_model(j) for j in jobs]
    ), 200


def jobs_id_get(id_):  # noqa: E501
    """Poll the processing status of a document upload job

    Returns the current status of an async NER or OCR+NER processing job. Only the job owner may poll their own jobs.  # noqa: E501

    :param id: 
    :type id: str

    :rtype: Union[JobStatus, Tuple[JobStatus, int], Tuple[JobStatus, int, Dict[str, str]]
    """
    user_id = current_user_id()
    mongo = get_mongo()

    job = mongo.jobs.find_one({"_id": id_})
    if not job:
        return _error("NOT_FOUND", "Job not found", 404)

    doc = mongo.documents.find_one({"_id": job.get("document_id")})
    if not doc or user_id not in doc.get("owner_ids", []):
        return _error("NOT_FOUND", "Job not found", 404)

    return _job_to_model(job), 200
