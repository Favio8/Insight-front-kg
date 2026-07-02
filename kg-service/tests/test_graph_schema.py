import json
import unittest


class GraphSchemaTests(unittest.TestCase):
    def test_graph_payload_to_dict_is_json_serializable(self):
        from kg_graph.schema import (
            EvidenceChunk,
            GraphNode,
            GraphPayload,
            RelationCandidate,
        )

        node = GraphNode(
            node_id="company:宁德时代",
            node_type="Company",
            name="宁德时代",
            aliases=["CATL"],
            normalized_name="宁德时代",
            source_refs=["source:https://example.com/a"],
            raw_mentions=["宁德时代新能源科技股份有限公司"],
        )
        chunk = EvidenceChunk(
            chunk_id="evidence:1",
            text="宁德时代主营动力电池和储能系统。",
            source_url="https://example.com/a",
            source_title="宁德时代年报",
            source_grade="A",
        )
        relation = RelationCandidate(
            rel_id="rel:1",
            head="company:宁德时代",
            head_type="Company",
            relation="company_has_product",
            tail="product:动力电池",
            tail_type="Product",
            evidence_refs=["evidence:1"],
            evidence_text="宁德时代主营动力电池和储能系统。",
            source_url="https://example.com/a",
            source_title="宁德时代年报",
            source_grade="A",
            relation_origin="explicit_evidence",
            confidence=0.88,
            status="verified",
            direction_uncertain=False,
            score_breakdown={"base": 0.5, "source_grade": 0.15},
        )
        payload = GraphPayload(
            task_profile={"industry": "新能源"},
            graph_nodes=[node],
            relation_candidates=[relation],
            graph_edges=[relation],
            evidence_chunks=[chunk],
            normalization_index=[
                {
                    "raw": "宁德时代新能源科技股份有限公司",
                    "canonical_id": "company:宁德时代",
                    "method": "alias_match",
                }
            ],
            confidence_meta={"rule_version": "v1.0"},
            qa_index_hints={"industries": ["新能源"]},
        )

        serialized = payload.to_dict()

        self.assertEqual(serialized["graph_nodes"][0]["node_id"], "company:宁德时代")
        self.assertEqual(serialized["relation_candidates"][0]["status"], "verified")
        json.dumps(serialized, ensure_ascii=False)

    def test_validate_graph_payload_accepts_builder_output(self):
        from kg_graph.builder import build_graph_payload
        from kg_graph.validation import validate_graph_payload
        from tests.test_graph_extractor import sample_insight_payload

        validate_graph_payload(build_graph_payload(sample_insight_payload()))

    def test_validate_graph_payload_rejects_unresolved_graph_edge_endpoint(self):
        from kg_graph.validation import GraphPayloadValidationError, validate_graph_payload

        payload = {
            "graph_nodes": [{"node_id": "company:a", "node_type": "Company", "name": "A"}],
            "relation_candidates": [],
            "graph_edges": [
                {
                    "rel_id": "rel:1",
                    "head": "company:a",
                    "tail": "company:missing",
                    "relation": "supply",
                    "status": "verified",
                    "evidence_refs": [],
                }
            ],
            "evidence_chunks": [],
        }

        with self.assertRaises(GraphPayloadValidationError) as context:
            validate_graph_payload(payload)

        self.assertEqual(context.exception.reason, "schema_validation_failed")
        self.assertTrue(any("tail references missing node" in detail for detail in context.exception.details))

    def test_validate_graph_payload_rejects_weak_graph_edge_status(self):
        from kg_graph.validation import GraphPayloadValidationError, validate_graph_payload

        payload = {
            "graph_nodes": [
                {"node_id": "company:a", "node_type": "Company", "name": "A"},
                {"node_id": "company:b", "node_type": "Company", "name": "B"},
            ],
            "relation_candidates": [],
            "graph_edges": [
                {
                    "rel_id": "rel:1",
                    "head": "company:a",
                    "tail": "company:b",
                    "relation": "supply",
                    "status": "weak_candidate",
                    "evidence_refs": [],
                }
            ],
            "evidence_chunks": [],
        }

        with self.assertRaises(GraphPayloadValidationError):
            validate_graph_payload(payload)


if __name__ == "__main__":
    unittest.main()


