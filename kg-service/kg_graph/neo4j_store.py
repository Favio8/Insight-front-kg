from __future__ import annotations

import re
from typing import Any


EDGE_STATUSES = {"verified", "strong_candidate"}


def sanitize_relation_type(value: str) -> str:
    cleaned = re.sub(r"[^A-Za-z0-9_]+", "_", str(value or "").strip()).strip("_").upper()
    if not cleaned:
        return "RELATED_TO"
    if not re.match(r"^[A-Z_]", cleaned):
        cleaned = f"REL_{cleaned}"
    return cleaned


def _sanitize_label(value: str) -> str:
    cleaned = re.sub(r"[^A-Za-z0-9_]+", "", str(value or "").strip())
    return cleaned or "GraphNode"


class Neo4jGraphStore:
    def __init__(
        self,
        uri: str = "",
        user: str = "neo4j",
        password: str = "password",
        driver: Any | None = None,
    ):
        if driver is not None:
            self._driver = driver
            return

        from neo4j import GraphDatabase

        self._driver = GraphDatabase.driver(uri, auth=(user, password))

    def close(self) -> None:
        close = getattr(self._driver, "close", None)
        if callable(close):
            close()

    def init_schema(self) -> None:
        with self._driver.session() as session:
            self._init_schema(session)

    def persist_graph_payload(
        self,
        graph_payload: dict[str, Any],
        trace_id: str = "",
        created_at: str = "",
        project_id: str = "",
        document_id: str = "",
        version: str = "v1",
    ) -> dict[str, int]:
        graph_nodes = list(graph_payload.get("graph_nodes") or [])
        evidence_chunks = list(graph_payload.get("evidence_chunks") or [])
        graph_edges = [
            relation
            for relation in graph_payload.get("graph_edges") or []
            if str(relation.get("status") or "") in EDGE_STATUSES
        ]
        context = {
            "trace_id": trace_id,
            "created_at": created_at,
            "updated_at": created_at,
            "project_id": project_id,
            "document_id": document_id,
            "version": version,
        }

        with self._driver.session() as session:
            self._init_schema(session)
            write = getattr(session, "execute_write", None)
            if callable(write):
                write(self._write_graph_payload_tx, graph_nodes, evidence_chunks, graph_edges, context)
            else:
                self._write_graph_payload_tx(session, graph_nodes, evidence_chunks, graph_edges, context)

        return {
            "node_count": len(graph_nodes),
            "relation_count": len(graph_edges),
            "edge_count": len(graph_edges),
            "evidence_count": len(evidence_chunks),
        }

    def get_visualization_payload(self, trace_id: str = "", project_id: str = "") -> dict[str, Any]:
        params = {"trace_id": trace_id, "project_id": project_id}
        with self._driver.session() as session:
            node_rows = self._rows(
                session.run(
                    """
                    MATCH (n)
                    WHERE n.node_id IS NOT NULL
                      AND NOT n:EvidenceChunk
                      AND NOT n:RelationFact
                      AND (
                        ($trace_id <> '' AND ($trace_id IN coalesce(n.trace_ids, []) OR n.trace_id = $trace_id))
                        OR ($project_id <> '' AND (n.project_id = $project_id OR $project_id IN coalesce(n.project_ids, [])))
                      )
                    RETURN labels(n) AS labels, properties(n) AS properties
                    """,
                    params,
                )
            )
            edge_rows = self._rows(
                session.run(
                    """
                    MATCH (h)-[r]->(t)
                    WHERE r.rel_id IS NOT NULL
                      AND (
                        ($trace_id <> '' AND ($trace_id IN coalesce(r.trace_ids, []) OR r.trace_id = $trace_id))
                        OR ($project_id <> '' AND (r.project_id = $project_id OR $project_id IN coalesce(r.project_ids, [])))
                      )
                    RETURN h.node_id AS head,
                           t.node_id AS tail,
                           labels(h) AS head_labels,
                           labels(t) AS tail_labels,
                           type(r) AS neo4j_relation_type,
                           properties(r) AS properties
                    """,
                    params,
                )
            )
            evidence_rows = self._rows(
                session.run(
                    """
                    MATCH (e:EvidenceChunk)
                    WHERE ($trace_id <> '' AND ($trace_id IN coalesce(e.trace_ids, []) OR e.trace_id = $trace_id))
                       OR ($project_id <> '' AND (e.project_id = $project_id OR $project_id IN coalesce(e.project_ids, [])))
                    RETURN properties(e) AS properties
                    """,
                    params,
                )
            )

        graph_nodes = [self._node_from_row(row) for row in node_rows]
        graph_edges = [self._edge_from_row(row) for row in edge_rows]
        evidence_chunks = [self._evidence_from_row(row) for row in evidence_rows]
        return {
            "task_profile": {"project_id": project_id, "trace_id": trace_id},
            "graph_nodes": graph_nodes,
            "relation_candidates": graph_edges,
            "graph_edges": graph_edges,
            "company_edges": [edge for edge in graph_edges if edge.get("edge_kind") == "company"],
            "profile_edges": [edge for edge in graph_edges if edge.get("edge_kind") == "profile"],
            "structural_edges": [edge for edge in graph_edges if edge.get("edge_kind") == "structural"],
            "inter_company_relations": [edge for edge in graph_edges if edge.get("edge_kind") == "company"],
            "evidence_chunks": evidence_chunks,
            "normalization_index": [],
            "confidence_meta": {
                "source": "neo4j",
                "edge_statuses": sorted(EDGE_STATUSES),
                "edge_count": len(graph_edges),
            },
            "qa_index_hints": {
                "companies": [node["name"] for node in graph_nodes if node.get("node_type") == "Company"],
                "relations": sorted({edge.get("relation", "") for edge in graph_edges if edge.get("relation")}),
                "evidence_count": len(evidence_chunks),
            },
        }

    def _write_graph_payload_tx(
        self,
        tx: Any,
        graph_nodes: list[dict[str, Any]],
        evidence_chunks: list[dict[str, Any]],
        graph_edges: list[dict[str, Any]],
        context: dict[str, str],
    ) -> None:
        for node in graph_nodes:
            self._upsert_node(tx, node, context)
        for chunk in evidence_chunks:
            self._upsert_evidence(tx, chunk, context)
        for relation in graph_edges:
            self._upsert_relation(tx, relation, context)

    def _init_schema(self, session: Any) -> None:
        constraints = (
            ("Industry", "node_id"),
            ("Segment", "node_id"),
            ("Subsegment", "node_id"),
            ("Company", "node_id"),
            ("BusinessLine", "node_id"),
            ("Product", "node_id"),
            ("Technology", "node_id"),
            ("Source", "node_id"),
            ("EvidenceChunk", "chunk_id"),
            ("RelationFact", "rel_id"),
        )
        for label, prop in constraints:
            session.run(
                f"CREATE CONSTRAINT {label.lower()}_{prop}_unique IF NOT EXISTS "
                f"FOR (n:{label}) REQUIRE n.{prop} IS UNIQUE"
            )
        indexes = (
            "CREATE INDEX relationfact_trace_id IF NOT EXISTS FOR (n:RelationFact) ON (n.trace_id)",
            "CREATE INDEX relationfact_project_id IF NOT EXISTS FOR (n:RelationFact) ON (n.project_id)",
            "CREATE INDEX evidencechunk_trace_id IF NOT EXISTS FOR (n:EvidenceChunk) ON (n.trace_id)",
            "CREATE INDEX evidencechunk_project_id IF NOT EXISTS FOR (n:EvidenceChunk) ON (n.project_id)",
        )
        for query in indexes:
            session.run(query)

    def _upsert_node(self, session: Any, node: dict[str, Any], context: dict[str, str]) -> None:
        label = _sanitize_label(str(node.get("node_type") or "GraphNode"))
        node_id = str(node.get("node_id") or "").strip()
        if not node_id:
            return

        properties = {
            "node_id": node_id,
            "name": str(node.get("name") or "").strip(),
            "normalized_name": str(node.get("normalized_name") or "").strip(),
            "aliases": _string_list(node.get("aliases")),
            "source_refs": _string_list(node.get("source_refs")),
            "raw_mentions": _string_list(node.get("raw_mentions")),
            "normalization_method": str(node.get("normalization_method") or "").strip(),
            "entity_id": node_id,
            "entity_type": label,
            "source": _first_string(node.get("source_refs") or []),
            "evidence": "",
            "confidence": _float_or_zero(node.get("confidence")),
            "project_id": context["project_id"],
            "document_id": context["document_id"],
            "version": context["version"],
        }
        session.run(
            f"""
            MERGE (n:{label} {{node_id: $node_id}})
            SET n += $properties
            SET n.created_at = coalesce(n.created_at, $created_at),
                n.updated_at = $updated_at,
                n.trace_id = $trace_id,
                n.trace_ids = CASE
                    WHEN $trace_id = '' THEN coalesce(n.trace_ids, [])
                    WHEN $trace_id IN coalesce(n.trace_ids, []) THEN coalesce(n.trace_ids, [])
                    ELSE coalesce(n.trace_ids, []) + $trace_id
                END,
                n.project_ids = CASE
                    WHEN $project_id = '' THEN coalesce(n.project_ids, [])
                    WHEN $project_id IN coalesce(n.project_ids, []) THEN coalesce(n.project_ids, [])
                    ELSE coalesce(n.project_ids, []) + $project_id
                END
            """,
            {"node_id": node_id, "properties": properties, **context},
        )

    def _upsert_evidence(self, session: Any, chunk: dict[str, Any], context: dict[str, str]) -> None:
        chunk_id = str(chunk.get("chunk_id") or "").strip()
        if not chunk_id:
            return

        source_url = str(chunk.get("source_url") or "").strip()
        properties = {
            "chunk_id": chunk_id,
            "text": str(chunk.get("text") or "").strip(),
            "source_url": source_url,
            "source_title": str(chunk.get("source_title") or "").strip(),
            "source_grade": str(chunk.get("source_grade") or "").strip(),
            "entity_id": chunk_id,
            "entity_type": "EvidenceChunk",
            "source": source_url,
            "evidence": str(chunk.get("text") or "").strip(),
            "confidence": 1.0,
            "project_id": context["project_id"],
            "document_id": context["document_id"],
            "version": context["version"],
        }
        session.run(
            """
            MERGE (e:EvidenceChunk {chunk_id: $chunk_id})
            SET e += $properties
            SET e.created_at = coalesce(e.created_at, $created_at),
                e.updated_at = $updated_at,
                e.trace_id = $trace_id,
                e.trace_ids = CASE
                    WHEN $trace_id = '' THEN coalesce(e.trace_ids, [])
                    WHEN $trace_id IN coalesce(e.trace_ids, []) THEN coalesce(e.trace_ids, [])
                    ELSE coalesce(e.trace_ids, []) + $trace_id
                END,
                e.project_ids = CASE
                    WHEN $project_id = '' THEN coalesce(e.project_ids, [])
                    WHEN $project_id IN coalesce(e.project_ids, []) THEN coalesce(e.project_ids, [])
                    ELSE coalesce(e.project_ids, []) + $project_id
                END
            """,
            {"chunk_id": chunk_id, "properties": properties, **context},
        )
        if source_url:
            source_node_id = f"source:{source_url}"
            session.run(
                """
                MERGE (s:Source {node_id: $source_node_id})
                SET s.name = $source_url,
                    s.normalized_name = $source_url,
                    s.source_refs = [$source_url],
                    s.entity_id = $source_node_id,
                    s.entity_type = 'Source',
                    s.source = $source_url,
                    s.evidence = '',
                    s.confidence = 1.0,
                    s.project_id = $project_id,
                    s.document_id = $document_id,
                    s.version = $version,
                    s.created_at = coalesce(s.created_at, $created_at),
                    s.updated_at = $updated_at,
                    s.trace_id = $trace_id,
                    s.trace_ids = CASE
                        WHEN $trace_id = '' THEN coalesce(s.trace_ids, [])
                        WHEN $trace_id IN coalesce(s.trace_ids, []) THEN coalesce(s.trace_ids, [])
                        ELSE coalesce(s.trace_ids, []) + $trace_id
                    END,
                    s.project_ids = CASE
                        WHEN $project_id = '' THEN coalesce(s.project_ids, [])
                        WHEN $project_id IN coalesce(s.project_ids, []) THEN coalesce(s.project_ids, [])
                        ELSE coalesce(s.project_ids, []) + $project_id
                    END
                WITH s
                MATCH (e:EvidenceChunk {chunk_id: $chunk_id})
                MERGE (e)-[:FROM_SOURCE]->(s)
                """,
                {
                    "source_node_id": source_node_id,
                    "source_url": source_url,
                    "chunk_id": chunk_id,
                    **context,
                },
            )

    def _upsert_relation(self, session: Any, relation: dict[str, Any], context: dict[str, str]) -> None:
        rel_id = str(relation.get("rel_id") or "").strip()
        head = str(relation.get("head") or "").strip()
        tail = str(relation.get("tail") or "").strip()
        if not rel_id or not head or not tail:
            return

        rel_type = sanitize_relation_type(str(relation.get("relation") or "RELATED_TO"))
        relation_name = str(relation.get("relation") or "").strip()
        properties = {
            "rel_id": rel_id,
            "relation": relation_name,
            "relation_type": relation_name,
            "relation_name": str(relation.get("relation_name") or "").strip(),
            "relation_level": str(relation.get("relation_level") or "").strip(),
            "relation_origin": str(relation.get("relation_origin") or "").strip(),
            "direction": str(relation.get("direction") or "").strip(),
            "explanation": str(relation.get("explanation") or "").strip(),
            "edge_kind": str(relation.get("edge_kind") or "").strip(),
            "confidence": _float_or_zero(relation.get("confidence")),
            "status": str(relation.get("status") or "").strip(),
            "evidence_text": str(relation.get("evidence_text") or "").strip(),
            "evidence_refs": _string_list(relation.get("evidence_refs")),
            "source_url": str(relation.get("source_url") or "").strip(),
            "source_title": str(relation.get("source_title") or "").strip(),
            "source_grade": str(relation.get("source_grade") or "").strip(),
            "field_name": str(relation.get("field_name") or ""),
            "field_value": str(relation.get("field_value") or ""),
            "direction_uncertain": bool(relation.get("direction_uncertain") or False),
            "entity_id": rel_id,
            "entity_type": "Relation",
            "source": str(relation.get("source_url") or "").strip(),
            "evidence": str(relation.get("evidence_text") or "").strip(),
            "project_id": context["project_id"],
            "document_id": context["document_id"],
            "version": context["version"],
        }

        session.run(
            f"""
            MATCH (h {{node_id: $head}})
            MATCH (t {{node_id: $tail}})
            MERGE (h)-[r:{rel_type} {{rel_id: $rel_id}}]->(t)
            SET r += $properties
            SET r.created_at = coalesce(r.created_at, $created_at),
                r.updated_at = $updated_at,
                r.trace_id = $trace_id,
                r.trace_ids = CASE
                    WHEN $trace_id = '' THEN coalesce(r.trace_ids, [])
                    WHEN $trace_id IN coalesce(r.trace_ids, []) THEN coalesce(r.trace_ids, [])
                    ELSE coalesce(r.trace_ids, []) + $trace_id
                END,
                r.project_ids = CASE
                    WHEN $project_id = '' THEN coalesce(r.project_ids, [])
                    WHEN $project_id IN coalesce(r.project_ids, []) THEN coalesce(r.project_ids, [])
                    ELSE coalesce(r.project_ids, []) + $project_id
                END
            """,
            {"head": head, "tail": tail, "rel_id": rel_id, "properties": properties, **context},
        )
        session.run(
            """
            MATCH (h {node_id: $head})
            MATCH (t {node_id: $tail})
            MERGE (rf:RelationFact {rel_id: $rel_id})
            SET rf += $properties
            SET rf.created_at = coalesce(rf.created_at, $created_at),
                rf.updated_at = $updated_at,
                rf.trace_id = $trace_id,
                rf.trace_ids = CASE
                    WHEN $trace_id = '' THEN coalesce(rf.trace_ids, [])
                    WHEN $trace_id IN coalesce(rf.trace_ids, []) THEN coalesce(rf.trace_ids, [])
                    ELSE coalesce(rf.trace_ids, []) + $trace_id
                END,
                rf.project_ids = CASE
                    WHEN $project_id = '' THEN coalesce(rf.project_ids, [])
                    WHEN $project_id IN coalesce(rf.project_ids, []) THEN coalesce(rf.project_ids, [])
                    ELSE coalesce(rf.project_ids, []) + $project_id
                END
            MERGE (h)-[:HAS_RELATION_FACT]->(rf)
            MERGE (rf)-[:RELATION_TARGET]->(t)
            """,
            {"head": head, "tail": tail, "rel_id": rel_id, "properties": properties, **context},
        )
        for chunk_id in properties["evidence_refs"]:
            session.run(
                """
                MATCH (rf:RelationFact {rel_id: $rel_id})
                MATCH (e:EvidenceChunk {chunk_id: $chunk_id})
                MERGE (rf)-[:SUPPORTED_BY]->(e)
                """,
                {"rel_id": rel_id, "chunk_id": chunk_id},
            )

    def _rows(self, result: Any) -> list[dict[str, Any]]:
        if result is None:
            return []
        data = getattr(result, "data", None)
        if callable(data):
            return list(data())
        return [dict(row) for row in result]

    def _node_from_row(self, row: dict[str, Any]) -> dict[str, Any]:
        properties = dict(row.get("properties") or {})
        labels = list(row.get("labels") or [])
        node_type = str(properties.get("entity_type") or _first_string(labels) or "GraphNode")
        return {
            "node_id": str(properties.get("node_id") or properties.get("entity_id") or ""),
            "node_type": node_type,
            "name": str(properties.get("name") or ""),
            "aliases": _string_list(properties.get("aliases")),
            "normalized_name": str(properties.get("normalized_name") or ""),
            "source_refs": _string_list(properties.get("source_refs")),
            "raw_mentions": _string_list(properties.get("raw_mentions")),
            "normalization_method": str(properties.get("normalization_method") or ""),
            "entity_id": str(properties.get("entity_id") or ""),
            "entity_type": node_type,
            "source": properties.get("source") or "",
            "evidence": properties.get("evidence") or "",
            "confidence": _float_or_zero(properties.get("confidence")),
            "project_id": properties.get("project_id") or "",
            "document_id": properties.get("document_id") or "",
            "version": properties.get("version") or "",
            "created_at": properties.get("created_at") or "",
            "updated_at": properties.get("updated_at") or "",
        }

    def _edge_from_row(self, row: dict[str, Any]) -> dict[str, Any]:
        properties = dict(row.get("properties") or {})
        return {
            "rel_id": str(properties.get("rel_id") or properties.get("entity_id") or ""),
            "head": str(row.get("head") or ""),
            "head_type": str(properties.get("head_type") or _first_string(row.get("head_labels") or []) or ""),
            "relation": str(properties.get("relation") or properties.get("relation_type") or row.get("neo4j_relation_type") or ""),
            "tail": str(row.get("tail") or ""),
            "tail_type": str(properties.get("tail_type") or _first_string(row.get("tail_labels") or []) or ""),
            "evidence_refs": _string_list(properties.get("evidence_refs")),
            "evidence_text": str(properties.get("evidence_text") or properties.get("evidence") or ""),
            "source_url": str(properties.get("source_url") or properties.get("source") or ""),
            "source_title": str(properties.get("source_title") or ""),
            "source_grade": str(properties.get("source_grade") or ""),
            "relation_origin": str(properties.get("relation_origin") or ""),
            "relation_level": str(properties.get("relation_level") or ""),
            "relation_name": str(properties.get("relation_name") or ""),
            "field_name": str(properties.get("field_name") or ""),
            "field_value": str(properties.get("field_value") or ""),
            "direction": str(properties.get("direction") or ""),
            "explanation": str(properties.get("explanation") or ""),
            "edge_kind": str(properties.get("edge_kind") or ""),
            "confidence": _float_or_zero(properties.get("confidence")),
            "status": str(properties.get("status") or ""),
            "direction_uncertain": bool(properties.get("direction_uncertain") or False),
            "score_breakdown": {},
            "entity_id": str(properties.get("entity_id") or ""),
            "entity_type": str(properties.get("entity_type") or "Relation"),
            "relation_type": str(properties.get("relation_type") or ""),
            "source": str(properties.get("source") or ""),
            "evidence": str(properties.get("evidence") or ""),
            "project_id": str(properties.get("project_id") or ""),
            "document_id": str(properties.get("document_id") or ""),
            "version": str(properties.get("version") or ""),
            "created_at": str(properties.get("created_at") or ""),
            "updated_at": str(properties.get("updated_at") or ""),
        }

    def _evidence_from_row(self, row: dict[str, Any]) -> dict[str, Any]:
        properties = dict(row.get("properties") or {})
        return {
            "chunk_id": str(properties.get("chunk_id") or properties.get("entity_id") or ""),
            "text": str(properties.get("text") or properties.get("evidence") or ""),
            "source_url": str(properties.get("source_url") or properties.get("source") or ""),
            "source_title": str(properties.get("source_title") or ""),
            "source_grade": str(properties.get("source_grade") or ""),
            "entity_id": str(properties.get("entity_id") or ""),
            "entity_type": str(properties.get("entity_type") or "EvidenceChunk"),
            "source": str(properties.get("source") or ""),
            "evidence": str(properties.get("evidence") or ""),
            "confidence": _float_or_zero(properties.get("confidence")),
            "project_id": str(properties.get("project_id") or ""),
            "document_id": str(properties.get("document_id") or ""),
            "version": str(properties.get("version") or ""),
            "created_at": str(properties.get("created_at") or ""),
            "updated_at": str(properties.get("updated_at") or ""),
        }


def _first_string(values: Any) -> str:
    if isinstance(values, list):
        for value in values:
            text = str(value or "").strip()
            if text:
                return text
        return ""
    return str(values or "").strip()


def _string_list(values: Any) -> list[str]:
    if not isinstance(values, list):
        return []
    return [str(value) for value in values if str(value or "").strip()]


def _float_or_zero(value: Any) -> float:
    try:
        return float(value or 0.0)
    except (TypeError, ValueError):
        return 0.0
