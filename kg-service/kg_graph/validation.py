from __future__ import annotations

from typing import Any


EDGE_STATUSES = {"verified", "strong_candidate"}


class GraphPayloadValidationError(ValueError):
    def __init__(self, reason: str, details: list[str] | None = None):
        self.reason = reason
        self.details = details or []
        message = reason
        if self.details:
            message = f"{reason}: {'; '.join(self.details)}"
        super().__init__(message)


def validate_graph_payload(graph_payload: dict[str, Any]) -> None:
    if not isinstance(graph_payload, dict):
        raise GraphPayloadValidationError("invalid_graph_payload", ["payload must be an object"])

    errors: list[str] = []
    graph_nodes = _list_field(graph_payload, "graph_nodes", errors)
    relation_candidates = _list_field(graph_payload, "relation_candidates", errors)
    graph_edges = _list_field(graph_payload, "graph_edges", errors)
    evidence_chunks = _list_field(graph_payload, "evidence_chunks", errors)

    node_ids: set[str] = set()
    for index, node in enumerate(graph_nodes):
        if not isinstance(node, dict):
            errors.append(f"graph_nodes[{index}] must be an object")
            continue
        node_id = _required_str(node, "node_id", f"graph_nodes[{index}]", errors)
        _required_str(node, "node_type", f"graph_nodes[{index}]", errors)
        _required_str(node, "name", f"graph_nodes[{index}]", errors)
        if node_id:
            node_ids.add(node_id)

    evidence_ids: set[str] = set()
    for index, chunk in enumerate(evidence_chunks):
        if not isinstance(chunk, dict):
            errors.append(f"evidence_chunks[{index}] must be an object")
            continue
        chunk_id = _required_str(chunk, "chunk_id", f"evidence_chunks[{index}]", errors)
        _required_str(chunk, "text", f"evidence_chunks[{index}]", errors)
        if chunk_id:
            evidence_ids.add(chunk_id)

    for field_name, relations in (
        ("relation_candidates", relation_candidates),
        ("graph_edges", graph_edges),
    ):
        for index, relation in enumerate(relations):
            if not isinstance(relation, dict):
                errors.append(f"{field_name}[{index}] must be an object")
                continue
            path = f"{field_name}[{index}]"
            _required_str(relation, "rel_id", path, errors)
            head = _required_str(relation, "head", path, errors)
            tail = _required_str(relation, "tail", path, errors)
            _required_str(relation, "relation", path, errors)
            status = str(relation.get("status") or "").strip()
            if field_name == "graph_edges" and status not in EDGE_STATUSES:
                errors.append(f"{path}.status must be verified or strong_candidate")
            if field_name == "graph_edges":
                if head and head not in node_ids:
                    errors.append(f"{path}.head references missing node: {head}")
                if tail and tail not in node_ids:
                    errors.append(f"{path}.tail references missing node: {tail}")
                refs = relation.get("evidence_refs") or []
                if not isinstance(refs, list):
                    errors.append(f"{path}.evidence_refs must be a list")
                else:
                    missing_refs = [str(ref) for ref in refs if str(ref) not in evidence_ids]
                    if missing_refs:
                        errors.append(f"{path}.evidence_refs references missing chunks: {', '.join(missing_refs)}")

    if errors:
        raise GraphPayloadValidationError("schema_validation_failed", errors)


def _list_field(payload: dict[str, Any], field_name: str, errors: list[str]) -> list[Any]:
    value = payload.get(field_name)
    if not isinstance(value, list):
        errors.append(f"{field_name} must be a list")
        return []
    return value


def _required_str(payload: dict[str, Any], field_name: str, path: str, errors: list[str]) -> str:
    value = str(payload.get(field_name) or "").strip()
    if not value:
        errors.append(f"{path}.{field_name} is required")
    return value
