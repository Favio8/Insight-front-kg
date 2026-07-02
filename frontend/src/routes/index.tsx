import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import IndustryGraphView from "@/components/IndustryGraphView";

export const Route = createFileRoute("/")({
  component: Index,
});

type InsightPayload = {
  task_profile?: Record<string, unknown>;
  chain_skeleton?: ChainSegment[];
  company_cards?: CompanyCard[];
  graph_payload?: GraphPayload;
};

type ChainSegment = {
  segment_key: string;
  segment: string;
  description?: string;
  subsegments?: string[];
};

type CompanyCard = {
  company_name: string;
  aliases?: string[];
  segment: string;
  subsegment: string;
  business_summary?: string;
  company_positioning?: string;
  business_lines?: string[];
  product_lines?: string[];
  core_technologies?: string[];
  relationship_clues?: string[];
  evidence_excerpts?: string[];
};

type GraphNode = {
  node_id: string;
  node_type: string;
  name: string;
};

type Relation = {
  rel_id: string;
  head: string;
  relation: string;
  tail: string;
  evidence_text?: string;
  source_title?: string;
  source_grade?: string;
  source_url?: string;
  relation_name?: string;
  confidence?: number;
  status?: string;
  edge_kind?: string;
};

type GraphPayload = {
  graph_nodes?: GraphNode[];
  company_edges?: Relation[];
  profile_edges?: Relation[];
  graph_edges?: Relation[];
  evidence_chunks?: unknown[];
  persistence_meta?: Record<string, unknown>;
};

type IndustryNode = {
  id: string;
  layer: string;
  layerLabel: string;
  name: string;
  sub: string;
  companies: CompanyCard[];
};

type SampleKind = "pharma" | "new-energy";
type SectionKey = "产业总览" | "企业库" | "关联分析" | "研究报告";

const SAMPLE_CONFIG: Record<SampleKind, { label: string; insight: string; graph?: string }> = {
  pharma: {
    label: "医药行业 sample",
    insight: "/samples/pharma-insight-payload.json",
  },
  "new-energy": {
    label: "新能源汽车 sample",
    insight: "/samples/new-energy-insight-payload.json",
    graph: "/samples/new-energy-graph-payload.json",
  },
};

const LAYER_META: Record<string, { label: string; en: string; icon: string }> = {
  upstream: { label: "上游", en: "UPSTREAM", icon: "arrow_upward" },
  midstream: { label: "中游", en: "MIDSTREAM", icon: "drag_handle" },
  downstream: { label: "下游", en: "DOWNSTREAM", icon: "arrow_downward" },
  support: { label: "支撑", en: "SUPPORT", icon: "add" },
};

const relationColor: Record<string, string> = {
  industry_competition: "#0057c2",
  business_cooperation: "#6d3fd1",
  vehicle_battery_supply: "#0f766e",
};

