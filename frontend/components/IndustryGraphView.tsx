import React, { useEffect, useState } from 'react';
import CytoscapeComponent from 'react-cytoscapejs';
import type { Core, ElementDefinition, EventObject } from 'cytoscape';
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

const buildNodeIndex = (graphPayload?: IndustryGraphPayload) => {
  const nodesById: Record<string, IndustryGraphNode> = {};
  for (const node of graphPayload?.graph_nodes || []) {
    nodesById[node.node_id] = node;
  }
  return nodesById;
};

const buildElements = (
  graphPayload: IndustryGraphPayload | undefined,
  expandedCompanyId: string | null,
) => {
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
      classes: relation.edge_kind === 'profile' ? 'profile-edge' : 'company-edge',
    });
  }

  return { elements, visibleRelations };
};

const IndustryGraphView: React.FC<IndustryGraphViewProps> = ({ graphPayload }) => {
  const [expandedCompanyId, setExpandedCompanyId] = useState<string | null>(null);
  const [selectedItem, setSelectedItem] = useState<SelectedItem | null>(null);
  const [cyInstance, setCyInstance] = useState<Core | null>(null);

  const nodesById = buildNodeIndex(graphPayload);
  const { elements } = buildElements(graphPayload, expandedCompanyId);
  const companyEdges = graphPayload?.company_edges || [];
  const profileEdges = graphPayload?.profile_edges || [];
  const persistenceMeta = graphPayload?.persistence_meta || {};
  const persistenceStatus = String(persistenceMeta.status || '');
  const persistenceReason = String(persistenceMeta.reason || '');
  const persistenceTraceId = String(persistenceMeta.trace_id || '');

  useEffect(() => {
    if (!cyInstance) {
      return;
    }

    const effectNodesById = buildNodeIndex(graphPayload);
    const { visibleRelations: effectVisibleRelations } = buildElements(graphPayload, expandedCompanyId);

    const handleNodeTap = (event: EventObject) => {
      const id = String(event.target.id());
      const type = nodeType(id, effectNodesById);
      setSelectedItem({ kind: 'node', id, label: nodeLabel(id, effectNodesById), nodeType: type });
      if (type === 'Company') {
        setExpandedCompanyId((current) => (current === id ? null : id));
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
  }, [cyInstance, graphPayload, expandedCompanyId]);

  if (!graphPayload || companyEdges.length === 0) {
    return (
      <div className="mt-6 rounded-xl border border-white/10 bg-white/5 p-5 text-white">
        <h4 className="text-base font-semibold">产业关系图谱</h4>
        <p className="mt-2 text-sm text-white/60">暂无可视化公司关系。</p>
        {persistenceStatus && (
          <div className="mt-3 space-y-1 rounded border border-white/10 bg-black/25 p-3 text-xs text-white/70">
            <div>入库状态：{persistenceStatus}</div>
            {persistenceReason && <div>原因：{persistenceReason}</div>}
            {persistenceTraceId && <div>trace_id：{persistenceTraceId}</div>}
          </div>
        )}
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
            layout={{ name: 'cose', animate: false, fit: true, padding: 42 }}
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
                  width: 2,
                  opacity: 0.62,
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
