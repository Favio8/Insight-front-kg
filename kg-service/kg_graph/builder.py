import logging
import os
from datetime import datetime
from typing import Any
from uuid import uuid4

from .confidence import RULE_VERSION, apply_confidence
from .extractor import extract_evidence_chunks, extract_nodes, extract_relation_candidates
from .neo4j_store import Neo4jGraphStore
from .normalizer import normalize_entities
from .schema import GraphPayload, RelationCandidate
from .validation import GraphPayloadValidationError, validate_graph_payload


logger = logging.getLogger(__name__)


def build_graph_payload(insight_payload: dict[str, Any]) -> dict[str, Any]:
    raw_nodes = extract_nodes(insight_payload)
    normalization_index, graph_nodes, mention_to_id = normalize_entities(raw_nodes)
    evidence_chunks = extract_evidence_chunks(insight_payload)
    relation_candidates = [
        apply_confidence(relation, evidence_chunks)
        for relation in extract_relation_candidates(insight_payload, mention_to_id, evidence_chunks)
    ]
    graph_edges = _graph_edges(relation_candidates)
    company_edges = _edges_by_kind(graph_edges, "company")
    profile_edges = _edges_by_kind(graph_edges, "profile")
    structural_edges = _edges_by_kind(graph_edges, "structural")

    payload = GraphPayload(
        task_profile=insight_payload.get("task_profile") or {},
        graph_nodes=graph_nodes,
        relation_candidates=relation_candidates,
        graph_edges=graph_edges,
        company_edges=company_edges,
        profile_edges=profile_edges,
        structural_edges=structural_edges,
        inter_company_relations=company_edges,
        evidence_chunks=evidence_chunks,
        normalization_index=normalization_index,
        confidence_meta=_confidence_meta(relation_candidates, graph_edges),
        qa_index_hints=_qa_index_hints(graph_nodes, graph_edges, evidence_chunks),
    )
    return payload.to_dict()


def build_validated_graph_payload(insight_payload: dict[str, Any]) -> dict[str, Any]:
    graph_payload = build_graph_payload(insight_payload)
    try:
        validate_graph_payload(graph_payload)
        graph_payload["validation_meta"] = {"status": "valid"}
    except GraphPayloadValidationError as exc:
        graph_payload["validation_meta"] = {
            "status": "failed",
            "reason": exc.reason,
            "error_type": exc.__class__.__name__,
            "details": exc.details,
        }
    return graph_payload


def persist_graph_payload_if_enabled(graph_payload: dict[str, Any]) -> dict[str, Any]:
    """Compatibility wrapper. Neo4j is mandatory unless fallback is explicit."""
    return persist_graph_payload_to_neo4j(graph_payload)


def persist_graph_payload_to_neo4j(graph_payload: dict[str, Any]) -> dict[str, Any]:
    trace_id = _trace_id(graph_payload)
    created_at = _now_iso()
    context = _graph_context(graph_payload)

    try:
        validate_graph_payload(graph_payload)
    except GraphPayloadValidationError as exc:
        logger.warning("graph_payload schema validation failed: %s", exc)
        graph_payload["persistence_meta"] = _failed_meta(
            reason=exc.reason,
            error_type=exc.__class__.__name__,
            trace_id=trace_id,
            created_at=created_at,
            context=context,
            details=exc.details,
        )
        return graph_payload

    if _graph_auto_persist_disabled() and _allow_graph_payload_fallback():
        graph_payload["persistence_meta"] = _skipped_meta(
            reason="graph_auto_persist_disabled_with_fallback",
            trace_id=trace_id,
            created_at=created_at,
            context=context,
        )
        return graph_payload

    neo4j_uri = str(os.getenv("NEO4J_URI") or "").strip()
    if not neo4j_uri:
        if _allow_graph_payload_fallback():
            graph_payload["persistence_meta"] = _skipped_meta(
                reason="missing_neo4j_uri_with_fallback",
                trace_id=trace_id,
                created_at=created_at,
                context=context,
            )
            return graph_payload
        graph_payload["persistence_meta"] = _failed_meta(
            reason="missing_neo4j_uri",
            error_type="ConfigurationError",
            trace_id=trace_id,
            created_at=created_at,
            context=context,
        )
        return graph_payload

    store = None
    try:
        store = Neo4jGraphStore(
            uri=neo4j_uri,
            user=str(os.getenv("NEO4J_USER") or "neo4j"),
            password=str(os.getenv("NEO4J_PASSWORD") or "password"),
        )
        result = store.persist_graph_payload(
            graph_payload,
            trace_id=trace_id,
            created_at=created_at,
            project_id=context["project_id"],
            document_id=context["document_id"],
            version=context["version"],
        )
        graph_payload["persistence_meta"] = {
            "enabled": True,
            "required": True,
            "status": "persisted",
            "trace_id": trace_id,
            "created_at": created_at,
            **context,
            **result,
        }
        logger.info(
            "graph_payload persisted to neo4j trace_id=%s node_count=%s relation_count=%s",
            trace_id,
            result.get("node_count"),
            result.get("relation_count"),
        )
    except Exception as exc:
        logger.exception("neo4j persistence failed trace_id=%s", trace_id)
        graph_payload["persistence_meta"] = _failed_meta(
            reason=str(exc) or "neo4j_persistence_failed",
            error_type=exc.__class__.__name__,
            trace_id=trace_id,
            created_at=created_at,
            context=context,
        )
    finally:
        if store is not None:
            store.close()
    return graph_payload


