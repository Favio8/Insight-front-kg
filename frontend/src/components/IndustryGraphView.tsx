import { useEffect, useMemo, useRef, useState } from "react";
import CytoscapeComponent from "react-cytoscapejs";
import type { Core, ElementDefinition, EventObject, NodeSingular } from "cytoscape";

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
  relation_candidates?: Relation[];
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

const companyGraphSignature = (relations: Relation[]) =>
  relations
    .map((relation) => `${relation.head}|${relation.relation}|${relation.tail}`)
    .sort()
    .join(";");

const SEGMENT_ORDER = ["上游", "中游", "下游"];
const PROFILE_TYPE_ORDER = ["BusinessLine", "Product", "Technology"];
const SEGMENT_X: Record<string, number> = {
  上游: 170,
  中游: 480,
  下游: 790,
};

function buildNodeIndex(graphPayload?: GraphPayload) {
  const nodesById: Record<string, GraphNode> = {};
  for (const node of graphPayload?.graph_nodes || []) {
    nodesById[node.node_id] = node;
  }
  return nodesById;
}

const segmentNameFromId = (id: string, nodesById: Record<string, GraphNode>) =>
  nodesById[id]?.name || id.split(":").slice(1).join(":") || "未分组";

const buildCompanySegments = (
  graphPayload: GraphPayload | undefined,
  nodesById: Record<string, GraphNode>,
) => {
  const companySegments: Record<string, string> = {};
  for (const relation of graphPayload?.relation_candidates || []) {
    if (relation.relation === "company_in_segment" && relation.head.startsWith("company:")) {
      companySegments[relation.head] = segmentNameFromId(relation.tail, nodesById);
    }
  }
  return companySegments;
};

const captureCompanyPositions = (cy: Core) => {
  const companyPositions: Record<string, { x: number; y: number }> = {};
  cy.nodes(".company").forEach((node: NodeSingular) => {
    const position = node.position();
    companyPositions[node.id()] = { x: position.x, y: position.y };
  });
  return companyPositions;
};

const profileGroup = (relation: Relation) => {
  if (relation.field_name === "business_lines") {
    return "BusinessLine";
  }
  if (relation.field_name === "product_lines") {
    return "Product";
  }
  if (relation.field_name === "core_technologies") {
    return "Technology";
  }
  return nodeType(relation.tail, {}) || "Profile";
};

const profileOffset = (group: string, index: number, count: number) => {
  const spread = 78;
  const centered = (index - (count - 1) / 2) * spread;
  if (group === "BusinessLine") {
    return { x: -190, y: centered };
  }
  if (group === "Product") {
    return { x: 190, y: centered };
  }
  if (group === "Technology") {
    return { x: centered, y: 175 };
  }
  return { x: centered, y: -165 };
};

