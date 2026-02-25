import json
import datetime
from typing import Optional

import connexion
from followthemoney import model as ftm_model
from followthemoney.exc import InvalidData
from followthemoney.proxy import EntityProxy
from followthemoney.types import registry

from openapi_server.models.error_response import ErrorResponse
from openapi_server.models.ft_m_entity import FtMEntity

def current_user_id() -> Optional[str]:
    """
    Extract the authenticated user ID from the connexion request context.

    Connexion 3.x injects the dict returned by info_from_bearerAuth() into
    connexion.context["token_info"]. The security controller returns
    {"uid": user_id, "email": ...}, so we read "uid" from that dict.

    Falls back to connexion.context.get("user") which some connexion versions
    populate directly.
    """
    token_info = connexion.context.get("token_info") or {}
    if isinstance(token_info, dict):
        uid = token_info.get("uid")
        if uid:
            return uid
    # Fallback: connexion may set "user" directly from the "sub" claim
    user = connexion.context.get("user")
    if user:
        return user
    return None


def _error(code: str, message: str, status: int):
    return ErrorResponse(error=code, message=message), status

#schema validation
def get_schema(schema_name: str):
    """
    Return a FtM Schema object for the given name, or None if unknown.
    Uses ftm_model.get() which returns None for unrecognised schemata.
    """
    return ftm_model.get(schema_name)


def schema_is_edge(schema_name: str) -> bool:
    """Return True if this FtM schema is an interstitial (edge-type) entity."""
    schema = get_schema(schema_name)
    if schema is None:
        return False
    # Edge schemas have edge_source and edge_target defined
    return schema.edge_source is not None and schema.edge_target is not None


def make_proxy(schema_name: str, entity_id: Optional[str] = None) -> EntityProxy:
    """
    Instantiate a new EntityProxy for the given schema.
    Raises ValueError for unknown schemata.
    """
    schema = get_schema(schema_name)
    if schema is None:
        raise ValueError(f"Unknown FtM schema: {schema_name!r}")
    proxy = ftm_model.make_entity(schema)
    if entity_id:
        proxy.id = entity_id
    return proxy


def proxy_from_raw(raw: dict) -> Optional[EntityProxy]:
    """
    Build and validate an EntityProxy from a raw dict with keys:
      schema, properties (multi-valued: {prop_name: [str, ...]})
      and optionally id.

    Uses ftm_model.get_proxy() which re-validates every property value
    and normalises them according to FtM type rules.

    Returns None if the schema is unknown or the data is fundamentally invalid.
    """
    schema_name = raw.get("schema", "")
    if not get_schema(schema_name):
        print("Unknown FtM schema %r – skipping entity", schema_name)
        return None

    data = {
        "id": raw.get("id") or raw.get("entity_id") or "unknown",
        "schema": schema_name,
        "properties": raw.get("properties", {}),
    }
    try:
        # cleaned=False forces full re-validation and normalisation of every value
        proxy = ftm_model.get_proxy(data, cleaned=False)
    except InvalidData as exc:
        print("FtM validation error for %r: %s", schema_name, exc)
        return None

    return proxy


def add_properties_to_proxy(proxy: EntityProxy, properties: dict, fuzzy: bool = True) -> EntityProxy:
    """
    Add a property dict (multi-valued: {name: [values]}) to an existing proxy,
    using FtM's type-aware validation and normalisation.

    Invalid values are silently dropped (quiet=True) so a single bad value
    doesn't reject the whole entity. fuzzy=True enables approximate matching
    for types like country codes.
    """
    for prop_name, values in properties.items():
        if not isinstance(values, list):
            values = [values]
        for value in values:
            try:
                proxy.add(prop_name, value, fuzzy=fuzzy, quiet=True)
            except InvalidData as exc:
                print("Dropping invalid value for %s.%s = %r: %s",
                          proxy.schema.name, prop_name, value, exc)
    return proxy

def get_entity_refs(proxy: EntityProxy) -> list[str]:
    """
    Return all entity IDs referenced in entity-typed properties of this proxy.
    Used to build the entity_refs denormalised list stored in Neo4j for
    efficient relationship traversal queries.
    """
    refs = []
    for prop in proxy.iterprops():
        if prop.type == registry.entity:
            refs.extend(proxy.get(prop))
    return list(set(refs))

def proxy_to_neo4j_params(
    proxy: EntityProxy,
    confidence: float,
    provenance: list[dict],
    owner_ids: list[str],
    public: bool,
) -> dict:
    now = datetime.datetime.now(datetime.timezone.utc).isoformat()
    ftm_dict = proxy.to_dict()

    # Collect name-like values for full-text search indexing
    name_props = ("name", "alias", "weakAlias", "firstName", "lastName", "middleName")
    name_values = []
    for prop_name in name_props:
        try:
            name_values.extend(proxy.get(prop_name))
        except Exception:
            pass

    return {
        "id": proxy.id,
        "schema": proxy.schema.name,
        "caption": proxy.caption,
        "properties_json": json.dumps(ftm_dict.get("properties", {})),
        "confidence": confidence,
        "public": public,
        "owner_ids": owner_ids,
        "provenance_json": json.dumps(provenance),
        "entity_refs": get_entity_refs(proxy),
        "name_search": " ".join(name_values).lower(),
        "now": now,
    }


def neo4j_record_to_proxy(record_data: dict) -> Optional[EntityProxy]:
    """
    Reconstruct an EntityProxy from a Neo4j property dict.
    `properties_json` is decoded from the stored JSON string.
    Returns None if reconstruction fails.
    """
    try:
        properties = json.loads(record_data.get("properties_json", "{}"))
        data = {
            "id": record_data["id"],
            "schema": record_data["schema"],
            "properties": properties,
        }
        # cleaned=True: values already validated when stored, skip re-normalisation
        return ftm_model.get_proxy(data, cleaned=True)
    except (InvalidData, KeyError, json.JSONDecodeError) as exc:
        print("Failed to reconstruct proxy from Neo4j: %s", exc)
        return None

def proxy_to_api_model(
    proxy: EntityProxy,
    record_data: dict,
) -> FtMEntity:
    """
    Convert an EntityProxy + Neo4j metadata dict into an FtMEntity API model.

    We build a plain dict matching the OpenAPI field names and pass it to
    FtMEntity.from_dict(), which is the openapi-generator's own deserialisation
    path. This avoids directly calling __init__ with keyword arguments, which
    breaks because the generator renames the 'schema' property internally to
    avoid conflicting with the base model class's own 'schema' attribute.
    from_dict() uses the generated attribute_map to handle that rename.
    """
    try:
        provenance = json.loads(record_data.get("provenance_json", "[]"))
    except (json.JSONDecodeError, TypeError):
        provenance = []

    d = {
        "id": proxy.id,
        "schema": proxy.schema.name,
        "caption": proxy.caption,
        "properties": proxy.to_dict().get("properties", {}),
        "confidence": record_data.get("confidence"),
        "public": record_data.get("public", False),
        "owner_ids": record_data.get("owner_ids", []),
        "provenance": provenance,
        "first_seen": record_data.get("first_seen"),
        "last_changed": record_data.get("last_changed"),
    }
    return FtMEntity.from_dict(d)

def neo4j_record_to_api_model(record_data: dict) -> Optional[FtMEntity]:
    """
    Full pipeline: Neo4j dict → EntityProxy (FtM-validated) → FtMEntity API model.
    Returns None if the record cannot be reconstructed as a valid FtM entity.
    """
    proxy = neo4j_record_to_proxy(record_data)
    if proxy is None:
        return None
    return proxy_to_api_model(proxy, record_data)