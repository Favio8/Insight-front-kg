from unittest.mock import MagicMock, patch

from fastapi.testclient import TestClient

from app import app
from tests.test_graph_extractor import sample_insight_payload


client = TestClient(app)


def test_health():
    response = client.get("/health")

    assert response.status_code == 200
    assert response.json()["status"] == "ok"


def test_build_graph_api_returns_graph_payload():
    response = client.post("/api/graph/build", json={"insight_payload": sample_insight_payload()})

    assert response.status_code == 200
    payload = response.json()
    assert payload["task_profile"]["industry"] == "新能源"
    assert payload["company_edges"]
    assert payload["profile_edges"]
    assert payload["evidence_chunks"]


def test_build_and_persist_fails_without_neo4j_uri(monkeypatch):
    monkeypatch.delenv("NEO4J_URI", raising=False)
    monkeypatch.delenv("KG_ALLOW_GRAPH_PAYLOAD_FALLBACK", raising=False)

    response = client.post("/api/graph/build-and-persist", json={"insight_payload": sample_insight_payload()})

    assert response.status_code == 200
    payload = response.json()
    assert payload["persistence_meta"]["status"] == "failed"
    assert payload["persistence_meta"]["reason"] == "missing_neo4j_uri"


def test_ingest_api_persists_and_returns_visualization_payload(monkeypatch):
    monkeypatch.setenv("NEO4J_URI", "bolt://localhost:7687")
    store = MagicMock()
    store.persist_graph_payload.return_value = {
        "node_count": 2,
        "relation_count": 1,
        "edge_count": 1,
        "evidence_count": 1,
    }
    store.get_visualization_payload.return_value = {
        "graph_nodes": [{"node_id": "company:宁德时代", "node_type": "Company", "name": "宁德时代"}],
        "graph_edges": [],
        "company_edges": [],
        "profile_edges": [],
        "structural_edges": [],
        "evidence_chunks": [],
        "relation_candidates": [],
        "normalization_index": [],
        "confidence_meta": {},
        "qa_index_hints": {},
    }

    with patch("kg_graph.builder.Neo4jGraphStore", return_value=store):
        response = client.post("/api/graph/ingest", json={"insight_payload": sample_insight_payload()})

    assert response.status_code == 200
    payload = response.json()
    assert payload["persistence_meta"]["status"] == "persisted"
    assert payload["persistence_meta"]["relation_count"] == 1
    assert payload["visualization_payload"]["graph_nodes"]
    assert payload["graph_payload"]["graph_edges"]