const buildPositions = (
  graphPayload: GraphPayload | undefined,
  nodesById: Record<string, GraphNode>,
  visibleRelations: Relation[],
  expandedCompanyIds: string[],
  lockedCompanyPositions: Record<string, { x: number; y: number }>,
) => {
  const companySegments = buildCompanySegments(graphPayload, nodesById);
  const visibleCompanyIds = Array.from(
    new Set(
      visibleRelations
        .flatMap((relation) => [
          relation.head.startsWith("company:") ? relation.head : "",
          relation.tail.startsWith("company:") ? relation.tail : "",
        ])
        .filter(Boolean),
    ),
  );
  const companiesBySegment: Record<string, string[]> = {};
  for (const id of visibleCompanyIds) {
    const segment = companySegments[id] || "未分组";
    companiesBySegment[segment] = [...(companiesBySegment[segment] || []), id];
  }

  const orderedSegments = [
    ...SEGMENT_ORDER.filter((segment) => companiesBySegment[segment]?.length),
    ...Object.keys(companiesBySegment)
      .filter((segment) => !SEGMENT_ORDER.includes(segment))
      .sort(),
  ];
  const fallbackX = 170 + SEGMENT_ORDER.length * 250;
  const positions: Record<string, { x: number; y: number }> = {};

  orderedSegments.forEach((segment, segmentIndex) => {
    const companyIds = companiesBySegment[segment] || [];
    const x = SEGMENT_X[segment] || fallbackX + segmentIndex * 230;
    const startY = 150 - ((companyIds.length - 1) * 96) / 2;
    companyIds.forEach((id, index) => {
      positions[id] = { x, y: startY + index * 120 };
    });
  });

  for (const id of visibleCompanyIds) {
    if (lockedCompanyPositions[id]) {
      positions[id] = lockedCompanyPositions[id];
    }
  }

  for (const expandedCompanyId of expandedCompanyIds) {
    const anchor = positions[expandedCompanyId];
    if (!anchor) {
      continue;
    }
    const expandedRelations = visibleRelations.filter(
      (relation) =>
        relation.edge_kind === "profile" &&
        (relation.head === expandedCompanyId || relation.tail === expandedCompanyId),
    );
    const targetsByGroup = new Map<string, string[]>();
    for (const relation of expandedRelations) {
      const target = relation.head === expandedCompanyId ? relation.tail : relation.head;
      const group = profileGroup(relation);
      if (!targetsByGroup.has(group)) {
        targetsByGroup.set(group, []);
      }
      const targets = targetsByGroup.get(group);
      if (targets && !targets.includes(target)) {
        targets.push(target);
      }
    }

    for (const group of PROFILE_TYPE_ORDER) {
      const targets = targetsByGroup.get(group) || [];
      targets.forEach((id, index) => {
        const offset = profileOffset(group, index, targets.length);
        positions[id] = { x: anchor.x + offset.x, y: anchor.y + offset.y };
      });
    }
    for (const [group, targets] of Array.from(targetsByGroup.entries())) {
      if (PROFILE_TYPE_ORDER.includes(group)) {
        continue;
      }
      targets.forEach((id, index) => {
        const offset = profileOffset(group, index, targets.length);
        positions[id] = { x: anchor.x + offset.x, y: anchor.y + offset.y };
      });
    }
  }

  return positions;
};

