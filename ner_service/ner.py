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
  iban, accountNumber, bankName, country, currency, summary

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
  "name"        — canonical name/identifier as it appears in the text (string)
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
    "Occupancy":         ("holder",      "post"),
    "Ownership":         ("owner",       "asset"),
    "Payment":           ("payer",       "beneficiary"),
    "ProjectParticipant": ("participant", "project"),
    "Representation":    ("agent",       "client"),
    "Similar":           ("subject",     "other"),
    "Succession":        ("predecessor", "successor"),
    "UnknownLink":       ("subject",     "object"),
}

# ---------------------------------------------------------------------------
# Schema introspection helpers
# ---------------------------------------------------------------------------

def _get_name_property(schema) -> Optional[str]:
    """
    Return the most appropriate 'name-like' property for a given FtM schema,
    or None if no suitable property exists.

    FtM schemas that don't have 'name' (e.g. Passport, BankAccount) use other
    properties as their primary identifier. We try a ranked list of candidates
    and return the first one the schema actually supports.
    """
    candidates = ["name", "number", "iban", "accountNumber", "full"]
    for candidate in candidates:
        try:
            schema.get(candidate)  # raises if property doesn't exist
            return candidate
        except Exception:
            continue
    return None


def _safe_add(entity, prop_name: str, value: str, schema_name: str) -> bool:
    """
    Attempt entity.add(prop_name, value), returning True on success.
    Logs a debug message and returns False on any exception — never raises.
    """
    try:
        entity.add(prop_name, str(value))
        return True
    except Exception as exc:
        logger.debug(
            "Skipping property '%s'='%s' on %s: %s",
            prop_name, value, schema_name, exc,
        )
        return False


# ---------------------------------------------------------------------------
# Entity / relationship construction
# ---------------------------------------------------------------------------

def _best_match(name: str, candidates: list[str]) -> Optional[str]:
    """Return the closest match from candidates, or None if nothing is close."""
    matches = difflib.get_close_matches(name, candidates, n=1, cutoff=0.6)
    return matches[0] if matches else None


def create_entity(entity_type: str, name: str, properties: Optional[dict] = None):
    """
    Instantiate a followthemoney EntityProxy for a node-type entity.

    Falls back to LegalEntity if entity_type is unknown or not in the FtM model.
    entity.id is set via make_id() so it is a stable hash of (type, name).

    The canonical identifier (name, number, iban, etc.) is set from the
    *name* argument using the property most appropriate for the schema — this
    avoids InvalidData errors on schemas like Passport that have no 'name' prop.

    If *properties* is provided, each key/value pair is fed through _safe_add(),
    which silently skips invalid property names or values.
    """
    schema_name = _best_match(entity_type, FTM_ENTITY_TYPES) or "LegalEntity"
    try:
        schema = ftm_model.get(schema_name)
    except Exception:
        logger.warning(
            "Unknown entity schema '%s', falling back to LegalEntity.", entity_type
        )
        schema = ftm_model.get("LegalEntity")
        schema_name = "LegalEntity"

    entity = ftm_model.make_entity(schema)
    entity.make_id(schema_name, name)

    # Set the canonical identifier using the right property for this schema.
    # _get_name_property introspects the schema so we never write to a
    # property that doesn't exist (e.g. 'name' on Passport → use 'number').
    name_prop = _get_name_property(schema)
    if name_prop:
        _safe_add(entity, name_prop, name, schema_name)
    else:
        logger.warning(
            "Schema '%s' has no recognised name-like property; "
            "entity '%s' will have no primary label.",
            schema_name, name,
        )

    if properties and isinstance(properties, dict):
        for prop_name, values in properties.items():
            if prop_name == name_prop:
                # Already set above; skip to avoid duplicating the value.
                # (Extra aliases from the LLM can come in via 'alias' if needed.)
                continue
            if not isinstance(values, list):
                values = [str(values)]
            for val in values:
                _safe_add(entity, prop_name, str(val), schema_name)

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
    type and wires the two entity IDs in. Falls back to UnknownLink if the
    connection type is unrecognised.

    Extra relationship properties (startDate, role, percentage, etc.) are
    applied via _safe_add(), with invalid ones silently skipped.
    """
    matched_type = _best_match(conn_type, list(RELATIONSHIP_PROPS.keys())) or "UnknownLink"
    try:
        schema = ftm_model.get(matched_type)
    except Exception:
        logger.warning(
            "Unknown relationship schema '%s', falling back to UnknownLink.", conn_type
        )
        schema = ftm_model.get("UnknownLink")
        matched_type = "UnknownLink"

    src_prop, tgt_prop = RELATIONSHIP_PROPS[matched_type]

    rel = ftm_model.make_entity(schema)
    rel.make_id(matched_type, source_entity.id, target_entity.id)

    _safe_add(rel, src_prop, source_entity.id, matched_type)
    _safe_add(rel, tgt_prop, target_entity.id, matched_type)

    if properties and isinstance(properties, dict):
        for prop_name, values in properties.items():
            if prop_name in (src_prop, tgt_prop):
                continue  # already set above
            if not isinstance(values, list):
                values = [str(values)]
            for val in values:
                _safe_add(rel, prop_name, str(val), matched_type)

    return rel


# ---------------------------------------------------------------------------
# LLM interaction
# ---------------------------------------------------------------------------

def _call_llm(text: str) -> dict:
    """
    Call the LLM and return a parsed JSON dict.

    Retries up to MAX_RETRIES times if the output is not valid JSON or does
    not contain the expected top-level keys. Each retry appends an
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
                context=[],
                options={
                    "temperature": 0.1,
                    "num_gpu": 999,
                },
            )
            raw = response["response"].strip()

            # Strip optional markdown fences in case the model adds them.
            raw = re.sub(r"^```(?:json)?\s*", "", raw)
            raw = re.sub(r"\s*```$", "", raw)

            parsed = json.loads(raw)

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


