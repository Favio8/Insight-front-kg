import unittest

from tests.test_graph_extractor import sample_insight_payload


class FakeResult:
    def __init__(self, rows=None):
        self._rows = rows or []

    def data(self):
        return self._rows


class FakeSession:
    def __init__(self, calls, driver=None):
        self.calls = calls
        self.driver = driver

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc, tb):
        return False

    def run(self, cypher, parameters=None, **kwargs):
        params = parameters or kwargs
        self.calls.append((cypher, params))
        if self.driver is not None:
            return FakeResult(self.driver.rows_for(cypher))
        return FakeResult()

    def execute_write(self, callback, *args, **kwargs):
        if self.driver is not None:
            self.driver.write_count += 1
        return callback(self, *args, **kwargs)


class FakeDriver:
    def __init__(self):
        self.calls = []
        self.closed = False
        self.write_count = 0
        self.query_rows = {}

    def session(self):
        return FakeSession(self.calls, self)

    def close(self):
        self.closed = True

    def rows_for(self, cypher):
        if "MATCH (n)" in cypher:
            return self.query_rows.get("nodes", [])
        if "MATCH (h)-[r]->(t)" in cypher:
            return self.query_rows.get("edges", [])
        if "MATCH (e:EvidenceChunk)" in cypher:
            return self.query_rows.get("evidence", [])
        return []


class Neo4jGraphStoreTests(unittest.TestCase):
    def test_sanitize_relation_type_uses_safe_uppercase_identifier(self):
        from kg_graph.neo4j_store import sanitize_relation_type

        self.assertEqual(sanitize_relation_type("vehicle_battery_supply"), "VEHICLE_BATTERY_SUPPLY")
        self.assertEqual(sanitize_relation_type("bad relation-1"), "BAD_RELATION_1")
        self.assertEqual(sanitize_relation_type("123 relation"), "REL_123_RELATION")
        self.assertEqual(sanitize_relation_type(""), "RELATED_TO")

    def test_persist_graph_payload_writes_nodes_edges_relation_facts_and_evidence_links(self):
        from kg_graph.builder import build_graph_payload
        from kg_graph.neo4j_store import Neo4jGraphStore

        graph_payload = build_graph_payload(sample_insight_payload())
        fake_driver = FakeDriver()
        store = Neo4jGraphStore(driver=fake_driver)

        result = store.persist_graph_payload(graph_payload)
        combined_cypher = "\n".join(cypher for cypher, _params in fake_driver.calls)

        self.assertEqual(result["node_count"], len(graph_payload["graph_nodes"]))
        self.assertEqual(result["relation_count"], len(graph_payload["graph_edges"]))
        self.assertEqual(result["edge_count"], len(graph_payload["graph_edges"]))
        self.assertIn("CREATE CONSTRAINT", combined_cypher)
        self.assertIn("CREATE INDEX", combined_cypher)
        self.assertIn("RelationFact", combined_cypher)
        self.assertIn("SUPPORTED_BY", combined_cypher)
        self.assertIn("FROM_SOURCE", combined_cypher)
        self.assertIn("VEHICLE_BATTERY_SUPPLY", combined_cypher)
        self.assertEqual(fake_driver.write_count, 1)

        store.close()
        self.assertTrue(fake_driver.closed)

    def test_relation_fact_persists_field_metadata(self):
        from kg_graph.neo4j_store import Neo4jGraphStore

        graph_payload = {
            "graph_nodes": [
                {"node_id": "Company:catl", "node_type": "Company", "name": "宁德时代"},
                {"node_id": "BusinessLine:battery", "node_type": "BusinessLine", "name": "动力电池业务"},
            ],
            "evidence_chunks": [
                {
                    "chunk_id": "evidence:1",
                    "text": "宁德时代主营动力电池业务。",
                    "source_url": "https://example.com/catl",
                    "source_title": "宁德时代年报",
                    "source_grade": "A",
                }
            ],
            "graph_edges": [
                {
                    "rel_id": "rel:1",
                    "head": "Company:catl",
                    "head_type": "Company",
                    "relation": "company_has_business_line",
                    "tail": "BusinessLine:battery",
                    "tail_type": "BusinessLine",
                    "edge_kind": "profile",
                    "status": "verified",
                    "confidence": 0.92,
                    "evidence_refs": ["evidence:1"],
                    "evidence_text": "宁德时代主营动力电池业务。",
                    "source_url": "https://example.com/catl",
                    "source_grade": "A",
                    "field_name": "business_lines",
                    "field_value": "动力电池业务",
                }
            ],
        }

        fake_driver = FakeDriver()
        store = Neo4jGraphStore(driver=fake_driver)
        store.persist_graph_payload(graph_payload)

        relation_params = [
            params
            for query, params in fake_driver.calls
            if "RelationFact" in query and params.get("rel_id") == "rel:1"
        ]
        self.assertTrue(relation_params)
        self.assertEqual(relation_params[0]["properties"]["field_name"], "business_lines")
        self.assertEqual(relation_params[0]["properties"]["field_value"], "动力电池业务")
        self.assertEqual(relation_params[0]["properties"]["entity_id"], "rel:1")
        self.assertEqual(relation_params[0]["properties"]["entity_type"], "Relation")
        self.assertEqual(relation_params[0]["properties"]["relation_type"], "company_has_business_line")

    def test_get_visualization_payload_returns_frontend_graph_shape(self):
        from kg_graph.neo4j_store import Neo4jGraphStore

        fake_driver = FakeDriver()
        fake_driver.query_rows = {
            "nodes": [
                {
                    "labels": ["Company"],
                    "properties": {
                        "node_id": "company:宁德时代",
                        "entity_id": "company:宁德时代",
                        "entity_type": "Company",
                        "name": "宁德时代",
                        "aliases": ["CATL"],
                        "project_id": "new_energy",
                    },
                },
                {
                    "labels": ["Company"],
                    "properties": {
                        "node_id": "company:特斯拉",
                        "entity_id": "company:特斯拉",
                        "entity_type": "Company",
                        "name": "特斯拉",
                        "aliases": ["Tesla"],
                        "project_id": "new_energy",
                    },
                },
            ],
            "edges": [
                {
                    "head": "company:宁德时代",
                    "tail": "company:特斯拉",
                    "head_labels": ["Company"],
                    "tail_labels": ["Company"],
                    "neo4j_relation_type": "VEHICLE_BATTERY_SUPPLY",
                    "properties": {
                        "rel_id": "rel:1",
                        "relation": "vehicle_battery_supply",
                        "relation_type": "vehicle_battery_supply",
                        "edge_kind": "company",
                        "status": "strong_candidate",
                        "confidence": 0.82,
                    },
                }
            ],
            "evidence": [
                {
                    "properties": {
                        "chunk_id": "evidence:1",
                        "text": "宁德时代为特斯拉提供动力电池配套。",
                        "source_url": "https://example.com/catl",
                        "source_grade": "A",
                    }
                }
            ],
        }
        store = Neo4jGraphStore(driver=fake_driver)

        payload = store.get_visualization_payload(trace_id="kg_test", project_id="new_energy")

        self.assertEqual(len(payload["graph_nodes"]), 2)
        self.assertEqual(len(payload["graph_edges"]), 1)
        self.assertEqual(len(payload["company_edges"]), 1)
        self.assertEqual(payload["graph_edges"][0]["relation_type"], "vehicle_battery_supply")
        self.assertEqual(payload["evidence_chunks"][0]["source_grade"], "A")


if __name__ == "__main__":
    unittest.main()


