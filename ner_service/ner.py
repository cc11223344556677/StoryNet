import json
import re
import logging
import difflib
from typing import Optional

import ollama
from followthemoney import model as ftm_model

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

MODEL_NAME = "qwen2.5:7b-instruct-q4_K_M"
#MODEL_NAME = "mistral:7b-instruct-q4_K_M"
#MODEL_NAME = "llama3.1:8b-instruct-q4_K_M"
#MODEL_NAME = "gemma3:12b-it-qat"
#TO SWITCH MODEL YOU ALSO NEED TO UPDATE THE DOCKERFILE AND MANIFEST

MAX_RETRIES = 3

FTM_ENTITY_TYPES = [
    "Address", "Airplane", "Article", "Asset", "Audio", "BankAccount",
    "Call", "Company", "Contract", "ContractAward", "CourtCase",
    "CryptoWallet", "Document", "Documentation", "EconomicActivity",
    "Email", "Event", "Family", "Folder", "HyperText", "Identification",
    "Image", "Loan", "License", "Message", "Note", "Organization",
    "Package", "Page", "Passport", "Payment", "Person", "Position",
    "Project", "PublicBody", "PlainText", "RealEstate", "Security",
    "Sanction", "Table", "TaxRoll", "Thing", "Transfer", "UserAccount",
    "Vehicle", "Vessel", "Video", "Workbook",
]

FTM_CONNECTION_TYPES = [
    "Associate", "Debt", "Directorship", "Employment", "Membership",
    "Occupancy", "Ownership", "Payment", "ProjectParticipant",
    "Representation", "Similar", "Succession",
]

_ENTITY_LIST = ", ".join(FTM_ENTITY_TYPES)
_CONN_LIST   = ", ".join(FTM_CONNECTION_TYPES)

# Per-schema property reference injected into the prompt.
# Only the properties most likely to appear in investigative documents are
# listed here; the full FtM schema has many more.  Property names use the
# short form (no "Schema:" prefix) as that is what entity.add() accepts.
# All values must be arrays of strings in the final JSON.
_SCHEMA_PROPERTIES = """\
PROPERTY REFERENCE — use ONLY property names listed under the entity's type.
All property values must be arrays of strings (even single values).
Omit a property entirely if you have no data for it.

NODE ENTITY PROPERTIES
======================

Person
  name, alias, nationality, citizenship, country, birthDate, birthPlace,
  birthCountry, deathDate, firstName, middleName, lastName, title,
  position, gender, passportNumber, idNumber, taxNumber, phone, email,
  website, address, summary, description, political, education, religion

Organization / Company / PublicBody / LegalEntity  (shared set)
  name, alias, country, jurisdiction, mainCountry, legalForm, status,
  sector, incorporationDate, dissolutionDate, registrationNumber, taxNumber,
  vatCode, idNumber, leiCode, swiftBic, email, phone, website, address,
  summary, description, abbreviation, classification

Address
  name, full, street, city, postalCode, region, state, country, summary

Vessel
  name, alias, country, flag, imoNumber, mmsi, registrationNumber,
  buildDate, type, summary

Airplane / Vehicle
  name, alias, country, registrationNumber, serialNumber, type, model,
  buildDate, summary

BankAccount
  name, iban, accountNumber, bankName, country, currency, summary

Passport / Identification
  number, country, authority, type, startDate, endDate, summary

Sanction
  program, country, authority, startDate, endDate, reason, summary

Payment / Debt  (also used for connections — see below)
  amount, currency, amountUsd, date, startDate, endDate, summary

Position
  name, country, summary, description, inceptionDate, dissolutionDate

RELATIONSHIP / CONNECTION PROPERTIES
=====================================
All connections also accept: startDate, endDate, date, summary, role, status.

Ownership    → extra: percentage, sharesCount, sharesValue, sharesCurrency, ownershipType
Directorship → extra: role, status
Employment   → extra: role, status
Membership   → extra: role, status
Family       → extra: relationship  (e.g. "mother", "brother", "spouse")
Associate    → extra: relationship  (e.g. "business partner", "aide")
Debt         → extra: amount, currency, amountUsd
Payment      → extra: amount, currency, amountUsd
"""