function Index() {
  const [sampleKind, setSampleKind] = useState<SampleKind>("pharma");
  const [insight, setInsight] = useState<InsightPayload | null>(null);
  const [graph, setGraph] = useState<GraphPayload | null>(null);
  const [selectedIndustry, setSelectedIndustry] = useState<{ layer: string; id: string } | null>(null);
  const [selectedCompany, setSelectedCompany] = useState<string | null>(null);
  const [selectedRelation, setSelectedRelation] = useState<Relation | null>(null);
  const [message, setMessage] = useState("正在加载 sample 数据...");
  const [activeSection, setActiveSection] = useState<SectionKey>("产业总览");

  useEffect(() => {
    void loadSample(sampleKind);
  }, [sampleKind]);

  const industryName = String(insight?.task_profile?.industry || insight?.task_profile?.query || "产业链");
  const industryNodes = useMemo(() => buildIndustryNodes(insight), [insight]);
  const layers = useMemo(() => buildLayers(industryNodes, insight?.chain_skeleton || []), [industryNodes, insight]);
  const activeIndustry =
    selectedIndustry &&
    industryNodes.find((item) => item.layer === selectedIndustry.layer && item.id === selectedIndustry.id);
  const activeCompany =
    findCompany(insight?.company_cards || [], selectedCompany) ||
    activeIndustry?.companies[0] ||
    insight?.company_cards?.[0] ||
    null;

  async function loadSample(kind: SampleKind) {
    try {
      setMessage("正在连接仓库 sample...");
      const config = SAMPLE_CONFIG[kind];
      const insightResponse = await fetch(config.insight);
      if (!insightResponse.ok) {
        throw new Error(`insight sample 加载失败: ${insightResponse.status}`);
      }
      const nextInsight = (await insightResponse.json()) as InsightPayload;
      let nextGraph = nextInsight.graph_payload || null;

      if (config.graph) {
        const graphResponse = await fetch(config.graph);
        if (graphResponse.ok) {
          nextGraph = (await graphResponse.json()) as GraphPayload;
        }
      }

      const nodes = buildIndustryNodes(nextInsight);
      const firstNode = nodes[0] || null;
      const firstCompany =
        nextInsight.company_cards?.find((company) => company.company_name === "国药控股")?.company_name ||
        firstNode?.companies[0]?.company_name ||
        nextInsight.company_cards?.[0]?.company_name ||
        null;

      setInsight({ ...nextInsight, graph_payload: nextGraph || undefined });
      setGraph(nextGraph);
      setSelectedIndustry(firstNode ? { layer: firstNode.layer, id: firstNode.id } : null);
      setSelectedCompany(firstCompany);
      setSelectedRelation(null);
      setMessage(`${config.label} 已连接，知识图谱可点击查看。`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "sample 加载失败。");
    }
  }

  return (
    <div className="min-h-screen flex flex-col bg-background text-on-surface">
      <header className="h-14 bg-surface border-b border-outline-variant flex items-center px-6 gap-4 shrink-0">
        <div className="flex items-center gap-2">
          <span className="material-symbols-outlined text-primary">hub</span>
          <h1 className="text-[16px] font-bold tracking-tight">产业链图谱系统</h1>
        </div>
        <nav className="ml-8 flex items-center gap-1 text-[13px]">
          {(["产业总览", "企业库", "关联分析", "研究报告"] as SectionKey[]).map((item) => (
            <button
              key={item}
              onClick={() => setActiveSection(item)}
              className={`px-3 py-1.5 rounded-md transition-colors ${
                activeSection === item
                  ? "bg-primary-container text-primary font-semibold"
                  : "text-on-surface-variant hover:bg-surface-container"
              }`}
            >
              {item}
            </button>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-3">
          <div className="relative">
            <span className="material-symbols-outlined absolute left-2 top-1/2 -translate-y-1/2 text-on-surface-variant text-[18px]">
              search
            </span>
            <input
              placeholder="搜索企业 / 行业"
              className="pl-8 pr-3 py-1.5 rounded-md bg-surface-container border border-outline-variant text-[13px] w-64 outline-none focus:border-primary"
            />
          </div>
          <select
            value={sampleKind}
            onChange={(event) => setSampleKind(event.target.value as SampleKind)}
            className="py-1.5 px-3 rounded-md bg-surface-container border border-outline-variant text-[13px] outline-none focus:border-primary"
          >
            <option value="pharma">医药行业 sample</option>
            <option value="new-energy">新能源汽车 sample</option>
          </select>
          <button className="p-1.5 rounded hover:bg-surface-container">
            <span className="material-symbols-outlined text-on-surface-variant">notifications</span>
          </button>
          <div className="w-8 h-8 rounded-full bg-primary text-white flex items-center justify-center text-[12px] font-bold">
            KG
          </div>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        <aside className="w-[240px] bg-surface border-r border-outline-variant p-4 overflow-y-auto custom-scrollbar shrink-0">
          {activeSection === "企业库" ? (
            <CompanySidebar
              companies={insight?.company_cards || []}
              selectedCompany={selectedCompany}
              onSelectCompany={(name) => {
                setSelectedCompany(name);
                setSelectedRelation(null);
              }}
            />
          ) : (
            <IndustrySidebar
              layers={layers}
              selectedIndustry={selectedIndustry}
              selectedCompany={selectedCompany}
              onSelectNode={(node) => {
                setSelectedIndustry({ layer: node.layer, id: node.id });
                setSelectedCompany(node.companies[0]?.company_name ?? selectedCompany);
                setSelectedRelation(null);
              }}
            />
          )}
          <div className="mt-5 p-3 rounded-xl bg-surface-container-low border border-outline-variant">
            <p className="text-[10px] font-bold text-outline uppercase tracking-widest mb-2">
              数据接入状态
            </p>
            <p className="text-[12px] leading-relaxed text-on-surface-variant">{message}</p>
            <div className="mt-3 grid grid-cols-2 gap-2 text-[11px]">
              <Metric label="节点" value={graph?.graph_nodes?.length || 0} />
              <Metric label="关系" value={graph?.company_edges?.length || 0} />
              <Metric label="画像" value={graph?.profile_edges?.length || 0} />
              <Metric label="证据" value={graph?.evidence_chunks?.length || 0} />
            </div>
          </div>
        </aside>

        {activeSection === "企业库" ? (
          <EnterpriseLibrary
            graph={graph}
            activeCompany={activeCompany}
            selectedCompany={selectedCompany}
            selectedRelation={selectedRelation}
            onSelectCompany={(name) => {
              setSelectedCompany(name);
              setSelectedRelation(null);
            }}
            onSelectRelation={setSelectedRelation}
          />
        ) : (
        <main className="flex-1 p-6 overflow-y-auto custom-scrollbar flex gap-6">
          <div className="flex-[3] flex flex-col gap-3 min-w-0">
            <div className="flex items-center justify-between bg-surface p-3 rounded-xl border border-outline-variant">
              <div className="flex items-center gap-6">
                <Legend color="bg-primary" label="主体企业" />
                <Legend color="bg-secondary-fixed" label="重点节点" />
                <Legend outline label="标准环节" />
                <Legend color="bg-emerald-600" label="知识图谱关系" />
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[12px] text-on-surface-variant">{industryName}</span>
                {["zoom_in", "zoom_out", "recenter"].map((icon) => (
                  <button
                    key={icon}
                    className="p-1.5 border border-outline-variant rounded hover:bg-surface-container transition-colors"
                  >
                    <span className="material-symbols-outlined">{icon}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="relative bg-surface rounded-2xl border border-outline-variant p-4 pl-10 min-h-[600px] overflow-hidden">
              <div className="absolute left-4 top-0 bottom-0 flex flex-col justify-around py-8 pointer-events-none">
                {layers.map((layer) => (
                  <span
                    key={layer.key}
                    className="origin-left -rotate-90 text-[10px] font-bold text-outline uppercase tracking-widest whitespace-nowrap"
                  >
                    {layer.en} / {layer.label}
                  </span>
                ))}
              </div>
              <div className="space-y-8">
                {layers.map((layer) => (
                  <LayerRow
                    key={layer.key}
                    layer={layer}
                    selectedIndustry={selectedIndustry}
                    selectedCompany={selectedCompany}
                    onSelectIndustry={(node) => {
                      setSelectedIndustry({ layer: node.layer, id: node.id });
                      setSelectedCompany(node.companies[0]?.company_name ?? selectedCompany);
                      setSelectedRelation(null);
                    }}
                    onSelectCompany={(name) => {
                      setSelectedCompany(name);
                      setSelectedRelation(null);
                    }}
                  />
                ))}
              </div>
            </div>

          </div>

          <aside className="flex-[2] min-w-[360px]">
            {activeCompany ? (
              <CompanyDetail
                company={activeCompany}
                industry={activeIndustry}
                graph={graph}
                selectedRelation={selectedRelation}
                onSelectCompany={(name) => {
                  setSelectedCompany(name);
                  setSelectedRelation(null);
                }}
                onSelectRelation={setSelectedRelation}
              />
            ) : (
              <div className="bg-surface rounded-2xl border border-outline-variant p-8 text-center text-on-surface-variant">
                请选择一家企业查看详情
              </div>
            )}
          </aside>
        </main>
        )}
      </div>
    </div>
  );
}

function buildIndustryNodes(payload: InsightPayload | null): IndustryNode[] {
  if (!payload) return [];
  return (payload.chain_skeleton || []).flatMap((segment) => {
    const meta = layerMeta(segment);
    const subsegments = segment.subsegments?.length ? segment.subsegments : [segment.segment];
    return subsegments.map((subsegment, index) => {
      const exactCompanies = (payload.company_cards || []).filter(
        (company) => company.segment === segment.segment && company.subsegment === subsegment,
      );
      const layerCompanies = (payload.company_cards || []).filter((company) => company.segment === segment.segment);
      return {
        id: `${meta.key}-${index}-${subsegment}`,
        layer: meta.key,
        layerLabel: meta.label,
        name: subsegment,
        sub: segment.description || subsegment,
        companies: exactCompanies.length ? exactCompanies : layerCompanies.slice(0, 2),
      };
    });
  });
}

function IndustrySidebar({
  layers,
  selectedIndustry,
  selectedCompany,
  onSelectNode,
}: {
  layers: { key: string; label: string; icon: string; industries: IndustryNode[] }[];
  selectedIndustry: { layer: string; id: string } | null;
  selectedCompany: string | null;
  onSelectNode: (node: IndustryNode) => void;
}) {
  return (
    <>
      <p className="text-[10px] font-bold text-outline uppercase tracking-widest mb-2">行业分类</p>
      <div className="space-y-1">
        {layers.map((layer) => (
          <div key={layer.key}>
            <div className="flex items-center gap-2 px-2 py-1.5 text-[12px] font-bold text-on-surface-variant">
              <span className="material-symbols-outlined text-[16px]">{layer.icon}</span>
              {layer.label}
            </div>
            <div className="ml-4 space-y-0.5">
              {layer.industries.map((node) => {
                const active = selectedIndustry?.layer === node.layer && selectedIndustry.id === node.id;
                const hasSelectedCompany = node.companies.some((company) => company.company_name === selectedCompany);
                return (
                  <button
                    key={node.id}
                    onClick={() => onSelectNode(node)}
                    className={`w-full text-left px-2 py-1.5 rounded text-[13px] transition-colors ${
                      active || hasSelectedCompany
                        ? "bg-primary-container text-primary font-semibold"
                        : "hover:bg-surface-container text-on-surface"
                    }`}
                  >
                    {node.name}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

function CompanySidebar({
  companies,
  selectedCompany,
  onSelectCompany,
}: {
  companies: CompanyCard[];
  selectedCompany: string | null;
  onSelectCompany: (name: string) => void;
}) {
  const grouped = companies.reduce<Record<string, CompanyCard[]>>((acc, company) => {
    acc[company.segment] = acc[company.segment] || [];
    acc[company.segment].push(company);
    return acc;
  }, {});

  return (
    <>
      <div className="mb-3">
        <p className="text-[10px] font-bold text-outline uppercase tracking-widest">企业库</p>
        <h2 className="mt-1 text-[16px] font-bold">所有企业</h2>
        <p className="mt-1 text-[12px] text-on-surface-variant">点击企业后，左侧图谱和右侧画像同步切换。</p>
      </div>
      <div className="space-y-3">
        {Object.entries(grouped).map(([segment, items]) => (
          <div key={segment}>
            <div className="mb-1 px-2 text-[11px] font-bold text-outline">{segment}</div>
            <div className="space-y-1">
              {items.map((company) => {
                const active = selectedCompany === company.company_name;
                return (
                  <button
                    key={company.company_name}
                    onClick={() => onSelectCompany(company.company_name)}
                    className={`w-full rounded-lg border px-3 py-2 text-left transition-colors ${
                      active
                        ? "border-primary bg-primary-container text-primary"
                        : "border-transparent bg-surface-container-low hover:border-primary/40"
                    }`}
                  >
                    <div className="text-[13px] font-bold">{company.company_name}</div>
                    <div className="mt-1 truncate text-[11px] text-on-surface-variant">{company.subsegment}</div>
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

function EnterpriseLibrary({
  graph,
  activeCompany,
  selectedCompany,
  selectedRelation,
  onSelectCompany,
  onSelectRelation,
}: {
  graph: GraphPayload | null;
  activeCompany: CompanyCard | null;
  selectedCompany: string | null;
  selectedRelation: Relation | null;
  onSelectCompany: (name: string) => void;
  onSelectRelation: (relation: Relation) => void;
}) {
  return (
    <main className="custom-scrollbar grid flex-1 grid-cols-[minmax(0,1fr)_380px] gap-6 overflow-y-auto p-6">
      <section className="min-w-0">
        <div className="mb-4 rounded-2xl border border-outline-variant bg-surface p-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-outline">Enterprise Library</p>
              <h2 className="mt-1 text-[20px] font-bold">企业库知识图谱</h2>
              <p className="mt-2 text-[13px] text-on-surface-variant">
                左侧企业列表、图谱节点和右侧企业画像已经联动；点击公司节点会展开业务线、产品线和核心技术。
              </p>
            </div>
            <span className="rounded-full bg-primary-container px-3 py-1 text-[12px] font-semibold text-primary">
              当前企业 {selectedCompany || "未选择"}
            </span>
          </div>
        </div>
        <IndustryGraphView
          graphPayload={graph || undefined}
          selectedCompanyName={selectedCompany}
          onSelectCompany={onSelectCompany}
          showDetails={false}
        />
      </section>
      <aside className="min-w-0">
        {activeCompany ? (
          <CompanyDetail
            company={activeCompany}
            industry={null}
            graph={graph}
            selectedRelation={selectedRelation}
            onSelectCompany={onSelectCompany}
            onSelectRelation={onSelectRelation}
          />
        ) : (
          <div className="rounded-2xl border border-outline-variant bg-surface p-8 text-center text-on-surface-variant">
            请从最左侧企业库选择企业
          </div>
        )}
      </aside>
    </main>
  );
}

function buildLayers(nodes: IndustryNode[], skeleton: ChainSegment[]) {
  return skeleton.map((segment) => {
    const meta = layerMeta(segment);
    return {
      key: meta.key,
      label: meta.label,
      en: meta.en,
      icon: meta.icon,
      industries: nodes.filter((node) => node.layer === meta.key),
    };
  });
}

function layerMeta(segment: ChainSegment) {
  const key = segment.segment_key || segment.segment;
  const fallback = LAYER_META[key] || { label: segment.segment, en: key.toUpperCase(), icon: "hub" };
  return { key, ...fallback };
}

function findCompany(cards: CompanyCard[], name: string | null) {
  return cards.find((card) => card.company_name === name || card.aliases?.includes(String(name))) || null;
}

function nodeName(nodeId: string, graph: GraphPayload | null) {
  const node = graph?.graph_nodes?.find((item) => item.node_id === nodeId);
  return node?.name || nodeId.split(":").slice(1).join(":") || nodeId;
}

function relationLabel(relation: Relation) {
  return relation.relation_name || relation.relation || "关联关系";
}

function Legend({ color, label, outline = false }: { color?: string; label: string; outline?: boolean }) {
  return (
    <div className="flex items-center gap-2">
      <span className={`w-3 h-3 rounded-sm ${outline ? "border border-outline" : color}`} />
      <span className="text-body-sm font-medium">{label}</span>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded bg-surface px-2 py-1">
      <div className="text-outline">{label}</div>
      <div className="font-bold text-on-surface">{value}</div>
    </div>
  );
}

function LayerRow({
  layer,
  selectedIndustry,
  selectedCompany,
  onSelectIndustry,
  onSelectCompany,
}: {
  layer: { key: string; label: string; en: string; industries: IndustryNode[] };
  selectedIndustry: { layer: string; id: string } | null;
  selectedCompany: string | null;
  onSelectIndustry: (node: IndustryNode) => void;
  onSelectCompany: (name: string) => void;
}) {
  return (
    <div className={`grid gap-4 ${layer.industries.length === 1 ? "grid-cols-1" : "grid-cols-2"}`}>
      {layer.industries.map((node) => {
        const active = selectedIndustry?.layer === node.layer && selectedIndustry.id === node.id;
        return (
          <div key={node.id}>
            <button
              onClick={() => onSelectIndustry(node)}
              className={`w-full text-left bg-white p-4 rounded-xl border transition-all ${
                active
                  ? "border-2 border-secondary shadow-lg ring-4 ring-secondary-fixed/30"
                  : "border-outline-variant shadow-sm hover:shadow-md hover:border-primary/40"
              }`}
            >
              <div className="flex items-center gap-3 mb-2">
                <span className={`material-symbols-outlined p-1.5 rounded ${active ? "bg-primary text-white" : "bg-primary-container text-primary"}`}>
                  hub
                </span>
                <div className="flex-1 min-w-0">
                  <h3 className="text-title-sm font-bold text-on-surface truncate">{node.name}</h3>
                  <p className="text-[11px] text-on-surface-variant truncate">{node.sub}</p>
                </div>
                <span className="text-[10px] px-1.5 py-0.5 bg-surface-container-high rounded text-on-surface-variant shrink-0">
                  {node.companies.length} 龙头
                </span>
              </div>
            </button>
            {active && (
              <div className="mt-3 grid grid-cols-1 gap-2 animate-in fade-in slide-in-from-top-2 duration-200">
                <p className="text-[10px] font-bold text-outline uppercase tracking-widest px-1">
                  行业龙头企业
                </p>
                {node.companies.length ? (
                  node.companies.map((company) => {
                    const isSelected = selectedCompany === company.company_name;
                    return (
                      <button
                        key={company.company_name}
                        onClick={() => onSelectCompany(company.company_name)}
                        className={`text-left p-3 rounded-lg border transition-colors ${
                          isSelected
                            ? "bg-primary/5 border-primary"
                            : "bg-surface-container-low border-outline-variant/60 hover:border-primary"
                        }`}
                      >
                        <div className="flex justify-between items-center mb-1">
                          <p className="text-body-sm font-bold text-on-surface">{company.company_name}</p>
                          {isSelected && (
                            <span className="px-2 py-0.5 bg-primary text-white text-[10px] rounded-full">
                              当前聚焦
                            </span>
                          )}
                        </div>
                        <p className="text-[11px] text-on-surface-variant leading-relaxed line-clamp-2">
                          {company.business_summary || company.company_positioning || "sample 中暂无简介。"}
                        </p>
                      </button>
                    );
                  })
                ) : (
                  <div className="text-[12px] text-on-surface-variant bg-surface-container-low border border-outline-variant/60 rounded-lg p-3">
                    sample 中暂无该环节企业。
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function CompanyDetail({
  company,
  industry,
  graph,
  selectedRelation,
  onSelectCompany,
  onSelectRelation,
}: {
  company: CompanyCard;
  industry?: IndustryNode | null;
  graph: GraphPayload | null;
  selectedRelation: Relation | null;
  onSelectCompany: (name: string) => void;
  onSelectRelation: (relation: Relation) => void;
}) {
  return (
    <div className="bg-surface rounded-2xl border border-outline-variant p-5 flex flex-col gap-4 sticky top-6">
      <div className="flex items-start justify-between border-b border-outline-variant pb-3">
        <div>
          <p className="text-[11px] text-on-surface-variant mb-1">{industry?.name || company.subsegment}</p>
          <h2 className="text-headline-md font-bold text-on-surface">{company.company_name}</h2>
          <p className="text-[12px] text-on-surface-variant mt-1">{company.company_positioning}</p>
        </div>
        <span className="px-2 py-1 bg-primary text-white text-[10px] rounded-full whitespace-nowrap">
          核心主体
        </span>
      </div>
      <div>
        <p className="text-[10px] font-bold text-outline uppercase tracking-widest mb-2">企业简介</p>
        <p className="text-[12px] text-on-surface-variant leading-relaxed">
          {company.business_summary || "sample 中暂无企业简介。"}
        </p>
      </div>
      <div className="bg-primary/5 p-4 rounded-xl border border-primary/20">
        <div className="flex justify-between text-[11px] mb-1">
          <span className="text-on-surface-variant">关键指标 · 证据完整度</span>
          <span className="font-bold text-primary">{Math.min(96, 64 + (company.evidence_excerpts?.length || 0) * 8)}%</span>
        </div>
        <div className="w-full bg-outline-variant h-1.5 rounded-full overflow-hidden">
          <div
            className="bg-primary h-full rounded-full transition-all"
            style={{ width: `${Math.min(96, 64 + (company.evidence_excerpts?.length || 0) * 8)}%` }}
          />
        </div>
      </div>
      <div>
        <p className="text-[10px] font-bold text-outline uppercase tracking-widest mb-2">核心关联图谱</p>
        <RelationGraph
          center={company.company_name}
          graph={graph}
          onSelectCompany={onSelectCompany}
          onSelectRelation={onSelectRelation}
        />
      </div>
      {selectedRelation && (
        <div className="bg-surface-container-low rounded-xl border border-outline-variant p-3">
          <p className="text-[10px] font-bold text-outline uppercase tracking-widest mb-2">关系证据</p>
          <p className="text-[13px] font-bold">{relationLabel(selectedRelation)}</p>
          <p className="mt-1 text-[12px] text-on-surface-variant leading-relaxed">
            {selectedRelation.evidence_text || "暂无证据文本。"}
          </p>
          <p className="mt-2 text-[11px] text-outline">
            来源: {[selectedRelation.source_grade, selectedRelation.source_title].filter(Boolean).join(" / ") || "暂无来源"}
          </p>
        </div>
      )}
      <TagList title="主营业务线" tags={company.business_lines || []} />
      <TagList title="产品/服务" tags={company.product_lines || []} />
      <TagList title="核心技术/能力" tags={company.core_technologies || []} />
    </div>
  );
}

function RelationGraph({
  center,
  graph,
  onSelectCompany,
  onSelectRelation,
}: {
  center: string;
  graph: GraphPayload | null;
  onSelectCompany: (name: string) => void;
  onSelectRelation: (relation: Relation) => void;
}) {
  const centerId = `company:${center}`;
  const relations = (graph?.company_edges || []).filter(
    (relation) => relation.head === centerId || relation.tail === centerId,
  );
  const visible = (relations.length ? relations : graph?.company_edges || []).slice(0, 3);
  const positions = [
    { x: 80, y: 40 },
    { x: 320, y: 40 },
    { x: 200, y: 170 },
  ];

  return (
    <div className="relative bg-surface-container-low rounded-xl border border-outline-variant h-[200px] overflow-hidden">
      <svg viewBox="0 0 400 200" className="w-full h-full p-4">
        {visible.map((relation, index) => {
          const position = positions[index] || positions[0];
          const otherId = relation.head === centerId ? relation.tail : relation.head;
          const otherName = nodeName(otherId, graph);
          const color = relationColor[relation.relation] || "#747685";
          return (
            <g key={relation.rel_id}>
              <line x1="200" y1="100" x2={position.x} y2={position.y} stroke={color} strokeWidth="1.5" />
              <circle
                cx={position.x}
                cy={position.y}
                r="28"
                fill="#ffffff"
                stroke={color}
                strokeWidth="1.5"
                className="cursor-pointer"
                onClick={() => onSelectCompany(otherName)}
              />
              <text x={position.x} y={position.y + 4} textAnchor="middle" fill={color} fontSize="10" fontWeight="500">
                {otherName.length > 4 ? otherName.slice(0, 4) : otherName}
              </text>
              <rect
                x={(200 + position.x) / 2 - 25}
                y={(100 + position.y) / 2 - 7}
                width="50"
                height="14"
                rx="2"
                fill="#f7f9fc"
                stroke="#c4c5d6"
                strokeWidth="0.5"
                className="cursor-pointer"
                onClick={() => onSelectRelation(relation)}
              />
              <text
                x={(200 + position.x) / 2}
                y={(100 + position.y) / 2 + 3}
                textAnchor="middle"
                fill="#434653"
                fontSize="8"
                className="pointer-events-none"
              >
                {relationLabel(relation).slice(0, 6)}
              </text>
            </g>
          );
        })}
        <circle cx="200" cy="100" r="36" fill="#002a81" />
        <text x="200" y="104" textAnchor="middle" fill="#ffffff" fontSize="11" fontWeight="bold">
          {center.length > 5 ? center.slice(0, 5) : center}
        </text>
      </svg>
      {visible.length === 0 && (
        <div className="absolute inset-0 flex items-center justify-center text-[12px] text-on-surface-variant">
          暂无公司关系。
        </div>
      )}
      <div className="absolute top-2 left-3">
        <span className="text-[10px] font-bold text-on-surface-variant uppercase tracking-wider">
          核心关联图谱
        </span>
      </div>
    </div>
  );
}

function TagList({ title, tags }: { title: string; tags: string[] }) {
  return (
    <div>
      <p className="text-[10px] font-bold text-outline uppercase tracking-widest mb-2">{title}</p>
      <div className="flex flex-wrap gap-2">
        {tags.length ? (
          tags.map((tag) => (
            <span key={tag} className="px-2 py-1 rounded-full bg-surface-container text-[11px] text-on-surface-variant">
              {tag}
            </span>
          ))
        ) : (
          <span className="text-[12px] text-outline">暂无</span>
        )}
      </div>
    </div>
  );
}
