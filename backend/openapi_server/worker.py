import time
import datetime
import json
import os
import requests
import logging
from openapi_server.db import get_mongo, get_neo4j
from openapi_server.controllers.ftm_utils import proxy_to_neo4j_params, get_schema
from followthemoney import model as ftm_model
from followthemoney.exc import InvalidData

PDF_SERVICE_URL = os.environ.get("PDF_SERVICE_URL", "http://pdf-service.app.svc.cluster.local:5001")
NER_SERVICE_URL = os.environ.get("NER_SERVICE_URL", "http://ner-service.app.svc.cluster.local:5000")
POLL_INTERVAL = int(os.environ.get("WORKER_POLL_INTERVAL", "5"))


# ── Neo4j helpers ─────────────────────────────────────────────────────────────

def _upsert_entity(session, entity: dict, document_id: str, owner_ids: list, public: bool):
    """
    Upsert an FtM entity node into Neo4j.

    Reconstructs an EntityProxy via FtM so that property normalisation is
    applied before storage. Uses proxy_to_neo4j_params() to produce the
    parameter dict, ensuring field names match exactly what the read path
    (ftm_utils.neo4j_record_to_proxy) expects:
      - e.properties_json  (not e.properties)
      - e.provenance_json  (not e.provenance)

    Provenance is merged as a JSON-encoded list of unique document+page pairs
    rather than using a Cypher reduce() over JSON strings (which Neo4j cannot
    do natively). Instead we read existing provenance, merge in Python, and
    write back.
    """

    schema_name = entity.get("schema", "")
    ftm_schema = ftm_model.get(schema_name)
    if ftm_schema is None:
        print(f"Skipping entity with unknown schema {schema_name}")
        return

    # Reconstruct proxy from the NER-service output so we write validated data
    try:
        proxy = ftm_model.get_proxy({
            "id": entity["id"],
            "schema": schema_name,
            "properties": entity.get("properties", {}),
        }, cleaned=True)
    except InvalidData as exc:
        print(f"Skipping invalid entity {entity.get("id")}: {exc}")
        return

    new_provenance = entity.get("provenance", [])
    confidence = float(entity.get("confidence", 0.5))

    # Fetch existing provenance so we can merge in Python rather than in Cypher
    existing = session.run(
        "MATCH (e:Entity) WHERE e.id = $id RETURN e.provenance_json AS pj, e.owner_ids AS oids",
        id=proxy.id,
    ).single()

    if existing:
        try:
            existing_prov = json.loads(existing["pj"] or "[]")
        except (json.JSONDecodeError, TypeError):
            existing_prov = []
        existing_owners = list(existing["oids"] or [])

        # Merge provenance: deduplicate by (document_id, page_number)
        seen = {(p["document_id"], p.get("page_number")) for p in existing_prov}
        for p in new_provenance:
            key = (p["document_id"], p.get("page_number"))
            if key not in seen:
                existing_prov.append(p)
                seen.add(key)
        merged_provenance = existing_prov

        # Merge owner_ids
        merged_owners = list(set(existing_owners + owner_ids))
        merged_public = existing.get("public", False) or public
    else:
        merged_provenance = new_provenance
        merged_owners = owner_ids
        merged_public = public

    params = proxy_to_neo4j_params(proxy, confidence, merged_provenance, merged_owners, merged_public)

    session.run(
        """
        MERGE (e:Entity {id: $id})
        ON CREATE SET
          e.schema          = $schema,
          e.caption         = $caption,
          e.properties_json = $properties_json,
          e.provenance_json = $provenance_json,
          e.confidence      = $confidence,
          e.public          = $public,
          e.owner_ids       = $owner_ids,
          e.entity_refs     = $entity_refs,
          e.name_search     = $name_search,
          e.first_seen      = $now,
          e.last_changed    = $now
        ON MATCH SET
          e.last_changed    = $now,
          e.caption         = $caption,
          e.properties_json = $properties_json,
          e.provenance_json = $provenance_json,
          e.confidence      = CASE WHEN $confidence > e.confidence THEN $confidence ELSE e.confidence END,
          e.public          = $public,
          e.owner_ids       = $owner_ids,
          e.entity_refs     = $entity_refs,
          e.name_search     = $name_search
        """,
        **params,
    )

    # Create RELATED edges to all entities this one references.
    # These power the variable-length path queries in entities_controller.
    for ref_id in params["entity_refs"]:
        session.run(
            """
            MATCH (a:Entity), (b:Entity)
            WHERE a.id = $a_id AND b.id = $b_id
            MERGE (a)-[:RELATED]-(b)
            """,
            a_id=proxy.id,
            b_id=ref_id,
        )