function buildElements(
  graphPayload: GraphPayload | undefined,
  expandedCompanyIds: string[],
  lockedCompanyPositions: Record<string, { x: number; y: number }>,
) {
  const nodesById = buildNodeIndex(graphPayload);
  const companyEdges = graphPayload?.company_edges || [];
  const expandedCompanySet = new Set(expandedCompanyIds);
  const profileEdges = expandedCompanySet.size > 0
    ? (graphPayload?.profile_edges || []).filter(
        (relation) => expandedCompanySet.has(relation.head) || expandedCompanySet.has(relation.tail),
      )
    : [];
  const visibleRelations = [...companyEdges, ...profileEdges];
  const elements: ElementDefinition[] = [];
  const addedNodes = new Set<string>();
  const hasLockedCompanyPositions = Object.keys(lockedCompanyPositions).length > 0;
  const positions =
    expandedCompanySet.size > 0 || hasLockedCompanyPositions
      ? buildPositions(graphPayload, nodesById, visibleRelations, expandedCompanyIds, lockedCompanyPositions)
      : {};

  const addNode = (id: string) => {
    if (!id || addedNodes.has(id)) return;
    addedNodes.add(id);
    const type = nodeType(id, nodesById);
    const position = positions[id];
    elements.push({
      data: {
        id,
        label: nodeLabel(id, nodesById),
        nodeType: type,
      },
      ...(position ? { position } : {}),
      classes: [
        type.toLowerCase(),
        expandedCompanySet.has(id) ? "expanded-company" : "",
        type === "Company" ? "company-node" : "profile-node",
      ]
        .filter(Boolean)
        .join(" "),
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
  onSelectRelation,
  showDetails = true,
}: {
  graphPayload?: GraphPayload;
  selectedCompanyName?: string | null;
  onSelectCompany?: (name: string) => void;
  onSelectRelation?: (relation: Relation) => void;
  showDetails?: boolean;
}) {
  const [expandedCompanyIds, setExpandedCompanyIds] = useState<string[]>([]);
  const [lockedCompanyPositions, setLockedCompanyPositions] = useState<Record<string, { x: number; y: number }>>({});
  const [lockedViewport, setLockedViewport] = useState<{ zoom: number; pan: { x: number; y: number } } | null>(null);
  const [selectedItem, setSelectedItem] = useState<SelectedItem | null>(null);
  const [cyInstance, setCyInstance] = useState<Core | null>(null);
  const companyGraphSignatureRef = useRef("");

  const nodesById = useMemo(() => buildNodeIndex(graphPayload), [graphPayload]);
  const { elements } = useMemo(
    () => buildElements(graphPayload, expandedCompanyIds, lockedCompanyPositions),
    [graphPayload, expandedCompanyIds, lockedCompanyPositions],
  );
  const companyEdges = graphPayload?.company_edges || [];
  const profileEdges = graphPayload?.profile_edges || [];
  const hasLockedCompanyPositions = Object.keys(lockedCompanyPositions).length > 0;
  const graphSignature = companyGraphSignature(companyEdges);
  const persistenceMeta = graphPayload?.persistence_meta || {};
  const persistenceStatus = String(persistenceMeta.status || "");
  const persistenceReason = String(persistenceMeta.reason || "");
  const persistenceTraceId = String(persistenceMeta.trace_id || "");

  const zoomGraph = (factor: number) => {
    if (!cyInstance) {
      return;
    }
    const nextZoom = Math.max(0.25, Math.min(3, cyInstance.zoom() * factor));
    cyInstance.animate({ zoom: nextZoom }, { duration: 160 });
    window.setTimeout(() => {
      setLockedViewport({ zoom: cyInstance.zoom(), pan: cyInstance.pan() });
    }, 180);
  };

  const fitGraph = () => {
    if (!cyInstance) {
      return;
    }
    cyInstance.animate({ fit: { eles: cyInstance.elements(), padding: 52 } }, { duration: 180 });
    window.setTimeout(() => {
      setLockedViewport({ zoom: cyInstance.zoom(), pan: cyInstance.pan() });
    }, 200);
  };

  useEffect(() => {
    if (graphSignature === companyGraphSignatureRef.current) {
      return;
    }
    companyGraphSignatureRef.current = graphSignature;
    setExpandedCompanyIds([]);
    setSelectedItem(null);
    setLockedCompanyPositions({});
    setLockedViewport(null);
  }, [graphSignature]);

  useEffect(() => {
    if (!selectedCompanyName) return;
    const selectedId = `company:${selectedCompanyName}`;
    if (nodesById[selectedId]) {
      setExpandedCompanyIds((current) => (current.includes(selectedId) ? current : [...current, selectedId]));
      setSelectedItem({
        kind: "node",
        id: selectedId,
        label: selectedCompanyName,
        nodeType: "Company",
      });
    }
  }, [selectedCompanyName, nodesById]);

  useEffect(() => {
    if (!cyInstance || hasLockedCompanyPositions || companyEdges.length === 0) {
      return;
    }

    const lockPositions = () => {
      const companyPositions = captureCompanyPositions(cyInstance);
      if (Object.keys(companyPositions).length > 0) {
        setLockedCompanyPositions(companyPositions);
        setLockedViewport({ zoom: cyInstance.zoom(), pan: cyInstance.pan() });
      }
    };

    cyInstance.one("layoutstop", lockPositions);
    const timer = window.setTimeout(lockPositions, 80);
    return () => {
      window.clearTimeout(timer);
      cyInstance.removeListener("layoutstop", lockPositions);
    };
  }, [cyInstance, hasLockedCompanyPositions, companyEdges.length]);

  useEffect(() => {
    if (!cyInstance || !lockedViewport || !hasLockedCompanyPositions) {
      return;
    }

    const restoreViewport = () => {
      cyInstance.zoom(lockedViewport.zoom);
      cyInstance.pan(lockedViewport.pan);
    };

    restoreViewport();
    const timer = window.setTimeout(restoreViewport, 0);
    return () => window.clearTimeout(timer);
  }, [cyInstance, elements, hasLockedCompanyPositions, lockedViewport]);

  useEffect(() => {
    if (!cyInstance) return;

    const effectNodesById = buildNodeIndex(graphPayload);
    const { visibleRelations } = buildElements(graphPayload, expandedCompanyIds, lockedCompanyPositions);

    const handleNodeTap = (event: EventObject) => {
      const id = String(event.target.id());
      const type = nodeType(id, effectNodesById);
      setSelectedItem({ kind: "node", id, label: nodeLabel(id, effectNodesById), nodeType: type });
      if (type === "Company") {
        setExpandedCompanyIds((current) =>
          current.includes(id) ? current.filter((companyId) => companyId !== id) : [...current, id],
        );
        onSelectCompany?.(nodeLabel(id, effectNodesById));
      }
    };

    const handleEdgeTap = (event: EventObject) => {
      const relId = String(event.target.data("relId") || "");
      const relation = visibleRelations.find((item) => item.rel_id === relId);
      if (relation) {
        setSelectedItem({ kind: "edge", relation });
        onSelectRelation?.(relation);
      }
    };

    cyInstance.on("tap", "node", handleNodeTap);
    cyInstance.on("tap", "edge", handleEdgeTap);
    return () => {
      cyInstance.removeListener("tap", "node", handleNodeTap);
      cyInstance.removeListener("tap", "edge", handleEdgeTap);
    };
  }, [cyInstance, graphPayload, expandedCompanyIds, lockedCompanyPositions, onSelectCompany, onSelectRelation]);

  useEffect(() => {
    if (!cyInstance) return;
    cyInstance.elements().removeClass("expanded");
    for (const expandedCompanyId of expandedCompanyIds) {
      cyInstance.getElementById(expandedCompanyId).addClass("expanded");
    }
  }, [cyInstance, expandedCompanyIds, elements]);

  if (!graphPayload || companyEdges.length === 0) {
    return (
      <div className="rounded-xl border border-outline-variant bg-surface p-5">
        <h4 className="text-[16px] font-bold">完整知识图谱</h4>
        <p className="mt-2 text-[13px] text-on-surface-variant">暂无可视化公司关系。</p>
        {persistenceStatus && (
          <div className="mt-3 space-y-1 rounded-lg border border-outline-variant bg-surface-container-low p-3 text-[12px] text-on-surface-variant">
            <div>入库状态：{persistenceStatus}</div>
            {persistenceReason && <div>原因：{persistenceReason}</div>}
            {persistenceTraceId && <div>trace_id：{persistenceTraceId}</div>}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-outline-variant bg-surface p-5">
      <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
        <div>
          <h4 className="text-[16px] font-bold">完整知识图谱</h4>
          <p className="mt-1 text-[12px] text-on-surface-variant">
            滚轮缩放、拖拽平移；点击公司节点展开/收起画像，点击关系边查看关系证据和来源。
          </p>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2 text-[11px] text-on-surface-variant">
          <span className="rounded-full border border-outline-variant px-3 py-1">公司关系 {companyEdges.length}</span>
          <span className="rounded-full border border-outline-variant px-3 py-1">画像关系 {profileEdges.length}</span>
          <span className="rounded-full bg-primary-container px-3 py-1 text-primary">
            入库状态 {String(graphPayload.persistence_meta?.status || "未启用")}
          </span>
          {selectedItem?.kind === "edge" && (
            <span className="max-w-[220px] truncate rounded-full bg-secondary-container px-3 py-1 font-semibold text-secondary">
              当前关系 {selectedItem.relation.relation_name || selectedItem.relation.relation}
            </span>
          )}
          <div className="ml-1 flex overflow-hidden rounded-md border border-outline-variant bg-surface">
            <button
              type="button"
              onClick={() => zoomGraph(1.2)}
              className="px-2 py-1 text-primary transition-colors hover:bg-primary-container"
              title="放大图谱"
            >
              <span className="material-symbols-outlined text-[16px]">zoom_in</span>
            </button>
            <button
              type="button"
              onClick={() => zoomGraph(1 / 1.2)}
              className="border-l border-outline-variant px-2 py-1 text-primary transition-colors hover:bg-primary-container"
              title="缩小图谱"
            >
              <span className="material-symbols-outlined text-[16px]">zoom_out</span>
            </button>
            <button
              type="button"
              onClick={fitGraph}
              className="border-l border-outline-variant px-2 py-1 text-primary transition-colors hover:bg-primary-container"
              title="重置视图"
            >
              <span className="material-symbols-outlined text-[16px]">center_focus_strong</span>
            </button>
          </div>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px] text-on-surface-variant">
        <span className="inline-flex items-center gap-1 rounded-md bg-surface-container px-2 py-1">
          <span className="material-symbols-outlined text-[15px]">mouse</span>
          拖拽画布
        </span>
        <span className="inline-flex items-center gap-1 rounded-md bg-surface-container px-2 py-1">
          <span className="material-symbols-outlined text-[15px]">zoom_in</span>
          滚轮或按钮缩放
        </span>
        <span className="inline-flex items-center gap-1 rounded-md bg-surface-container px-2 py-1">
          <span className="material-symbols-outlined text-[15px]">ads_click</span>
          点边看关系证据
        </span>
        <span className="inline-flex items-center gap-1 rounded-md bg-surface-container px-2 py-1">
          <span className="material-symbols-outlined text-[15px]">account_tree</span>
          点公司展开画像
        </span>
      </div>

      <div className={`mt-4 grid gap-4 ${showDetails ? "xl:grid-cols-[minmax(0,1fr)_320px]" : ""}`}>
        <div className="overflow-hidden rounded-xl border border-outline-variant bg-surface-container-low">
          <CytoscapeComponent
            elements={elements}
            style={{ width: "100%", height: "520px" }}
            cy={(cy: Core) => setCyInstance(cy)}
            layout={
              expandedCompanyIds.length > 0 || hasLockedCompanyPositions
                ? { name: "preset", animate: false, fit: false, padding: 62 }
                : { name: "cose", animate: false, fit: true, padding: 48 }
            }
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
                selector: ".expanded-company",
                style: {
                  "border-width": 5,
                  "border-color": "#f59e0b",
                  width: 86,
                  height: 86,
                },
              },
              {
                selector: ".profile-node",
                style: {
                  width: 48,
                  height: 48,
                  "font-size": 9,
                  "text-wrap": "wrap",
                  "text-max-width": "82px",
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
                  "line-style": "dashed",
                },
              },
            ]}
          />
          {!showDetails && selectedItem && (
            <div className="border-t border-outline-variant bg-surface p-4">
              <GraphDetailPanel selectedItem={selectedItem} nodesById={nodesById} compact />
            </div>
          )}
        </div>

        {showDetails && (
          <div className="rounded-xl border border-outline-variant bg-surface-container-low p-4 text-[13px]">
            <GraphDetailPanel selectedItem={selectedItem} nodesById={nodesById} />
          </div>
        )}
      </div>
    </div>
  );
}

function GraphDetailPanel({
  selectedItem,
  nodesById,
  compact = false,
}: {
  selectedItem: SelectedItem | null;
  nodesById: Record<string, GraphNode>;
  compact?: boolean;
}) {
  return (
    <div className={compact ? "text-[13px]" : ""}>
      <div className="font-bold">图谱详情</div>
      {!selectedItem && (
        <div className="mt-3 text-on-surface-variant">
          点击公司节点可展开画像层；点击关系边可查看证据、来源和置信度。滚轮或右上角按钮可以缩放图谱。
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
            {nodeLabel(selectedItem.relation.head, nodesById)} → {nodeLabel(selectedItem.relation.tail, nodesById)}
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
    </div>
  );
}
