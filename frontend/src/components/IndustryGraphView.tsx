import { useEffect, useMemo, useState } from "react";
import CytoscapeComponent from "react-cytoscapejs";
import type { Core, ElementDefinition, EventObject } from "cytoscape";

export type GraphNode = {
  node_id: string;
  node_type: string;
  name: string;
};

export type Relation = {
  rel_id: string;
  head: string;
  relation: string;
  tail: string;
  evidence_text?: string;
  source_title?: string;
  source_grade?: string;
  source_url?: string;
  relation_name?: string;
  relation_level?: string;
  confidence?: number;
  status?: string;
  edge_kind?: string;
  field_name?: string;
  field_value?: string;
};

export type GraphPayload = {
  graph_nodes?: GraphNode[];
  company_edges?: Relation[];
  profile_edges?: Relation[];
  persistence_meta?: Record<string, unknown>;
};

type SelectedItem =
  | { kind: "node"; id: string; label: string; nodeType: string }
  | { kind: "edge"; relation: Relation };

const nodeLabel = (id: string, nodesById: Record<string, GraphNode>) =>
  nodesById[id]?.name || id.split(":").slice(1).join(":") || id;

const nodeType = (id: string, nodesById: Record<string, GraphNode>) =>
  nodesById[id]?.node_type || id.split(":", 1)[0] || "Node";

const confidenceText = (value: number | undefined) =>
  typeof value === "number" ? value.toFixed(2) : "待核实";

const sourceLabel = (relation: Relation) =>
  [relation.source_grade, relation.source_title || relation.source_url].filter(Boolean).join(" | ") || "无来源";

function buildNodeIndex(graphPayload?: GraphPayload) {
  const nodesById: Record<string, GraphNode> = {};
  for (const node of graphPayload?.graph_nodes || []) {
    nodesById[node.node_id] = node;
  }
  return nodesById;
}

function buildElements(graphPayload: GraphPayload | undefined, expandedCompanyId: string | null) {
  const nodesById = buildNodeIndex(graphPayload);
  const companyEdges = graphPayload?.company_edges || [];
  const profileEdges = expandedCompanyId
    ? (graphPayload?.profile_edges || []).filter(
        (relation) => relation.head === expandedCompanyId || relation.tail === expandedCompanyId,
      )
    : [];
  const visibleRelations = [...companyEdges, ...profileEdges];
  const elements: ElementDefinition[] = [];
  const addedNodes = new Set<string>();

  const addNode = (id: string) => {
    if (!id || addedNodes.has(id)) return;
    addedNodes.add(id);
    const type = nodeType(id, nodesById);
    elements.push({
      data: {
        id,
        label: nodeLabel(id, nodesById),
        nodeType: type,
      },
      classes: type.toLowerCase(),
    });
  };

  for (const relation of visibleRelations) {
    addNode(relation.head);
    addNode(relation.tail);
    elements.push({
      data: {
        id: `edge:${relation.rel_id}`,
        relId: relation.rel_id,
        source: relation.head,
        target: relation.tail,
        label: relation.relation_name || relation.relation,
        confidence: relation.confidence,
      },
      classes: relation.edge_kind === "profile" ? "profile-edge" : "company-edge",
    });
  }

  return { elements, visibleRelations };
}

