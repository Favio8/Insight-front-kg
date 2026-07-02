import unittest
from unittest.mock import MagicMock, patch

from tests.test_graph_extractor import sample_insight_payload


class GraphPersistenceHookTests(unittest.TestCase):
    def test_persistence_fails_without_neo4j_uri_by_default(self):
        from kg_graph.builder import build_graph_payload, persist_graph_payload_if_enabled

        graph_payload = build_graph_payload(sample_insight_payload())
        with patch.dict("os.environ", {}, clear=True):
            result = persist_graph_payload_if_enabled(graph_payload)

        self.assertEqual(result["persistence_meta"]["status"], "failed")
        self.assertTrue(result["persistence_meta"]["enabled"])
        self.assertEqual(result["persistence_meta"]["reason"], "missing_neo4j_uri")
        self.assertEqual(result["persistence_meta"]["error_type"], "ConfigurationError")
        self.assertIn("trace_id", result["persistence_meta"])

    def test_persistence_can_skip_only_with_explicit_fallback(self):
        from kg_graph.builder import build_graph_payload, persist_graph_payload_if_enabled

        graph_payload = build_graph_payload(sample_insight_payload())
        with patch.dict(
            "os.environ",
            {"GRAPH_AUTO_PERSIST": "false", "KG_ALLOW_GRAPH_PAYLOAD_FALLBACK": "true"},
            clear=True,
        ):
            result = persist_graph_payload_if_enabled(graph_payload)

        self.assertEqual(result["persistence_meta"]["status"], "skipped")
        self.assertFalse(result["persistence_meta"]["enabled"])
        self.assertEqual(result["persistence_meta"]["reason"], "graph_auto_persist_disabled_with_fallback")

    def test_persistence_success_sets_persisted_meta(self):
        from kg_graph.builder import build_graph_payload, persist_graph_payload_if_enabled

        graph_payload = build_graph_payload(sample_insight_payload())
        store = MagicMock()
        store.persist_graph_payload.return_value = {
            "node_count": 2,
            "relation_count": 1,
            "edge_count": 1,
            "evidence_count": 3,
        }

        with patch.dict("os.environ", {"NEO4J_URI": "bolt://localhost:7687"}, clear=True):
            with patch("kg_graph.builder.Neo4jGraphStore", return_value=store):
                result = persist_graph_payload_if_enabled(graph_payload)

        self.assertEqual(result["persistence_meta"]["status"], "persisted")
        self.assertTrue(result["persistence_meta"]["enabled"])
        self.assertEqual(result["persistence_meta"]["node_count"], 2)
        self.assertEqual(result["persistence_meta"]["relation_count"], 1)
        self.assertEqual(result["persistence_meta"]["edge_count"], 1)
        self.assertIn("trace_id", result["persistence_meta"])
        self.assertIn("created_at", result["persistence_meta"])
        store.close.assert_called_once()

    def test_persistence_failure_sets_failed_meta_without_raising(self):
        from kg_graph.builder import build_graph_payload, persist_graph_payload_if_enabled

        graph_payload = build_graph_payload(sample_insight_payload())
        with patch.dict("os.environ", {"NEO4J_URI": "bolt://localhost:7687"}, clear=True):
            with patch("kg_graph.builder.Neo4jGraphStore", side_effect=RuntimeError("boom")):
                result = persist_graph_payload_if_enabled(graph_payload)

        self.assertEqual(result["persistence_meta"]["status"], "failed")
        self.assertTrue(result["persistence_meta"]["enabled"])
        self.assertIn("boom", result["persistence_meta"]["error"])
        self.assertEqual(result["persistence_meta"]["error_type"], "RuntimeError")

    def test_schema_validation_failure_does_not_create_store(self):
        from kg_graph.builder import persist_graph_payload_if_enabled

        invalid_payload = {
            "task_profile": {"industry": "新能源"},
            "graph_nodes": [{"node_id": "company:宁德时代", "node_type": "Company", "name": "宁德时代"}],
            "relation_candidates": [],
            "graph_edges": [
                {
                    "rel_id": "rel:bad",
                    "head": "company:宁德时代",
                    "tail": "company:不存在",
                    "relation": "supply",
                    "status": "verified",
                    "evidence_refs": [],
                }
            ],
            "evidence_chunks": [],
        }

        with patch.dict("os.environ", {"NEO4J_URI": "bolt://localhost:7687"}, clear=True):
            with patch("kg_graph.builder.Neo4jGraphStore") as store_cls:
                result = persist_graph_payload_if_enabled(invalid_payload)

        self.assertEqual(result["persistence_meta"]["status"], "failed")
        self.assertEqual(result["persistence_meta"]["reason"], "schema_validation_failed")
        store_cls.assert_not_called()


if __name__ == "__main__":
    unittest.main()


