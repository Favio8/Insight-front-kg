from __future__ import annotations

import hashlib
from typing import Any

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI(title="Insight Front KG Service", version="0.2.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok", "service": "insight-front-kg"}


@app.post("/api/graph/build")
def build_graph(request: dict[str, Any]) -> dict[str, Any]:
    insight_payload = _unwrap_payload(request, "insight_payload")
    return build_graph_payload(insight_payload)


@app.post("/api/graph/build-and-persist")
def build_and_persist_graph(request: dict[str, Any]) -> dict[str, Any]:
    graph_payload = build_graph_payload(_unwrap_payload(request, "insight_payload"))
    graph_payload["persistence_meta"] = {
        "status": "skipped",
        "reason": "demo_service_no_neo4j_writer",
    }
    return graph_payload


def _unwrap_payload(request: dict[str, Any], key: str) -> dict[str, Any]:
    payload = request.get(key, request)
    return payload if isinstance(payload, dict) else {}


def build_graph_payload(insight_payload: dict[str, Any]) -> dict[str, Any]:
    existing = insight_payload.get("graph_payload")
    if isinstance(existing, dict):
        return existing

    graph_nodes: list[dict[str, Any]] = []
    company_edges: list[dict[str, Any]] = []
    profile_edges: list[dict[str, Any]] = []
    evidence_chunks: list[dict[str, Any]] = []
    seen_nodes: set[str] = set()

    def add_node(node_id: str, node_type: str, name: str) -> None:
        if node_id in seen_nodes:
            return
        seen_nodes.add(node_id)
        graph_nodes.append(
            {
                "node_id": node_id,
                "node_type": node_type,
                "name": name,
                "aliases": [],
                "normalized_name": name,
                "source_refs": [],
                "raw_mentions": [name],
                "normalization_method": "demo_exact",
            }
        )

    for card in insight_payload.get("company_cards", []) or []:
        name = str(card.get("company_name", "")).strip()
        if not name:
            continue
        company_id = f"company:{name}"
        add_node(company_id, "Company", name)
        for field, node_type, relation in [
            ("business_lines", "BusinessLine", "company_has_business_line"),
            ("product_lines", "Product", "company_has_product"),
            ("core_technologies", "Technology", "company_has_technology"),
        ]:
            for value in card.get(field, []) or []:
                value = str(value).strip()
                if not value:
                    continue
                target_id = f"{node_type.lower()}:{value}"
                add_node(target_id, node_type, value)
                profile_edges.append(_relation(company_id, relation, target_id, "profile", field, value))

    for relation in insight_payload.get("inter_company_relations", []) or []:
        if not isinstance(relation, dict):
            continue
        head = str(relation.get("head", "")).strip()
        tail = str(relation.get("tail", "")).strip()
        if not head or not tail:
            continue
        add_node(head, str(relation.get("head_type", "Company")), head.split(":")[-1])
        add_node(tail, str(relation.get("tail_type", "Company")), tail.split(":")[-1])
        company_edges.append({**relation, "edge_kind": relation.get("edge_kind") or "company"})
        if relation.get("evidence_text"):
            evidence_chunks.append(
                {
                    "chunk_id": f"evidence:{_stable_id(relation.get('evidence_text'))}",
                    "text": relation.get("evidence_text"),
                    "source_url": relation.get("source_url", ""),
                    "source_title": relation.get("source_title", ""),
                    "source_grade": relation.get("source_grade", ""),
                }
            )

    graph_edges = [*company_edges, *profile_edges]
    return {
        "task_profile": insight_payload.get("task_profile", {}),
        "graph_nodes": graph_nodes,
        "relation_candidates": graph_edges,
        "graph_edges": graph_edges,
        "company_edges": company_edges,
        "profile_edges": profile_edges,
        "structural_edges": [],
        "inter_company_relations": company_edges,
        "evidence_chunks": evidence_chunks,
        "normalization_index": [],
        "confidence_meta": {"builder": "demo"},
        "qa_index_hints": {},
        "persistence_meta": {"status": "not_persisted"},
    }


def _relation(head: str, relation: str, tail: str, edge_kind: str, field_name: str, field_value: str) -> dict[str, Any]:
    rel_id = f"rel:{_stable_id(head + relation + tail)}"
    return {
        "rel_id": rel_id,
        "head": head,
        "head_type": "Company",
        "relation": relation,
        "tail": tail,
        "tail_type": tail.split(":", 1)[0].title(),
        "evidence_refs": [],
        "evidence_text": f"{head.split(':')[-1]} 的 {field_name} 包含 {field_value}。",
        "source_url": "",
        "source_title": "insight_payload.company_cards",
        "source_grade": "demo",
        "relation_origin": "demo_builder",
        "relation_level": "profile",
        "relation_name": relation,
        "field_name": field_name,
        "field_value": field_value,
        "direction": "head_to_tail",
        "explanation": "",
        "edge_kind": edge_kind,
        "confidence": 0.72,
        "status": "demo_candidate",
        "direction_uncertain": False,
        "score_breakdown": {},
    }


def _stable_id(value: Any) -> str:
    return hashlib.sha1(str(value).encode("utf-8")).hexdigest()[:16]
