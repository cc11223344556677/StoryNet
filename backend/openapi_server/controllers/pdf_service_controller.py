import connexion
from typing import Dict
from typing import Tuple
from typing import Union

from openapi_server.models.error_response import ErrorResponse  # noqa: E501
from openapi_server.models.ocr_request import OcrRequest  # noqa: E501
from openapi_server.models.ocr_response import OcrResponse  # noqa: E501
from openapi_server import util


def pdf_post(body):  # noqa: E501
    """Extract text from a PDF (pdf_service)

    Called by the backend after receiving a PDF upload. Returns per-page extracted text which is then forwarded to the ner_service. This endpoint lives on the pdf_service server (http://pdf-service.app.svc.cluster.local).  # noqa: E501

    :param ocr_request: 
    :type ocr_request: dict | bytes

    :rtype: Union[OcrResponse, Tuple[OcrResponse, int], Tuple[OcrResponse, int, Dict[str, str]]
    """
    ocr_request = body
    if connexion.request.is_json:
        ocr_request = OcrRequest.from_dict(connexion.request.get_json())  # noqa: E501
    return 'do some magic!'