def ingest_insight_payload(insight_payload: dict[str, Any]) -> dict[str, Any]:
    graph_payload = persist_graph_payload_to_neo4j(build_graph_payload(insight_payload))
    meta = graph_payload.get("persistence_meta") or {}
    visualization_payload: dict[str, Any] = {}

    if meta.get("status") == "persisted":
        visualization_payload = load_visualization_payload(
            trace_id=str(meta.get("trace_id") or ""),
            project_id=str(meta.get("project_id") or ""),
            persistence_meta=meta,
        )
        if not visualization_payload.get("graph_nodes"):
            visualization_payload = graph_payload
            visualization_payload["visualization_meta"] = {
                "status": "fallback_to_graph_payload",
                "reason": "neo4j_visualization_query_empty",
            }
    elif _allow_graph_payload_fallback():
        visualization_payload = graph_payload

    return {
        "graph_payload": graph_payload,
        "visualization_payload": visualization_payload,
        "persistence_meta": meta,
    }


def load_visualization_payload(
    trace_id: str = "",
    project_id: str = "",
    persistence_meta: dict[str, Any] | None = None,
) -> dict[str, Any]:
    created_at = _now_iso()
    neo4j_uri = str(os.getenv("NEO4J_URI") or "").strip()
    if not trace_id and not project_id:
        return {
            "graph_nodes": [],
            "graph_edges": [],
            "company_edges": [],
            "profile_edges": [],
            "structural_edges": [],
            "evidence_chunks": [],
            "persistence_meta": _failed_meta(
                reason="missing_visualization_query",
                error_type="ValidationError",
                trace_id="",
                created_at=created_at,
                context=_empty_context(),
            ),
        }
    if not neo4j_uri:
        return {
            "graph_nodes": [],
            "graph_edges": [],
            "company_edges": [],
            "profile_edges": [],
            "structural_edges": [],
            "evidence_chunks": [],
            "persistence_meta": _failed_meta(
                reason="missing_neo4j_uri",
                error_type="ConfigurationError",
                trace_id=trace_id,
                created_at=created_at,
                context=_empty_context(project_id=project_id),
            ),
        }

    store = None
    try:
        store = Neo4jGraphStore(
            uri=neo4j_uri,
            user=str(os.getenv("NEO4J_USER") or "neo4j"),
            password=str(os.getenv("NEO4J_PASSWORD") or "password"),
        )
        payload = store.get_visualization_payload(trace_id=trace_id, project_id=project_id)
        payload["persistence_meta"] = persistence_meta or {
            "status": "loaded",
            "trace_id": trace_id,
            "created_at": created_at,
            "project_id": project_id,
        }
        return payload
    except Exception as exc:
        logger.exception("neo4j visualization query failed trace_id=%s", trace_id)
        return {
            "graph_nodes": [],
            "graph_edges": [],
            "company_edges": [],
            "profile_edges": [],
            "structural_edges": [],
            "evidence_chunks": [],
            "persistence_meta": _failed_meta(
                reason=str(exc) or "neo4j_visualization_query_failed",
                error_type=exc.__class__.__name__,
                trace_id=trace_id,
                created_at=created_at,
                context=_empty_context(project_id=project_id),
            ),
        }
    finally:
        if store is not None:
            store.close()


