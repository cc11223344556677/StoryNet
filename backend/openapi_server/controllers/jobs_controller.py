import connexion
from typing import Dict
from typing import Tuple
from typing import Union

from openapi_server.models.error_response import ErrorResponse  # noqa: E501
from openapi_server.models.job_status import JobStatus  # noqa: E501
from openapi_server.models.jobs_get200_response import JobsGet200Response  # noqa: E501
from openapi_server import util


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
    return 'do some magic!'


def jobs_id_get(id):  # noqa: E501
    """Poll the processing status of a document upload job

    Returns the current status of an async NER or OCR+NER processing job. Only the job owner may poll their own jobs.  # noqa: E501

    :param id: 
    :type id: str

    :rtype: Union[JobStatus, Tuple[JobStatus, int], Tuple[JobStatus, int, Dict[str, str]]
    """
    return 'do some magic!'
