import logging
from datetime import datetime, timezone

from flask import Flask, jsonify, request

from ner import extract_entities

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger(__name__)

app = Flask(__name__)

def _build_ftm_entity_dict(proxy, confidence: float, provenance: list[dict]) -> dict:
    """
    Serialise a followthemoney EntityProxy into the FtMEntity shape defined
    in the OpenAPI spec.

    The spec shape is:
      { id, schema, caption, properties, confidence, public, owner_ids, provenance,
        first_seen, last_changed }

    - caption is derived from entity.caption (FtM computes it from featured props)
    - public / owner_ids are not known at NER time; the backend sets them later
    - first_seen / last_changed are stamped with the current UTC time
    """
    now = datetime.now(timezone.utc).isoformat()
    data = proxy.to_dict()

    return {
        "id":           data["id"],
        "schema":       data["schema"],
        "caption":      proxy.caption,
        "properties":   data.get("properties", {}),
        "confidence":   round(confidence, 4),
        "public":       False,       # backend will set this
        "owner_ids":    [],          # backend will set this
        "provenance":   provenance,
        "first_seen":   now,
        "last_changed": now,
    }

@app.route("/healthz", methods=["GET"])
def healthz():
    """Kubernetes liveness/readiness probe."""
    return jsonify({"status": "ok"}), 200


@app.route("/ner", methods=["POST"])
def ner_endpoint():
    """
    POST /ner

    Request body (NerRequest):
      {
        "document_id": "...",
        "pages": [
          { "page_number": 1, "text": "..." },   # PDFs
          { "page_number": null, "text": "..." }  # plain-text docs
        ]
      }

    Response body (NerResponse):
      {
        "document_id": "...",
        "entities": [ FtMEntity, ... ]
      }

    Entity deduplication: entities with the same stable FtM ID (hash of
    schema + name) are merged — the highest-confidence occurrence wins and
    all provenance entries are accumulated.
    """
    body = request.get_json(force=True, silent=True)
    if not body:
        return jsonify({"error": "INVALID_REQUEST", "message": "Request body must be JSON."}), 400

    document_id = body.get("document_id")
    pages       = body.get("pages", [])

    if not document_id:
        return jsonify({"error": "VALIDATION_ERROR", "message": "'document_id' is required."}), 422
    if not isinstance(pages, list) or len(pages) == 0:
        return jsonify({"error": "VALIDATION_ERROR", "message": "'pages' must be a non-empty list."}), 422

    # entity_id -> {"proxy": proxy, "confidence": float, "provenance": []}
    merged_entities: dict[str, dict] = {}
    # rel_id -> {"proxy": proxy, "confidence": float, "provenance": []}
    merged_rels: dict[str, dict] = {}

    for page in pages:
        text        = page.get("text", "")
        page_number = page.get("page_number")  # None for plain-text documents

        if not text.strip():
            logger.info("Skipping empty page (page_number=%s)", page_number)
            continue

        provenance_entry = {"document_id": document_id, "page_number": page_number}

        try:
            entity_results, rel_results = extract_entities(
                text=text,
                document_id=document_id,
                page_number=page_number,
            )
        except RuntimeError as exc:
            logger.error(
                "NER failed for document_id=%s page=%s: %s",
                document_id, page_number, exc,
            )
            return jsonify({
                "error": "NER_FAILED",
                "message": str(exc),
            }), 422

        # Merge entities (keep highest confidence, accumulate provenance)
        for proxy, confidence in entity_results:
            eid = proxy.id
            if eid not in merged_entities:
                merged_entities[eid] = {
                    "proxy": proxy,
                    "confidence": confidence,
                    "provenance": [provenance_entry],
                }
            else:
                existing = merged_entities[eid]
                if confidence > existing["confidence"]:
                    existing["confidence"] = confidence
                    existing["proxy"] = proxy
                if provenance_entry not in existing["provenance"]:
                    existing["provenance"].append(provenance_entry)

        # Merge relationships (same logic)
        for proxy, confidence in rel_results:
            rid = proxy.id
            if rid not in merged_rels:
                merged_rels[rid] = {
                    "proxy": proxy,
                    "confidence": confidence,
                    "provenance": [provenance_entry],
                }
            else:
                existing = merged_rels[rid]
                if confidence > existing["confidence"]:
                    existing["confidence"] = confidence
                    existing["proxy"] = proxy
                if provenance_entry not in existing["provenance"]:
                    existing["provenance"].append(provenance_entry)

    # Serialise all node + edge entities into the spec's FtMEntity shape
    all_entities = []
    for item in merged_entities.values():
        all_entities.append(
            _build_ftm_entity_dict(item["proxy"], item["confidence"], item["provenance"])
        )
    for item in merged_rels.values():
        all_entities.append(
            _build_ftm_entity_dict(item["proxy"], item["confidence"], item["provenance"])
        )

    return jsonify({
        "document_id": document_id,
        "entities": all_entities,
    }), 200

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000, debug=False)