def _graph_edges(candidates: list[RelationCandidate]) -> list[RelationCandidate]:
    return [relation for relation in candidates if relation.status in {"verified", "strong_candidate"}]


def _edges_by_kind(edges: list[RelationCandidate], edge_kind: str) -> list[RelationCandidate]:
    return [relation for relation in edges if relation.edge_kind == edge_kind]


def _confidence_meta(candidates: list[RelationCandidate], edges: list[RelationCandidate]) -> dict[str, Any]:
    status_counts: dict[str, int] = {}
    for relation in candidates:
        status_counts[relation.status] = status_counts.get(relation.status, 0) + 1
    return {
        "rule_version": RULE_VERSION,
        "candidate_count": len(candidates),
        "edge_count": len(edges),
        "status_counts": status_counts,
        "edge_statuses": ["verified", "strong_candidate"],
    }


def _qa_index_hints(graph_nodes, graph_edges, evidence_chunks) -> dict[str, Any]:
    return {
        "industries": [node.name for node in graph_nodes if node.node_type == "Industry"],
        "companies": [node.name for node in graph_nodes if node.node_type == "Company"],
        "relations": sorted({edge.relation for edge in graph_edges}),
        "evidence_count": len(evidence_chunks),
    }


def _trace_id(graph_payload: dict[str, Any]) -> str:
    existing = graph_payload.get("persistence_meta") or {}
    trace_id = str(existing.get("trace_id") or "").strip()
    if trace_id:
        return trace_id
    return f"kg_{datetime.now().strftime('%Y%m%d')}_{uuid4().hex[:10]}"


def _now_iso() -> str:
    return datetime.now().astimezone().isoformat(timespec="seconds")


def _graph_context(graph_payload: dict[str, Any]) -> dict[str, str]:
    task_profile = graph_payload.get("task_profile") or {}
    project_id = str(
        task_profile.get("project_id")
        or task_profile.get("profile_id")
        or task_profile.get("industry")
        or ""
    ).strip()
    document_id = str(task_profile.get("document_id") or "").strip()
    version = str(task_profile.get("version") or os.getenv("KG_GRAPH_VERSION") or "v1").strip()
    return {
        "project_id": project_id,
        "document_id": document_id,
        "version": version,
    }


def _empty_context(project_id: str = "") -> dict[str, str]:
    return {
        "project_id": project_id,
        "document_id": "",
        "version": str(os.getenv("KG_GRAPH_VERSION") or "v1").strip(),
    }


def _allow_graph_payload_fallback() -> bool:
    return str(os.getenv("KG_ALLOW_GRAPH_PAYLOAD_FALLBACK") or "").strip().lower() in {"1", "true", "yes", "on"}


def _graph_auto_persist_disabled() -> bool:
    return str(os.getenv("GRAPH_AUTO_PERSIST", "true")).strip().lower() in {"false", "0", "no", "off"}


def _failed_meta(
    reason: str,
    error_type: str,
    trace_id: str,
    created_at: str,
    context: dict[str, str],
    details: list[str] | None = None,
) -> dict[str, Any]:
    meta: dict[str, Any] = {
        "enabled": True,
        "required": True,
        "status": "failed",
        "reason": reason,
        "error_type": error_type,
        "trace_id": trace_id,
        "created_at": created_at,
        **context,
    }
    if details:
        meta["details"] = details
        meta["error"] = "; ".join(details)
    else:
        meta["error"] = reason
    return meta


def _skipped_meta(reason: str, trace_id: str, created_at: str, context: dict[str, str]) -> dict[str, Any]:
    return {
        "enabled": False,
        "required": True,
        "status": "skipped",
        "reason": reason,
        "error_type": "FallbackEnabled",
        "trace_id": trace_id,
        "created_at": created_at,
        **context,
    }