EXTRACTION_PROMPT = f"""\
You are an investigative journalist extracting structured data for a \
financial-crime graph database. Analyse the document text below and return \
a single JSON object — nothing else, no markdown fences, no prose.

The JSON must have exactly two top-level keys: "entities" and "connections".

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
ENTITIES
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Each entity object must have:
  "type"        — one of: {_ENTITY_LIST}
  "name"        — canonical name as it appears in the text (string)
  "confidence"  — float 0.0–1.0: certainty that this is a real entity of \
that type
  "properties"  — object whose keys are FtM property names and whose values \
are ARRAYS OF STRINGS.
                  Example: {{"birthDate": ["1975-03-12"], "nationality": ["de", "us"]}}
                  Fill in every property for which you have evidence in the \
text. Do not invent values.

{_SCHEMA_PROPERTIES}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
CONNECTIONS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Each connection object must have:
  "type"        — one of: {_CONN_LIST}
  "source"      — name of the source entity (must match an entity above)
  "target"      — name of the target entity (must match an entity above)
  "confidence"  — float 0.0–1.0
  "properties"  — optional object with arrays-of-strings for any extra \
relationship properties listed above (startDate, role, percentage, etc.)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
RULES
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
- Only include entities and connections explicitly supported by the text.
- All property values must be arrays of strings — never bare strings or numbers.
- Dates must be ISO 8601: "YYYY", "YYYY-MM", or "YYYY-MM-DD".
- Country values must be ISO 3166-1 alpha-2 codes (e.g. "de", "us", "gb").
- Do not add properties not listed in the property reference above.
- Return valid JSON only — no markdown fences, no prose, no explanation.

Document text:
"""

RELATIONSHIP_PROPS: dict[str, tuple[str, str]] = {
    "Associate":         ("person",      "associate"),
    "Debt":              ("creditor",    "debtor"),
    "Directorship":      ("director",    "organization"),
    "Employment":        ("employee",    "employer"),
    "Family":            ("person",      "relative"),
    "Membership":        ("member",      "organization"),
    # the FtM schema property is 'post', not 'position'
    "Occupancy":         ("holder",      "post"),
    "Ownership":         ("owner",       "asset"),
    "Payment":           ("payer",       "beneficiary"),
    "ProjectParticipant": ("participant", "project"),
    "Representation":    ("agent",       "client"),
    "Similar":           ("subject",     "other"),
    "Succession":        ("predecessor", "successor"),
    "UnknownLink":       ("subject",     "object"),
}

def _best_match(name: str, candidates: list[str]) -> Optional[str]:
    """Return the closest match from candidates, or None if nothing is close."""
    matches = difflib.get_close_matches(name, candidates, n=1, cutoff=0.6)
    return matches[0] if matches else None


def create_entity(entity_type: str, name: str, properties: Optional[dict] = None):
    """
    Instantiate a followthemoney EntityProxy for a node-type entity.

    Falls back to LegalEntity if entity_type is unknown or not in the FtM model.
    entity.id is set via make_id() so it is a stable hash of (type, name).

    If *properties* is provided (a dict of {prop_name: [str, ...]} as output
    by the LLM), each key/value pair is fed through entity.add(), which
    validates and normalises the values according to the FtM schema.  Invalid
    property names or values are silently skipped with a warning — FtM raises
    InvalidData for unknown props and simply ignores malformed values.
    """
    schema_name = _best_match(entity_type, FTM_ENTITY_TYPES) or "LegalEntity"
    try:
        schema = ftm_model.get(schema_name)
    except Exception:
        logger.warning("Unknown entity schema '%s', falling back to LegalEntity.", entity_type)
        schema = ftm_model.get("LegalEntity")
        schema_name = "LegalEntity"

    entity = ftm_model.make_entity(schema)
    entity.make_id(schema_name, name)

    # Always set name from the canonical extracted name, not from properties,
    # so the entity ID (which is derived from make_id above) is stable.
    entity.add("name", name)

    if properties and isinstance(properties, dict):
        for prop_name, values in properties.items():
            if prop_name == "name":
                # Already set above; additional aliases go in via "alias" if needed.
                continue
            if not isinstance(values, list):
                # Normalise bare strings the LLM may accidentally produce.
                values = [str(values)]
            for val in values:
                try:
                    entity.add(prop_name, str(val))
                except Exception as exc:
                    logger.debug(
                        "Skipping property '%s'='%s' on %s: %s",
                        prop_name, val, schema_name, exc,
                    )

    return entity


def create_relationship(
    conn_type: str,
    source_entity,
    target_entity,
    properties: Optional[dict] = None,
):
    """
    Instantiate a followthemoney EntityProxy for a relationship (Interval) entity.

    Looks up the canonical (source_prop, target_prop) pair for the connection
    type and wires the two entity IDs in.  Falls back to UnknownLink if the
    connection type is unrecognised.

    If *properties* is provided, any extra relationship properties (startDate,
    role, percentage, etc.) are applied via entity.add(), with invalid ones
    silently skipped.
    """
    matched_type = _best_match(conn_type, list(RELATIONSHIP_PROPS.keys())) or "UnknownLink"
    try:
        schema = ftm_model.get(matched_type)
    except Exception:
        logger.warning("Unknown relationship schema '%s', falling back to UnknownLink.", conn_type)
        schema = ftm_model.get("UnknownLink")
        matched_type = "UnknownLink"

    src_prop, tgt_prop = RELATIONSHIP_PROPS[matched_type]

    rel = ftm_model.make_entity(schema)
    rel.make_id(matched_type, source_entity.id, target_entity.id)

    try:
        rel.add(src_prop, source_entity.id)
    except Exception as exc:
        logger.warning("Could not set '%s' on %s: %s", src_prop, matched_type, exc)

    try:
        rel.add(tgt_prop, target_entity.id)
    except Exception as exc:
        logger.warning("Could not set '%s' on %s: %s", tgt_prop, matched_type, exc)

    # Apply any extra relationship properties from the LLM (dates, role, etc.)
    if properties and isinstance(properties, dict):
        for prop_name, values in properties.items():
            if prop_name in (src_prop, tgt_prop):
                continue  # already set above
            if not isinstance(values, list):
                values = [str(values)]
            for val in values:
                try:
                    rel.add(prop_name, str(val))
                except Exception as exc:
                    logger.debug(
                        "Skipping relationship property '%s'='%s' on %s: %s",
                        prop_name, val, matched_type, exc,
                    )

    return rel