def _update_job(mongo, job_id: str, **fields):
    fields["updated_at"] = datetime.datetime.utcnow()
    mongo.jobs.update_one({"_id": job_id}, {"$set": fields})


def _update_document(mongo, doc_id: str, **fields):
    mongo.documents.update_one({"_id": doc_id}, {"$set": fields})


def _run_ner(document_id: str, pages: list[dict]) -> list[dict]:
    """Call ner_service and return entity dicts."""
    payload = {
        "document_id": document_id,
        "pages": pages,
    }
    resp = requests.post(f"{NER_SERVICE_URL}/ner", json=payload, timeout=300)
    resp.raise_for_status()
    return resp.json().get("entities", [])


def _run_ocr(document_id: str, file_base64: str) -> list[dict]:
    """Call pdf_service and return page dicts."""
    payload = {
        "document_id": document_id,
        "file_base64": file_base64,
        "mime_type": "application/pdf",
    }
    resp = requests.post(f"{PDF_SERVICE_URL}/pdf", json=payload, timeout=300)
    resp.raise_for_status()
    return resp.json().get("pages", [])


def _process_job(mongo, neo4j_driver, job: dict):
    job_id = str(job["_id"])
    doc_id = job["document_id"]
    doc_type = job.get("doc_type", "text")

    print(f"Processing job {job_id} (doc={doc_id}, type={doc_type})")

    doc = mongo.documents.find_one({"_id": doc_id})
    if not doc:
        _update_job(mongo, job_id, status="failed", message="Document not found")
        return

    owner_ids = doc.get("owner_ids", [])
    public = doc.get("public", False)

    try:
        if doc_type == "pdf":
            # Step 1: OCR
            _update_job(mongo, job_id, status="ocr_processing", progress=10)
            _update_document(mongo, doc_id, status="ocr_processing")

            pdf_record = mongo.document_pdfs.find_one({"_id": doc_id})
            if not pdf_record:
                raise RuntimeError("PDF binary not found in database")

            pages = _run_ocr(doc_id, pdf_record["file_base64"])
            print(f"OCR complete: {len(pages)} pages")

            # Cache extracted text
            mongo.document_texts.update_one(
                {"_id": doc_id},
                {"$set": {"pages": pages}},
                upsert=True,
            )
        else:
            # Text doc: fetch stored pages
            text_record = mongo.document_texts.find_one({"_id": doc_id})
            if not text_record:
                raise RuntimeError("Text content not found in database")
            pages = text_record.get("pages", [])

        # Step 2: NER
        _update_job(mongo, job_id, status="ner_processing", progress=40)
        _update_document(mongo, doc_id, status="ner_processing")

        entities = _run_ner(doc_id, pages)
        print(f"NER complete: {len(entities)} entities extracted")

        # Step 3: Write to Neo4j
        _update_job(mongo, job_id, progress=80, message=f"Writing {len(entities)} entities")
        with neo4j_driver.session() as session:
            for entity in entities:
                _upsert_entity(session, entity, doc_id, owner_ids, public)

        # Step 4: Mark complete
        _update_job(mongo, job_id, status="completed", progress=100, message=None)
        _update_document(mongo, doc_id, status="completed", entity_count=len(entities))
        print(f"Job {job_id} completed successfully")

    except requests.HTTPError as exc:
        msg = f"Service call failed: {exc}"
        print(f"Job {job_id} failed: {msg}")
        _update_job(mongo, job_id, status="failed", message=msg)
        _update_document(mongo, doc_id, status="failed", error_message=msg)

    except Exception as exc:
        msg = str(exc)
        print(f"Job {job_id} failed: {msg}")
        _update_job(mongo, job_id, status="failed", message=msg)
        _update_document(mongo, doc_id, status="failed", error_message=msg)


def run_worker(app):
    print("StoryNet worker started")
    with app.app_context():
        mongo = get_mongo()
        neo4j_driver = get_neo4j()

        while True:
            # Claim a queued job atomically
            job = mongo.jobs.find_one_and_update(
                {"status": "queued"},
                {"$set": {"status": "ocr_processing", "updated_at": datetime.datetime.utcnow()}},
                sort=[("created_at", 1)],
            )
            if job:
                _process_job(mongo, neo4j_driver, job)
            else:
                time.sleep(POLL_INTERVAL)


if __name__ == "__main__":
    import sys
    sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    from openapi_server import create_app  # adjust to your app factory name
    application = create_app()
    run_worker(application)