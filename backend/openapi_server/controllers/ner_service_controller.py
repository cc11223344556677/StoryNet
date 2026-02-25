import connexion
import json
import datetime
import os
from typing import Dict
from typing import Tuple
from typing import Union
from typing import Optional

from followthemoney import model as ftm_model
from followthemoney.exc import InvalidData
from followthemoney.types import registry

from openapi_server.models.error_response import ErrorResponse  # noqa: E501
from openapi_server.models.ner_request import NerRequest  # noqa: E501
from openapi_server.models.ner_response import NerResponse  # noqa: E501
from openapi_server.controllers.ftm_utils import get_schema
from openapi_server.controllers.ftm_utils import _error

#endpoint
def ner_post(body):  # noqa: E501
    """Extract FtM entities from page text (ner_service)

    Called by the backend with page text (from either direct text upload or OCR output). Returns a flat list of FtM entities, including both node- and edge-type entities, each with a confidence score and provenance. Entity deduplication is handled internally by this service before returning. This endpoint lives on the ner_service server (http://ner-service.app.svc.cluster.local).  # noqa: E501

    :param ner_request: 
    :type ner_request: dict | bytes

    :rtype: Union[NerResponse, Tuple[NerResponse, int], Tuple[NerResponse, int, Dict[str, str]]
    """
    ner_request = body
    if connexion.request.is_json:
        ner_request = NerRequest.from_dict(connexion.request.get_json())  # noqa: E501
    return 'do some magic!'