export default function IndustryGraphView({
  graphPayload,
  selectedCompanyName,
  onSelectCompany,
  showDetails = true,
}: {
  graphPayload?: GraphPayload;
  selectedCompanyName?: string | null;
  onSelectCompany?: (name: string) => void;
  showDetails?: boolean;
}) {
  const [expandedCompanyId, setExpandedCompanyId] = useState<string | null>(null);
  const [selectedItem, setSelectedItem] = useState<SelectedItem | null>(null);
  const [cyInstance, setCyInstance] = useState<Core | null>(null);

  const nodesById = useMemo(() => buildNodeIndex(graphPayload), [graphPayload]);
  const { elements } = useMemo(
    () => buildElements(graphPayload, expandedCompanyId),
    [graphPayload, expandedCompanyId],
  );
  const companyEdges = graphPayload?.company_edges || [];
  const profileEdges = graphPayload?.profile_edges || [];

  useEffect(() => {
    if (!selectedCompanyName) return;
    const selectedId = `company:${selectedCompanyName}`;
    if (nodesById[selectedId]) {
      setExpandedCompanyId(selectedId);
      setSelectedItem({
        kind: "node",
        id: selectedId,
        label: selectedCompanyName,
        nodeType: "Company",
      });
    }
  }, [selectedCompanyName, nodesById]);

  useEffect(() => {
    if (!cyInstance) return;

    const effectNodesById = buildNodeIndex(graphPayload);
    const { visibleRelations } = buildElements(graphPayload, expandedCompanyId);

    const handleNodeTap = (event: EventObject) => {
      const id = String(event.target.id());
      const type = nodeType(id, effectNodesById);
      setSelectedItem({ kind: "node", id, label: nodeLabel(id, effectNodesById), nodeType: type });
      if (type === "Company") {
        setExpandedCompanyId((current) => (current === id ? null : id));
        onSelectCompany?.(nodeLabel(id, effectNodesById));
      }
    };

    const handleEdgeTap = (event: EventObject) => {
      const relId = String(event.target.data("relId") || "");
      const relation = visibleRelations.find((item) => item.rel_id === relId);
      if (relation) {
        setSelectedItem({ kind: "edge", relation });
      }
    };

    cyInstance.on("tap", "node", handleNodeTap);
    cyInstance.on("tap", "edge", handleEdgeTap);
    return () => {
      cyInstance.removeListener("tap", "node", handleNodeTap);
      cyInstance.removeListener("tap", "edge", handleEdgeTap);
    };
  }, [cyInstance, graphPayload, expandedCompanyId, onSelectCompany]);

  useEffect(() => {
    if (!cyInstance) return;
    cyInstance.elements().removeClass("expanded");
    if (expandedCompanyId) {
      cyInstance.getElementById(expandedCompanyId).addClass("expanded");
    }
  }, [cyInstance, expandedCompanyId, elements]);

  if (!graphPayload || companyEdges.length === 0) {
    return (
      <div className="rounded-xl border border-outline-variant bg-surface p-5">
        <h4 className="text-[16px] font-bold">完整知识图谱</h4>
        <p className="mt-2 text-[13px] text-on-surface-variant">暂无可视化公司关系。</p>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-outline-variant bg-surface p-5">
      <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
        <div>
          <h4 className="text-[16px] font-bold">完整知识图谱</h4>
          <p className="mt-1 text-[12px] text-on-surface-variant">
            默认展示公司间关系；点击公司节点展开业务线、产品线和核心技术，点击关系边查看证据。
          </p>
        </div>
        <div className="flex flex-wrap gap-2 text-[11px] text-on-surface-variant">
          <span className="rounded-full border border-outline-variant px-3 py-1">公司关系 {companyEdges.length}</span>
          <span className="rounded-full border border-outline-variant px-3 py-1">画像关系 {profileEdges.length}</span>
          <span className="rounded-full bg-primary-container px-3 py-1 text-primary">
            入库状态 {String(graphPayload.persistence_meta?.status || "未启用")}
          </span>
        </div>
      </div>

      <div className={`mt-4 grid gap-4 ${showDetails ? "xl:grid-cols-[minmax(0,1fr)_320px]" : ""}`}>
        <div className="overflow-hidden rounded-xl border border-outline-variant bg-surface-container-low">
          <CytoscapeComponent
            elements={elements}
            style={{ width: "100%", height: "520px" }}
            cy={(cy: Core) => setCyInstance(cy)}
            layout={{ name: "cose", animate: false, fit: true, padding: 48 }}
            stylesheet={[
              {
                selector: "node",
                style: {
                  label: "data(label)",
                  color: "#191c1e",
                  "font-size": 10,
                  "font-weight": 600,
                  "text-valign": "center",
                  "text-halign": "center",
                  "background-color": "#ffffff",
                  "border-color": "#0057c2",
                  "border-width": 1.5,
                  width: 58,
                  height: 58,
                },
              },
              {
                selector: ".company",
                style: {
                  "background-color": "#002a81",
                  "border-color": "#0057c2",
                  color: "#ffffff",
                  width: 76,
                  height: 76,
                },
              },
              {
                selector: ".expanded",
                style: {
                  "border-width": 4,
                  "border-color": "#f59e0b",
                },
              },
              {
                selector: ".product",
                style: { "background-color": "#dcfce7", "border-color": "#16a34a", color: "#166534" },
              },
              {
                selector: ".technology",
                style: { "background-color": "#ede9fe", "border-color": "#7c3aed", color: "#5b21b6" },
              },
              {
                selector: ".businessline",
                style: { "background-color": "#d8e2ff", "border-color": "#0057c2", color: "#002a81" },
              },
              {
                selector: "edge",
                style: {
                  label: "data(label)",
                  color: "#434653",
                  "font-size": 8,
                  "curve-style": "bezier",
                  "target-arrow-shape": "triangle",
                  "target-arrow-color": "#747685",
                  "line-color": "#747685",
                  width: 1.5,
                  opacity: 0.82,
                },
              },
              {
                selector: ".company-edge",
                style: {
                  "line-color": "#0057c2",
                  "target-arrow-color": "#0057c2",
                  width: 2.5,
                },
              },
              {
                selector: ".profile-edge",
                style: {
                  "line-color": "#0f766e",
                  "target-arrow-color": "#0f766e",
                  width: 1.8,
                  opacity: 0.7,
                },
              },
            ]}
          />
        </div>

        {showDetails && <div className="rounded-xl border border-outline-variant bg-surface-container-low p-4 text-[13px]">
          <div className="font-bold">图谱详情</div>
          {!selectedItem && (
            <div className="mt-3 text-on-surface-variant">
              点击公司节点可展开画像层；点击关系边可查看证据、来源和置信度。
            </div>
          )}
          {selectedItem?.kind === "node" && (
            <div className="mt-3 space-y-2 text-on-surface-variant">
              <div className="text-[16px] font-bold text-on-surface">{selectedItem.label}</div>
              <div>类型: {selectedItem.nodeType}</div>
              {selectedItem.nodeType === "Company" && (
                <div className="rounded-lg bg-primary-container p-3 text-primary">
                  已展开该公司的画像关系。再次点击可收起。
                </div>
              )}
            </div>
          )}
          {selectedItem?.kind === "edge" && (
            <div className="mt-3 space-y-2 text-on-surface-variant">
              <div className="text-[16px] font-bold text-on-surface">
                {selectedItem.relation.relation_name || selectedItem.relation.relation}
              </div>
              <div>
                {nodeLabel(selectedItem.relation.head, nodesById)} →{" "}
                {nodeLabel(selectedItem.relation.tail, nodesById)}
              </div>
              <div>关系层级: {selectedItem.relation.relation_level || selectedItem.relation.edge_kind || "画像关系"}</div>
              <div>置信度: {confidenceText(selectedItem.relation.confidence)}</div>
              <div>状态: {selectedItem.relation.status || "待核实"}</div>
              <div>来源: {sourceLabel(selectedItem.relation)}</div>
              {selectedItem.relation.field_name && (
                <div>
                  画像字段: {selectedItem.relation.field_name}
                  {selectedItem.relation.field_value ? ` / ${selectedItem.relation.field_value}` : ""}
                </div>
              )}
              {selectedItem.relation.evidence_text && (
                <div className="rounded-lg bg-white p-3 text-on-surface">
                  {selectedItem.relation.evidence_text}
                </div>
              )}
              {selectedItem.relation.source_url && (
                <a
                  href={selectedItem.relation.source_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block break-all text-primary hover:underline"
                >
                  {selectedItem.relation.source_url}
                </a>
              )}
            </div>
          )}
        </div>}
      </div>
    </div>
  );
}
