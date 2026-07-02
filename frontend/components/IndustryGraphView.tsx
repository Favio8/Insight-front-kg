import React, { useEffect, useRef, useState } from 'react';
import CytoscapeComponent from 'react-cytoscapejs';
import type { Core, ElementDefinition, EventObject, NodeSingular } from 'cytoscape';
import {
  IndustryGraphNode,
  IndustryGraphPayload,
  IndustryRelationCandidate,
} from '@/types/data';

interface IndustryGraphViewProps {
  graphPayload?: IndustryGraphPayload;
}

type SelectedItem =
  | { kind: 'node'; id: string; label: string; nodeType: string }
  | { kind: 'edge'; relation: IndustryRelationCandidate };

const nodeLabel = (id: string, nodesById: Record<string, IndustryGraphNode>) =>
  nodesById[id]?.name || id.split(':').slice(1).join(':') || id;

const nodeType = (id: string, nodesById: Record<string, IndustryGraphNode>) =>
  nodesById[id]?.node_type || id.split(':', 1)[0] || 'Node';

const confidenceText = (value: number | undefined) =>
  typeof value === 'number' ? value.toFixed(2) : '待核实';

const sourceLabel = (relation: IndustryRelationCandidate) =>
  [relation.source_grade, relation.source_title || relation.source_url].filter(Boolean).join(' | ') || '无来源';

const companyGraphSignature = (relations: IndustryRelationCandidate[]) =>
  relations
    .map((relation) => `${relation.head}|${relation.relation}|${relation.tail}`)
    .sort()
    .join(';');

const SEGMENT_ORDER = ['上游', '中游', '下游'];
const PROFILE_TYPE_ORDER = ['BusinessLine', 'Product', 'Technology'];
const SEGMENT_X: Record<string, number> = {
  上游: 170,
  中游: 480,
  下游: 790,
};

const buildNodeIndex = (graphPayload?: IndustryGraphPayload) => {
  const nodesById: Record<string, IndustryGraphNode> = {};
  for (const node of graphPayload?.graph_nodes || []) {
    nodesById[node.node_id] = node;
  }
  return nodesById;
};

const segmentNameFromId = (id: string, nodesById: Record<string, IndustryGraphNode>) =>
  nodesById[id]?.name || id.split(':').slice(1).join(':') || '未分组';

const buildCompanySegments = (
  graphPayload: IndustryGraphPayload | undefined,
  nodesById: Record<string, IndustryGraphNode>,
) => {
  const companySegments: Record<string, string> = {};
  for (const relation of graphPayload?.relation_candidates || []) {
    if (relation.relation === 'company_in_segment' && relation.head_type === 'Company') {
      companySegments[relation.head] = segmentNameFromId(relation.tail, nodesById);
    }
  }
  return companySegments;
};

const captureCompanyPositions = (cy: Core) => {
  const companyPositions: Record<string, { x: number; y: number }> = {};
  cy.nodes('.company').forEach((node: NodeSingular) => {
    const position = node.position();
    companyPositions[node.id()] = { x: position.x, y: position.y };
  });
  return companyPositions;
};

const profileGroup = (relation: IndustryRelationCandidate) => {
  if (relation.field_name === 'business_lines' || relation.tail_type === 'BusinessLine') {
    return 'BusinessLine';
  }
  if (relation.field_name === 'product_lines' || relation.tail_type === 'Product') {
    return 'Product';
  }
  if (relation.field_name === 'core_technologies' || relation.tail_type === 'Technology') {
    return 'Technology';
  }
  return relation.tail_type || 'Profile';
};

const profileOffset = (group: string, index: number, count: number) => {
  const spread = 78;
  const centered = (index - (count - 1) / 2) * spread;
  if (group === 'BusinessLine') {
    return { x: -190, y: centered };
  }
  if (group === 'Product') {
    return { x: 190, y: centered };
  }
  if (group === 'Technology') {
    return { x: centered, y: 175 };
  }
  return { x: centered, y: -165 };
};

