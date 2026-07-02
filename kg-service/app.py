from __future__ import annotations

from typing import Any

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from kg_graph.builder import (
    build_validated_graph_payload,
    build_graph_payload,
    ingest_insight_payload,
    load_visualization_payload,
    persist_graph_payload_if_enabled,
)


app = FastAPI(title="Insight Front KG Service", version="0.1.0")

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
    return build_validated_graph_payload(insight_payload)


@app.post("/api/graph/persist")
def persist_graph(request: dict[str, Any]) -> dict[str, Any]:
    graph_payload = _unwrap_payload(request, "graph_payload")
    return persist_graph_payload_if_enabled(graph_payload)


@app.post("/api/graph/build-and-persist")
def build_and_persist_graph(request: dict[str, Any]) -> dict[str, Any]:
    insight_payload = _unwrap_payload(request, "insight_payload")
    return persist_graph_payload_if_enabled(build_graph_payload(insight_payload))


@app.post("/api/graph/ingest")
def ingest_graph(request: dict[str, Any]) -> dict[str, Any]:
    insight_payload = _unwrap_payload(request, "insight_payload")
    return ingest_insight_payload(insight_payload)


@app.get("/api/graph/visualization")
def graph_visualization(trace_id: str = "", project_id: str = "") -> dict[str, Any]:
    return load_visualization_payload(trace_id=trace_id, project_id=project_id)


def _unwrap_payload(request: dict[str, Any], key: str) -> dict[str, Any]:
    payload = _find_payload(request, key) or request
    if not isinstance(payload, dict):
        return {}
    return payload


def _find_payload(value: Any, key: str) -> dict[str, Any] | None:
    if isinstance(value, list):
        for item in value:
            found = _find_payload(item, key)
            if found is not None:
                return found
        return None

    if not isinstance(value, dict):
        return None

    if isinstance(value.get(key), dict):
        return value[key]

    # Main Insight backend shapes:
    # - /report/ returns {"insight_payload": {...}}
    # - websocket completion sends {"type": "path", "output": {"insight_payload": {...}}}
    # - report history may wrap payload under {"report": {...}}
    for wrapper_key in ("output", "report", "data", "result"):
        nested = value.get(wrapper_key)
        found = _find_payload(nested, key)
        if found is not None:
            return found

    found = _find_payload(value.get("orderedData"), key)
    if found is not None:
        return found

    return None