# ---------------------------------------------------------------------------
# Public extraction entry point
# ---------------------------------------------------------------------------

def extract_entities(
    text: str,
    document_id: str,
    page_number: Optional[int],
) -> tuple[list, list]:
    """
    Run NER on *text* and return (entity_objects, relationship_objects).

    Each returned object is a (followthemoney EntityProxy, float confidence)
    tuple. Callers are responsible for serialising via entity.to_dict() and
    for attaching provenance / confidence metadata on top.

    Individual entity or relationship construction failures are logged and
    skipped rather than propagated, so a single malformed LLM output item
    never aborts the whole extraction.

    Parameters
    ----------
    text:        Plain text to analyse.
    document_id: Used only for logging context.
    page_number: Used only for logging context.
    """
    logger.info(
        "Extracting entities from document_id=%s page=%s (%d chars)",
        document_id, page_number, len(text),
    )

    llm_output = _call_llm(text)

    raw_entities    = llm_output.get("entities", [])
    raw_connections = llm_output.get("connections", [])

    # --- Build entity proxy objects ---
    entity_map: dict[str, tuple] = {}  # name → (proxy, confidence)
    for item in raw_entities:
        name       = str(item.get("name", "")).strip()
        etype      = str(item.get("type", "LegalEntity")).strip()
        confidence = float(item.get("confidence", 0.5))
        props      = item.get("properties", {})

        if not name:
            logger.debug("Skipping entity with empty name (type=%s)", etype)
            continue

        try:
            proxy = create_entity(etype, name, properties=props)
        except Exception as exc:
            logger.warning(
                "Failed to create entity name='%s' type='%s': %s — skipping.",
                name, etype, exc,
            )
            continue

        # Keep highest-confidence version if the same name appears twice.
        if name not in entity_map or confidence > entity_map[name][1]:
            entity_map[name] = (proxy, confidence)

    # --- Build relationship proxy objects ---
    rel_list: list[tuple] = []  # [(proxy, confidence), ...]
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

        try:
            rel_proxy = create_relationship(ctype, src_proxy, tgt_proxy, properties=props)
        except Exception as exc:
            logger.warning(
                "Failed to create relationship '%s' → '%s' (%s): %s — skipping.",
                src_name, tgt_name, ctype, exc,
            )
            continue

        rel_list.append((rel_proxy, confidence))

    entity_results = list(entity_map.values())
    return entity_results, rel_list