def _call_llm(text: str) -> dict:
    """
    Call the LLM and return a parsed JSON dict.

    Retries up to MAX_RETRIES times if the output is not valid JSON or does
    not contain the expected top-level keys.  Each retry appends an
    increasingly firm correction instruction to the prompt.
    """
    prompt = EXTRACTION_PROMPT + text
    last_error: Optional[Exception] = None

    for attempt in range(1, MAX_RETRIES + 1):
        retry_suffix = ""
        if attempt > 1:
            retry_suffix = (
                f"\n\nYour previous response could not be parsed as JSON: {last_error}. "
                "Return ONLY a raw JSON object with keys 'entities' and 'connections'. "
                "No markdown, no explanation, no extra text."
            )

        try:
            response = ollama.generate(
                model=MODEL_NAME,
                prompt=prompt + retry_suffix,
                # Disable context carry-over — each document is independent.
                # Ollama uses context=[] to start fresh each call.
                context=[],
                options={"temperature": 0.1},  # low temperature for structured output
            )
            raw = response["response"].strip()

            # Strip optional markdown fences in case the model adds them.
            raw = re.sub(r"^```(?:json)?\s*", "", raw)
            raw = re.sub(r"\s*```$", "", raw)

            parsed = json.loads(raw)

            # Validate top-level structure.
            if not isinstance(parsed, dict):
                raise ValueError("LLM output is not a JSON object.")
            if "entities" not in parsed or "connections" not in parsed:
                raise ValueError(
                    f"Missing required keys; got: {list(parsed.keys())}"
                )

            return parsed

        except (json.JSONDecodeError, ValueError) as exc:
            last_error = exc
            logger.warning(
                "LLM output parse failure (attempt %d/%d): %s",
                attempt, MAX_RETRIES, exc,
            )

    raise RuntimeError(
        f"LLM failed to return valid JSON after {MAX_RETRIES} attempts. "
        f"Last error: {last_error}"
    )

def extract_entities(
    text: str,
    document_id: str,
    page_number: Optional[int],
) -> tuple[list, list]:
    """
    Run NER on *text* and return (entity_objects, relationship_objects).

    Each returned object is a followthemoney EntityProxy.  Callers are
    responsible for serialising via entity.to_dict() and for attaching
    provenance / confidence metadata on top.

    Parameters
    ----------
    text:        Plain text to analyse.
    document_id: Used only for logging context; provenance is attached by
                 the Flask layer which has the full page list available.
    page_number: Used only for logging context.
    """
    logger.info(
        "Extracting entities from document_id=%s page=%s (%d chars)",
        document_id, page_number, len(text),
    )

    llm_output = _call_llm(text)

    raw_entities   = llm_output.get("entities", [])
    raw_connections = llm_output.get("connections", [])

    # --- Build entity proxy objects ---
    entity_map: dict[str, tuple] = {}  # name → (proxy, confidence)
    for item in raw_entities:
        name       = str(item.get("name", "")).strip()
        etype      = str(item.get("type", "LegalEntity")).strip()
        confidence = float(item.get("confidence", 0.5))
        props      = item.get("properties", {})
        if not name:
            continue
        proxy = create_entity(etype, name, properties=props)
        # Keep highest-confidence version if the same name appears twice.
        if name not in entity_map or confidence > entity_map[name][1]:
            entity_map[name] = (proxy, confidence)

    # --- Build relationship proxy objects ---
    rel_list: list[tuple] = []  # (proxy, confidence)
    for item in raw_connections:
        src_name   = str(item.get("source", "")).strip()
        tgt_name   = str(item.get("target", "")).strip()
        ctype      = str(item.get("type", "UnknownLink")).strip()
        confidence = float(item.get("confidence", 0.5))
        props      = item.get("properties", {})

        if src_name not in entity_map or tgt_name not in entity_map:
            logger.debug(
                "Skipping connection '%s' → '%s' (%s): entity not found.",
                src_name, tgt_name, ctype,
            )
            continue

        src_proxy, _ = entity_map[src_name]
        tgt_proxy, _ = entity_map[tgt_name]
        rel_proxy = create_relationship(ctype, src_proxy, tgt_proxy, properties=props)
        rel_list.append((rel_proxy, confidence))

    entity_results = list(entity_map.values())    # list of (proxy, confidence)
    return entity_results, rel_list