const buildPositions = (
  graphPayload: IndustryGraphPayload | undefined,
  nodesById: Record<string, IndustryGraphNode>,
  visibleRelations: IndustryRelationCandidate[],
  expandedCompanyIds: string[],
  lockedCompanyPositions: Record<string, { x: number; y: number }>,
) => {
  const companySegments = buildCompanySegments(graphPayload, nodesById);
  const visibleCompanyIds = Array.from(
    new Set(
      visibleRelations
        .flatMap((relation) => [
          relation.head_type === 'Company' ? relation.head : '',
          relation.tail_type === 'Company' ? relation.tail : '',
        ])
        .filter(Boolean),
    ),
  );
  const companiesBySegment: Record<string, string[]> = {};
  for (const id of visibleCompanyIds) {
    const segment = companySegments[id] || '未分组';
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
    if (!positions[expandedCompanyId]) {
      continue;
    }
    const anchor = positions[expandedCompanyId];
    const expandedRelations = visibleRelations.filter(
      (relation) =>
        relation.edge_kind === 'profile' &&
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

const buildElements = (
  graphPayload: IndustryGraphPayload | undefined,
  expandedCompanyIds: string[],
  lockedCompanyPositions: Record<string, { x: number; y: number }>,
) => {
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
  const positions = expandedCompanySet.size > 0 || hasLockedCompanyPositions
    ? buildPositions(graphPayload, nodesById, visibleRelations, expandedCompanyIds, lockedCompanyPositions)
    : {};

  const addNode = (id: string) => {
    if (!id || addedNodes.has(id)) {
      return;
    }
    addedNodes.add(id);
    const type = nodeType(id, nodesById);
    elements.push({
      data: {
        id,
        label: nodeLabel(id, nodesById),
        nodeType: type,
      },
      position: positions[id],
      classes: [
        type.toLowerCase(),
        expandedCompanySet.has(id) ? 'expanded-company' : '',
        type === 'Company' ? 'company-node' : 'profile-node',
      ]
        .filter(Boolean)
        .join(' '),
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
      classes: relation.edge_kind === 'profile' ? 'profile-edge' : 'company-edge',
    });
  }

  return { elements, visibleRelations };
};

const IndustryGraphView: React.FC<IndustryGraphViewProps> = ({ graphPayload }) => {
  const [expandedCompanyIds, setExpandedCompanyIds] = useState<string[]>([]);
  const [lockedCompanyPositions, setLockedCompanyPositions] = useState<Record<string, { x: number; y: number }>>({});
  const [lockedViewport, setLockedViewport] = useState<{ zoom: number; pan: { x: number; y: number } } | null>(null);
  const [selectedItem, setSelectedItem] = useState<SelectedItem | null>(null);
  const [cyInstance, setCyInstance] = useState<Core | null>(null);
  const companyGraphSignatureRef = useRef('');

  const nodesById = buildNodeIndex(graphPayload);
  const { elements } = buildElements(graphPayload, expandedCompanyIds, lockedCompanyPositions);
  const companyEdges = graphPayload?.company_edges || [];
  const profileEdges = graphPayload?.profile_edges || [];
  const hasLockedCompanyPositions = Object.keys(lockedCompanyPositions).length > 0;
  const graphSignature = companyGraphSignature(companyEdges);

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

    cyInstance.one('layoutstop', lockPositions);
    const timer = window.setTimeout(lockPositions, 80);
    return () => {
      window.clearTimeout(timer);
      cyInstance.removeListener('layoutstop', lockPositions);
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
    if (!cyInstance) {
      return;
    }

    const effectNodesById = buildNodeIndex(graphPayload);
    const { visibleRelations: effectVisibleRelations } = buildElements(
      graphPayload,
      expandedCompanyIds,
      lockedCompanyPositions,
    );

    const handleNodeTap = (event: EventObject) => {
      const id = String(event.target.id());
      const type = nodeType(id, effectNodesById);
      setSelectedItem({ kind: 'node', id, label: nodeLabel(id, effectNodesById), nodeType: type });
      if (type === 'Company') {
        setExpandedCompanyIds((current) =>
          current.includes(id) ? current.filter((companyId) => companyId !== id) : [...current, id],
        );
      }
    };

    const handleEdgeTap = (event: EventObject) => {
      const relId = String(event.target.data('relId') || '');
      const relation = effectVisibleRelations.find((item) => item.rel_id === relId);
      if (relation) {
        setSelectedItem({ kind: 'edge', relation });
      }
    };

    cyInstance.on('tap', 'node', handleNodeTap);
    cyInstance.on('tap', 'edge', handleEdgeTap);
    return () => {
      cyInstance.removeListener('tap', 'node', handleNodeTap);
      cyInstance.removeListener('tap', 'edge', handleEdgeTap);
    };
  }, [cyInstance, graphPayload, expandedCompanyIds, lockedCompanyPositions]);

  if (!graphPayload || companyEdges.length === 0) {
    return (
      <div className="mt-6 rounded-xl border border-white/10 bg-white/5 p-5 text-white">
        <h4 className="text-base font-semibold">产业关系图谱</h4>
        <p className="mt-2 text-sm text-white/60">暂无可视化公司关系。</p>
      </div>
    );
  }

  return (
    <div className="mt-6 rounded-xl border border-cyan-400/20 bg-slate-950/70 p-5 text-white shadow-2xl shadow-cyan-950/20">
      <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
        <div>
          <h4 className="text-base font-semibold">产业关系图谱</h4>
          <p className="mt-1 text-sm text-white/60">
            默认展示公司间关系；点击公司节点展开业务线、产品线和核心技术。
          </p>
        </div>
        <div className="flex flex-wrap gap-2 text-xs text-white/60">
          <span className="rounded-full border border-amber-300/30 px-3 py-1">公司关系 {companyEdges.length}</span>
          <span className="rounded-full border border-cyan-300/30 px-3 py-1">画像关系 {profileEdges.length}</span>
          <span className="rounded-full border border-slate-300/20 px-3 py-1">
            入库状态 {String(graphPayload.persistence_meta?.status || '未启用')}
          </span>
        </div>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="overflow-hidden rounded-lg border border-white/10 bg-black/30">
          <CytoscapeComponent
            elements={elements}
            style={{ width: '100%', height: '460px' }}
            cy={(cy: Core) => setCyInstance(cy)}
            layout={
              expandedCompanyIds.length > 0 || hasLockedCompanyPositions
                ? { name: 'preset', animate: false, fit: false, padding: 62 }
                : { name: 'cose', animate: false, fit: true, padding: 42 }
            }
            stylesheet={[
              {
                selector: 'node',
                style: {
                  label: 'data(label)',
                  color: '#f8fafc',
                  'font-size': 11,
                  'text-valign': 'center',
                  'text-halign': 'center',
                  'background-color': '#38bdf8',
                  'border-color': '#e0f2fe',
                  'border-width': 1,
                  width: 58,
                  height: 58,
                },
              },
              {
                selector: '.company',
                style: {
                  'background-color': '#f59e0b',
                  'border-color': '#fde68a',
                  width: 72,
                  height: 72,
                  'font-weight': 'bold',
                },
              },
              {
                selector: '.expanded-company',
                style: {
                  'background-color': '#f97316',
                  'border-color': '#fff7ed',
                  'border-width': 5,
                  width: 84,
                  height: 84,
                },
              },
              {
                selector: '.profile-node',
                style: {
                  width: 48,
                  height: 48,
                  'font-size': 10,
                  'text-wrap': 'wrap',
                  'text-max-width': '78px',
                },
              },
              {
                selector: '.product',
                style: { 'background-color': '#22c55e', 'border-color': '#bbf7d0' },
              },
              {
                selector: '.technology',
                style: { 'background-color': '#8b5cf6', 'border-color': '#ddd6fe' },
              },
              {
                selector: '.businessline',
                style: { 'background-color': '#06b6d4', 'border-color': '#cffafe' },
              },
              {
                selector: 'edge',
                style: {
                  label: 'data(label)',
                  color: '#cbd5e1',
                  'font-size': 9,
                  'curve-style': 'bezier',
                  'target-arrow-shape': 'triangle',
                  'target-arrow-color': '#94a3b8',
                  'line-color': '#94a3b8',
                  width: 2,
                  opacity: 0.78,
                },
              },
              {
                selector: '.company-edge',
                style: {
                  'line-color': '#f59e0b',
                  'target-arrow-color': '#f59e0b',
                  width: 3,
                },
              },
              {
                selector: '.profile-edge',
                style: {
                  'line-color': '#22d3ee',
                  'target-arrow-color': '#22d3ee',
                  width: 1.8,
                  opacity: 0.7,
                  'line-style': 'dashed',
                },
              },
            ]}
          />
        </div>

        <div className="rounded-lg border border-white/10 bg-white/5 p-4 text-sm">
          <div className="font-medium">详情</div>
          {!selectedItem && <div className="mt-3 text-white/60">点击节点或关系边查看详情。</div>}
          {selectedItem?.kind === 'node' && (
            <div className="mt-3 space-y-2 text-white/70">
              <div className="text-base font-semibold text-white">{selectedItem.label}</div>
              <div>类型：{selectedItem.nodeType}</div>
              {selectedItem.nodeType === 'Company' && (
                <div className="text-cyan-100">再次点击该公司可收起画像层。</div>
              )}
            </div>
          )}
          {selectedItem?.kind === 'edge' && (
            <div className="mt-3 space-y-2 text-white/70">
              <div className="text-base font-semibold text-white">
                {selectedItem.relation.relation_name || selectedItem.relation.relation}
              </div>
              <div>
                {nodeLabel(selectedItem.relation.head, nodesById)} → {nodeLabel(selectedItem.relation.tail, nodesById)}
              </div>
              <div>关系层级：{selectedItem.relation.relation_level || selectedItem.relation.edge_kind || '画像关系'}</div>
              <div>置信度：{confidenceText(selectedItem.relation.confidence)}</div>
              <div>状态：{selectedItem.relation.status}</div>
              <div>来源：{sourceLabel(selectedItem.relation)}</div>
              {selectedItem.relation.field_name && (
                <div>
                  画像字段：{selectedItem.relation.field_name}
                  {selectedItem.relation.field_value ? ` / ${selectedItem.relation.field_value}` : ''}
                </div>
              )}
              {selectedItem.relation.evidence_text && (
                <div className="rounded-md bg-black/30 p-3 text-white/80">
                  {selectedItem.relation.evidence_text}
                </div>
              )}
              {selectedItem.relation.source_url && (
                <a
                  href={selectedItem.relation.source_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="break-all text-cyan-200 hover:text-cyan-100"
                >
                  {selectedItem.relation.source_url}
                </a>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default IndustryGraphView;
