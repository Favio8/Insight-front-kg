import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import IndustryGraphView from "@/components/IndustryGraphView";

export const Route = createFileRoute("/")({
  component: Index,
});

type InsightPayload = {
  task_profile?: Record<string, unknown>;
  chain_skeleton?: ChainSegment[];
  company_cards?: CompanyCard[];
  graph_payload?: GraphPayload;
  source_index?: SourceItem[];
};

type ChainSegment = {
  segment_key?: string;
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
  relation_level?: string;
  confidence?: number;
  status?: string;
  edge_kind?: string;
  field_name?: string;
  field_value?: string;
};

type EvidenceChunk = {
  chunk_id?: string;
  text?: string;
  source_url?: string;
  source_title?: string;
  source_grade?: string;
};

type SourceItem = {
  url?: string;
  title?: string;
  source_grade?: string;
};

type GraphPayload = {
  graph_nodes?: GraphNode[];
  company_edges?: Relation[];
  profile_edges?: Relation[];
  graph_edges?: Relation[];
  relation_candidates?: Relation[];
  evidence_chunks?: EvidenceChunk[];
  persistence_meta?: Record<string, unknown>;
};

type IngestResponse = {
  graph_payload?: GraphPayload;
  visualization_payload?: GraphPayload;
  persistence_meta?: Record<string, unknown>;
};

type UnwrappedInsight = {
  insight: InsightPayload;
  graph: GraphPayload | null;
  source: string;
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

const KG_API_BASE_URL = import.meta.env.VITE_KG_API_BASE_URL || "http://127.0.0.1:8008";
const INSIGHT_API_BASE_URL = import.meta.env.VITE_INSIGHT_API_BASE_URL || "http://127.0.0.1:8000";
const EMPTY_IMPORT_PAYLOAD = `{
  "task_profile": {
    "industry": "新能源汽车",
    "profile_id": "new_energy"
  },
  "chain_skeleton": [],
  "segment_companies": [],
  "company_cards": [],
  "source_index": []
}`;

function Index() {
  const [sampleKind, setSampleKind] = useState<SampleKind>("new-energy");
  const [insight, setInsight] = useState<InsightPayload | null>(null);
  const [graph, setGraph] = useState<GraphPayload | null>(null);
  const [selectedIndustry, setSelectedIndustry] = useState<{ layer: string; id: string } | null>(null);
  const [selectedCompany, setSelectedCompany] = useState<string | null>(null);
  const [selectedRelation, setSelectedRelation] = useState<Relation | null>(null);
  const [message, setMessage] = useState("Insight is all you need。正在加载 sample 数据...");
  const [activeSection, setActiveSection] = useState<SectionKey>("产业总览");
  const [isIngesting, setIsIngesting] = useState(false);
  const [isFetchingBackendPayload, setIsFetchingBackendPayload] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [jsonImportOpen, setJsonImportOpen] = useState(false);
  const [jsonText, setJsonText] = useState(EMPTY_IMPORT_PAYLOAD);
  const [backendReference, setBackendReference] = useState("");

  useEffect(() => {
    void loadSample(sampleKind);
  }, [sampleKind]);

  const industryName = String(insight?.task_profile?.industry || insight?.task_profile?.query || "产业链");
  const companyCards = insight?.company_cards || [];
  const searchTerm = searchQuery.trim().toLowerCase();
  const industryNodes = useMemo(() => buildIndustryNodes(insight), [insight]);
  const filteredIndustryNodes = useMemo(
    () => (searchTerm ? industryNodes.filter((node) => industryNodeMatches(node, searchTerm)) : industryNodes),
    [industryNodes, searchTerm],
  );
  const filteredCompanies = useMemo(
    () => (searchTerm ? companyCards.filter((company) => companyMatches(company, searchTerm)) : companyCards),
    [companyCards, searchTerm],
  );
  const layers = useMemo(
    () => buildLayers(filteredIndustryNodes, insight?.chain_skeleton || []),
    [filteredIndustryNodes, insight],
  );
  const activeIndustry =
    selectedIndustry &&
    industryNodes.find((item) => item.layer === selectedIndustry.layer && item.id === selectedIndustry.id);
  const activeCompany =
    findCompany(companyCards, selectedCompany) ||
    filteredCompanies[0] ||
    activeIndustry?.companies[0] ||
    companyCards[0] ||
    null;

  useEffect(() => {
    if (!searchTerm) {
      return;
    }
    const matchedCompany = companyCards.find((company) => companyMatches(company, searchTerm));
    if (matchedCompany) {
      setSelectedCompany(matchedCompany.company_name);
      const node = industryNodes.find((item) =>
        item.companies.some((company) => company.company_name === matchedCompany.company_name),
      );
      if (node) {
        setSelectedIndustry({ layer: node.layer, id: node.id });
      }
      return;
    }
    const matchedNode = industryNodes.find((node) => industryNodeMatches(node, searchTerm));
    if (matchedNode) {
      setSelectedIndustry({ layer: matchedNode.layer, id: matchedNode.id });
      setSelectedCompany(matchedNode.companies[0]?.company_name || null);
    }
  }, [searchTerm, companyCards, industryNodes]);

  async function loadSample(kind: SampleKind) {
    try {
      setMessage("正在连接 sample 数据...");
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

      applyInsightPayload(nextInsight, nextGraph);
      setSearchQuery("");
      setJsonText(JSON.stringify(nextInsight, null, 2));
      setMessage(`${config.label} 已连接。Insight is all you need。`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "sample 加载失败。");
    }
  }

  function applyInsightPayload(nextInsight: InsightPayload, nextGraph: GraphPayload | null) {
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
  }

  function openJsonImport() {
    setJsonText(insight ? JSON.stringify(insight, null, 2) : EMPTY_IMPORT_PAYLOAD);
    setJsonImportOpen(true);
  }

  function applyJsonImport() {
    try {
      const parsed = JSON.parse(jsonText);
      const unwrapped = unwrapInsightPayload(parsed);
      if (!unwrapped) {
        throw new Error("未找到 insight_payload，请粘贴后端 /report/ 响应、WebSocket path 消息或裸 insight_payload。");
      }
      applyInsightPayload(unwrapped.insight, unwrapped.graph);
      setSearchQuery("");
      setJsonImportOpen(false);
      setMessage(`已导入 ${unwrapped.source}，可直接写入 Neo4j。`);
    } catch (error) {
      setMessage(error instanceof Error ? `JSON 解析失败：${error.message}` : "JSON 解析失败。");
    }
  }

  async function fetchBackendPayload() {
    const reference = backendReference.trim();
    if (!reference) {
      setMessage("请输入主后端报告 ID、/outputs/*.insight.json 路径或完整 URL。");
      return;
    }

    setIsFetchingBackendPayload(true);
    try {
      setMessage("正在从 Insight 主后端拉取 insight_payload...");
      const url = buildBackendPayloadUrl(reference);
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`主后端返回 ${response.status}`);
      }
      const payload = await response.json();
      const unwrapped = unwrapInsightPayload(payload);
      if (!unwrapped) {
        throw new Error("主后端响应中未找到 insight_payload。");
      }
      applyInsightPayload(unwrapped.insight, unwrapped.graph);
      setJsonText(JSON.stringify(payload, null, 2));
      setSearchQuery("");
      setJsonImportOpen(false);
      setMessage(`已从主后端载入 ${unwrapped.source}，下一步可写入 Neo4j。`);
    } catch (error) {
      setMessage(error instanceof Error ? `主后端拉取失败：${error.message}` : "主后端拉取失败。");
    } finally {
      setIsFetchingBackendPayload(false);
    }
  }

  async function ingestToNeo4j() {
    if (!insight) {
      setMessage("请先加载 sample 或导入 insight_payload。");
      return;
    }

    setIsIngesting(true);
    try {
      setMessage("正在调用 KG 服务生成、校验并写入 Neo4j...");
      const response = await fetch(`${KG_API_BASE_URL}/api/graph/ingest`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(insight),
      });
      if (!response.ok) {
        throw new Error(`KG 服务调用失败: ${response.status}`);
      }
      const result = (await response.json()) as IngestResponse;
      const visualization = result.visualization_payload;
      const nextGraph =
        visualization && ((visualization.graph_nodes?.length || 0) > 0 || (visualization.company_edges?.length || 0) > 0)
          ? visualization
          : result.graph_payload || null;

      if (nextGraph) {
        nextGraph.persistence_meta = result.persistence_meta || nextGraph.persistence_meta;
      }

      setGraph(nextGraph);
      setInsight({ ...insight, graph_payload: result.graph_payload || nextGraph || undefined });
      setSelectedRelation(null);
      setJsonText(JSON.stringify({ ...insight, graph_payload: result.graph_payload || nextGraph || undefined }, null, 2));

      const status = String(result.persistence_meta?.status || "unknown");
      const traceId = String(result.persistence_meta?.trace_id || "");
      const reason = String(result.persistence_meta?.reason || "");
      if (status === "persisted") {
        setMessage(`Neo4j 已写入成功，并已从主存储返回图谱。trace_id=${traceId}`);
      } else {
        setMessage(`Neo4j 写入未成功: ${status}${reason ? ` / ${reason}` : ""}${traceId ? ` / trace_id=${traceId}` : ""}`);
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "KG 服务调用失败。");
    } finally {
      setIsIngesting(false);
    }
  }

  return (
    <div className="flex min-h-screen flex-col bg-background text-on-surface">
      <header className="flex min-h-16 shrink-0 items-center gap-4 border-b border-outline-variant bg-surface px-6">
        <div className="flex min-w-[210px] items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-white">
            <span className="material-symbols-outlined text-[22px]">hub</span>
          </div>
          <div>
            <h1 className="text-[18px] font-black leading-none tracking-tight">Insight</h1>
            <p className="mt-1 text-[11px] font-medium text-on-surface-variant">Insight is all you need</p>
          </div>
        </div>

        <nav className="flex items-center gap-1 text-[13px]">
          {(["产业总览", "企业库", "关联分析", "研究报告"] as SectionKey[]).map((item) => (
            <button
              key={item}
              onClick={() => setActiveSection(item)}
              className={`rounded-md px-3 py-1.5 transition-colors ${
                activeSection === item
                  ? "bg-primary-container font-semibold text-primary"
                  : "text-on-surface-variant hover:bg-surface-container"
              }`}
            >
              {item}
            </button>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-3">
          <div className="relative">
            <span className="material-symbols-outlined absolute left-2 top-1/2 -translate-y-1/2 text-[18px] text-on-surface-variant">
              search
            </span>
            <input
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="搜索企业 / 环节 / 技术 / 产品"
              className="w-72 rounded-md border border-outline-variant bg-surface-container py-1.5 pl-8 pr-8 text-[13px] outline-none focus:border-primary"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery("")}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-on-surface-variant hover:text-primary"
                title="清空搜索"
              >
                <span className="material-symbols-outlined text-[16px]">close</span>
              </button>
            )}
          </div>
          <select
            value={sampleKind}
            onChange={(event) => setSampleKind(event.target.value as SampleKind)}
            className="rounded-md border border-outline-variant bg-surface-container px-3 py-1.5 text-[13px] outline-none focus:border-primary"
          >
            <option value="pharma">医药行业 sample</option>
            <option value="new-energy">新能源汽车 sample</option>
          </select>
          <button
            type="button"
            onClick={openJsonImport}
            className="inline-flex items-center gap-1.5 rounded-md border border-outline-variant px-3 py-1.5 text-[13px] font-semibold text-on-surface transition-colors hover:bg-surface-container"
          >
            <span className="material-symbols-outlined text-[18px]">upload_file</span>
            导入 JSON
          </button>
          <button
            type="button"
            onClick={ingestToNeo4j}
            disabled={isIngesting || !insight}
            className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-[13px] font-semibold text-white transition-colors hover:bg-secondary disabled:cursor-not-allowed disabled:opacity-55"
          >
            <span className="material-symbols-outlined text-[18px]">database</span>
            {isIngesting ? "写入中" : "写入 Neo4j"}
          </button>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        <aside className="custom-scrollbar w-[250px] shrink-0 overflow-y-auto border-r border-outline-variant bg-surface p-4">
          {activeSection === "企业库" ? (
            <CompanySidebar
              companies={filteredCompanies}
              selectedCompany={selectedCompany}
              searchQuery={searchQuery}
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
              searchQuery={searchQuery}
              onSelectNode={(node) => {
                setSelectedIndustry({ layer: node.layer, id: node.id });
                setSelectedCompany(node.companies[0]?.company_name ?? selectedCompany);
                setSelectedRelation(null);
              }}
            />
          )}
          <StatusPanel
            graph={graph}
            message={message}
            searchQuery={searchQuery}
            companyMatchCount={filteredCompanies.length}
            nodeMatchCount={filteredIndustryNodes.length}
          />
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
        ) : activeSection === "关联分析" ? (
          <RelationAnalysis
            graph={graph}
            selectedCompany={selectedCompany}
            selectedRelation={selectedRelation}
            onSelectCompany={(name) => {
              setSelectedCompany(name);
              setSelectedRelation(null);
            }}
            onSelectRelation={setSelectedRelation}
          />
        ) : activeSection === "研究报告" ? (
          <ResearchReport
            insight={insight}
            graph={graph}
            industryName={industryName}
            selectedRelation={selectedRelation}
            onSelectCompany={(name) => {
              setSelectedCompany(name);
              setActiveSection("企业库");
            }}
            onSelectRelation={setSelectedRelation}
          />
        ) : (
          <Overview
            layers={layers}
            industryName={industryName}
            activeCompany={activeCompany}
            activeIndustry={activeIndustry}
            graph={graph}
            selectedIndustry={selectedIndustry}
            selectedCompany={selectedCompany}
            selectedRelation={selectedRelation}
            onSelectIndustry={(node) => {
              setSelectedIndustry({ layer: node.layer, id: node.id });
              setSelectedCompany(node.companies[0]?.company_name ?? selectedCompany);
              setSelectedRelation(null);
            }}
            onSelectCompany={(name) => {
              setSelectedCompany(name);
              setSelectedRelation(null);
            }}
            onSelectRelation={setSelectedRelation}
          />
        )}
      </div>

      {jsonImportOpen && (
        <JsonImportDialog
          jsonText={jsonText}
          backendReference={backendReference}
          isFetchingBackendPayload={isFetchingBackendPayload}
          onChange={setJsonText}
          onReferenceChange={setBackendReference}
          onFetchBackendPayload={fetchBackendPayload}
          onClose={() => setJsonImportOpen(false)}
          onApply={applyJsonImport}
        />
      )}
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

function unwrapInsightPayload(value: unknown): UnwrappedInsight | null {
  if (Array.isArray(value)) {
    for (const item of value) {
      const unwrapped = unwrapInsightPayload(item);
      if (unwrapped) {
        return unwrapped;
      }
    }
    return null;
  }

  if (!isRecord(value)) {
    return null;
  }

  if (isInsightPayload(value)) {
    return {
      insight: value as InsightPayload,
      graph: isGraphPayload(value.graph_payload) ? value.graph_payload : null,
      source: "裸 insight_payload",
    };
  }

  const direct = value.insight_payload;
  if (isInsightPayload(direct)) {
    return {
      insight: direct as InsightPayload,
      graph: isGraphPayload((direct as InsightPayload).graph_payload) ? (direct as InsightPayload).graph_payload || null : null,
      source: "主后端 /report/ 响应",
    };
  }

  for (const key of ["output", "report", "data", "result"]) {
    const nested = value[key];
    const unwrapped = unwrapInsightPayload(nested);
    if (unwrapped) {
      return {
        ...unwrapped,
        source: key === "output" ? "WebSocket path 消息" : unwrapped.source,
      };
    }
  }

  const fromOrderedData = unwrapInsightPayload(value.orderedData);
  if (fromOrderedData) {
    return {
      ...fromOrderedData,
      source: "历史报告 orderedData",
    };
  }

  return null;
}

function isInsightPayload(value: unknown): value is InsightPayload {
  if (!isRecord(value)) {
    return false;
  }
  return (
    Array.isArray(value.chain_skeleton) ||
    Array.isArray(value.company_cards) ||
    Array.isArray(value.segment_companies) ||
    isRecord(value.task_profile)
  );
}

function isGraphPayload(value: unknown): value is GraphPayload {
  if (!isRecord(value)) {
    return false;
  }
  return Array.isArray(value.graph_nodes) || Array.isArray(value.company_edges) || Array.isArray(value.graph_edges);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function buildBackendPayloadUrl(reference: string) {
  if (/^https?:\/\//i.test(reference)) {
    return reference;
  }
  const base = INSIGHT_API_BASE_URL.replace(/\/+$/, "");
  const cleanReference = reference.trim().replace(/^\/+/, "");

  if (cleanReference.startsWith("outputs/") || cleanReference.endsWith(".insight.json")) {
    return `${base}/${cleanReference}`;
  }
  if (cleanReference.startsWith("api/reports/")) {
    return `${base}/${cleanReference}`;
  }
  return `${base}/api/reports/${encodeURIComponent(cleanReference)}`;
}

function IndustrySidebar({
  layers,
  selectedIndustry,
  selectedCompany,
  searchQuery,
  onSelectNode,
}: {
  layers: { key: string; label: string; icon: string; industries: IndustryNode[] }[];
  selectedIndustry: { layer: string; id: string } | null;
  selectedCompany: string | null;
  searchQuery: string;
  onSelectNode: (node: IndustryNode) => void;
}) {
  return (
    <>
      <p className="mb-2 text-[10px] font-bold uppercase tracking-widest text-outline">产业链分类</p>
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
                    className={`w-full rounded px-2 py-1.5 text-left text-[13px] transition-colors ${
                      active || hasSelectedCompany
                        ? "bg-primary-container font-semibold text-primary"
                        : "text-on-surface hover:bg-surface-container"
                    }`}
                  >
                    {node.name}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
        {searchQuery && layers.every((layer) => layer.industries.length === 0) && (
          <div className="rounded-lg border border-outline-variant bg-surface-container-low p-3 text-[12px] text-on-surface-variant">
            没有匹配的产业环节。
          </div>
        )}
      </div>
    </>
  );
}

function CompanySidebar({
  companies,
  selectedCompany,
  searchQuery,
  onSelectCompany,
}: {
  companies: CompanyCard[];
  selectedCompany: string | null;
  searchQuery: string;
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
        <p className="text-[10px] font-bold uppercase tracking-widest text-outline">企业库</p>
        <h2 className="mt-1 text-[16px] font-bold">所有企业</h2>
        <p className="mt-1 text-[12px] text-on-surface-variant">点击企业后，图谱和右侧画像同步切换。</p>
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
        {searchQuery && companies.length === 0 && (
          <div className="rounded-lg border border-outline-variant bg-surface-container-low p-3 text-[12px] text-on-surface-variant">
            没有匹配的企业、产品或技术。
          </div>
        )}
      </div>
    </>
  );
}

function StatusPanel({
  graph,
  message,
  searchQuery,
  companyMatchCount,
  nodeMatchCount,
}: {
  graph: GraphPayload | null;
  message: string;
  searchQuery: string;
  companyMatchCount: number;
  nodeMatchCount: number;
}) {
  return (
    <div className="mt-5 rounded-xl border border-outline-variant bg-surface-container-low p-3">
      <p className="mb-2 text-[10px] font-bold uppercase tracking-widest text-outline">数据接入状态</p>
      <p className="text-[12px] leading-relaxed text-on-surface-variant">{message}</p>
      <div className="mt-3 grid grid-cols-2 gap-2 text-[11px]">
        <Metric label="节点" value={graph?.graph_nodes?.length || 0} />
        <Metric label="关系" value={graph?.company_edges?.length || 0} />
        <Metric label="画像" value={graph?.profile_edges?.length || 0} />
        <Metric label="证据" value={graph?.evidence_chunks?.length || 0} />
      </div>
      {searchQuery && (
        <div className="mt-3 rounded-lg border border-outline-variant bg-surface px-2.5 py-2 text-[11px] text-on-surface-variant">
          搜索匹配：企业 {companyMatchCount} / 环节 {nodeMatchCount}
        </div>
      )}
      {graph?.persistence_meta && (
        <div className="mt-3 rounded-lg border border-outline-variant bg-surface px-2.5 py-2 text-[11px] leading-relaxed text-on-surface-variant">
          <div>
            Neo4j 状态：
            <span className="font-bold text-on-surface">{String(graph.persistence_meta.status || "未执行")}</span>
          </div>
          {graph.persistence_meta.trace_id && <div>trace_id：{String(graph.persistence_meta.trace_id)}</div>}
          {graph.persistence_meta.reason && <div>原因：{String(graph.persistence_meta.reason)}</div>}
        </div>
      )}
    </div>
  );
}

function Overview({
  layers,
  industryName,
  activeCompany,
  activeIndustry,
  graph,
  selectedIndustry,
  selectedCompany,
  selectedRelation,
  onSelectIndustry,
  onSelectCompany,
  onSelectRelation,
}: {
  layers: { key: string; label: string; en: string; industries: IndustryNode[] }[];
  industryName: string;
  activeCompany: CompanyCard | null;
  activeIndustry: IndustryNode | false | null;
  graph: GraphPayload | null;
  selectedIndustry: { layer: string; id: string } | null;
  selectedCompany: string | null;
  selectedRelation: Relation | null;
  onSelectIndustry: (node: IndustryNode) => void;
  onSelectCompany: (name: string) => void;
  onSelectRelation: (relation: Relation) => void;
}) {
  return (
    <main className="custom-scrollbar flex flex-1 gap-6 overflow-y-auto p-6">
      <div className="flex min-w-0 flex-[3] flex-col gap-3">
        <div className="flex items-center justify-between rounded-xl border border-outline-variant bg-surface p-3">
          <div className="flex items-center gap-6">
            <Legend color="bg-primary" label="主体企业" />
            <Legend color="bg-secondary-fixed" label="重点节点" />
            <Legend outline label="标准环节" />
            <Legend color="bg-emerald-600" label="知识图谱关系" />
          </div>
          <div className="text-[12px] text-on-surface-variant">当前产业：{industryName}</div>
        </div>

        <div className="relative min-h-[600px] overflow-hidden rounded-2xl border border-outline-variant bg-surface p-4 pl-10">
          <div className="pointer-events-none absolute bottom-0 left-4 top-0 flex flex-col justify-around py-8">
            {layers.map((layer) => (
              <span
                key={layer.key}
                className="origin-left -rotate-90 whitespace-nowrap text-[10px] font-bold uppercase tracking-widest text-outline"
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
                onSelectIndustry={onSelectIndustry}
                onSelectCompany={onSelectCompany}
              />
            ))}
          </div>
          {layers.length === 0 && (
            <div className="flex h-[480px] items-center justify-center text-[13px] text-on-surface-variant">
              暂无产业链结构。请导入 insight_payload 或加载 sample。
            </div>
          )}
        </div>
      </div>

      <aside className="min-w-[360px] flex-[2]">
        {activeCompany ? (
          <CompanyDetail
            company={activeCompany}
            industry={activeIndustry || null}
            graph={graph}
            selectedRelation={selectedRelation}
            onSelectCompany={onSelectCompany}
            onSelectRelation={onSelectRelation}
          />
        ) : (
          <div className="rounded-2xl border border-outline-variant bg-surface p-8 text-center text-on-surface-variant">
            请选择一家企业查看详情
          </div>
        )}
      </aside>
    </main>
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
          onSelectRelation={onSelectRelation}
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

function RelationAnalysis({
  graph,
  selectedCompany,
  selectedRelation,
  onSelectCompany,
  onSelectRelation,
}: {
  graph: GraphPayload | null;
  selectedCompany: string | null;
  selectedRelation: Relation | null;
  onSelectCompany: (name: string) => void;
  onSelectRelation: (relation: Relation) => void;
}) {
  return (
    <main className="custom-scrollbar flex flex-1 flex-col gap-4 overflow-y-auto p-6">
      <section className="rounded-2xl border border-outline-variant bg-surface p-5">
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-widest text-outline">Relation Analysis</p>
            <h2 className="mt-1 text-[20px] font-bold">知识图谱关系分析</h2>
            <p className="mt-2 max-w-3xl text-[13px] leading-relaxed text-on-surface-variant">
              展示完整公司关系和企业画像关系。可滚轮缩放、拖拽平移，点击公司节点展开画像，点击关系边查看证据、来源、状态和置信度。
            </p>
          </div>
          <div className="grid grid-cols-4 gap-2 text-[11px]">
            <Metric label="节点" value={graph?.graph_nodes?.length || 0} />
            <Metric label="关系" value={graph?.graph_edges?.length || 0} />
            <Metric label="公司边" value={graph?.company_edges?.length || 0} />
            <Metric label="证据" value={graph?.evidence_chunks?.length || 0} />
          </div>
        </div>
        {selectedRelation && (
          <div className="mt-4 rounded-xl border border-primary/20 bg-primary/5 p-3 text-[12px] text-on-surface-variant">
            <span className="font-bold text-on-surface">当前关系：</span>
            {relationLabel(selectedRelation)} / {selectedRelation.status || "待核实"}
          </div>
        )}
      </section>
      <IndustryGraphView
        graphPayload={graph || undefined}
        selectedCompanyName={selectedCompany}
        onSelectCompany={onSelectCompany}
        onSelectRelation={onSelectRelation}
        showDetails
      />
    </main>
  );
}

function ResearchReport({
  insight,
  graph,
  industryName,
  selectedRelation,
  onSelectCompany,
  onSelectRelation,
}: {
  insight: InsightPayload | null;
  graph: GraphPayload | null;
  industryName: string;
  selectedRelation: Relation | null;
  onSelectCompany: (name: string) => void;
  onSelectRelation: (relation: Relation) => void;
}) {
  const companies = insight?.company_cards || [];
  const keyRelations = [...(graph?.company_edges || []), ...(graph?.profile_edges || [])].slice(0, 8);
  const evidence = (graph?.evidence_chunks || []).slice(0, 8);
  const meta = graph?.persistence_meta || {};

  return (
    <main className="custom-scrollbar flex-1 overflow-y-auto p-6">
      <section className="rounded-2xl border border-outline-variant bg-surface p-6">
        <p className="text-[10px] font-bold uppercase tracking-widest text-outline">Insight Report</p>
        <div className="mt-2 flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div>
            <h2 className="text-[24px] font-black">{industryName} 产业知识图谱报告</h2>
            <p className="mt-2 max-w-3xl text-[13px] leading-relaxed text-on-surface-variant">
              基于当前 insight_payload、Neo4j 主存储结果和字段级证据生成的演示报告摘要。
            </p>
          </div>
          <div className="rounded-xl border border-outline-variant bg-surface-container-low p-3 text-[12px] leading-relaxed text-on-surface-variant">
            <div>
              Neo4j 状态：<span className="font-bold text-on-surface">{String(meta.status || "未执行")}</span>
            </div>
            {meta.trace_id && <div>trace_id：{String(meta.trace_id)}</div>}
            {meta.created_at && <div>created_at：{String(meta.created_at)}</div>}
          </div>
        </div>
        <div className="mt-5 grid gap-3 md:grid-cols-5">
          <Metric label="产业环节" value={insight?.chain_skeleton?.length || 0} />
          <Metric label="企业卡" value={companies.length} />
          <Metric label="图谱节点" value={graph?.graph_nodes?.length || 0} />
          <Metric label="正式关系" value={graph?.graph_edges?.length || 0} />
          <Metric label="证据片段" value={graph?.evidence_chunks?.length || 0} />
        </div>
      </section>

      <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
        <section className="space-y-5">
          <ReportSection title="企业摘要">
            <div className="grid gap-3 md:grid-cols-2">
              {companies.slice(0, 6).map((company) => (
                <button
                  key={company.company_name}
                  onClick={() => onSelectCompany(company.company_name)}
                  className="rounded-xl border border-outline-variant bg-surface p-4 text-left transition-colors hover:border-primary/50 hover:bg-primary/5"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h3 className="text-[15px] font-bold">{company.company_name}</h3>
                      <p className="mt-1 text-[11px] text-outline">
                        {company.segment} / {company.subsegment}
                      </p>
                    </div>
                    <span className="rounded-full bg-primary-container px-2 py-0.5 text-[10px] font-bold text-primary">
                      画像
                    </span>
                  </div>
                  <p className="mt-2 line-clamp-3 text-[12px] leading-relaxed text-on-surface-variant">
                    {company.business_summary || company.company_positioning || "暂无企业摘要。"}
                  </p>
                </button>
              ))}
            </div>
          </ReportSection>

          <ReportSection title="关键关系">
            <div className="space-y-2">
              {keyRelations.map((relation) => (
                <button
                  key={relation.rel_id}
                  onClick={() => onSelectRelation(relation)}
                  className="w-full rounded-xl border border-outline-variant bg-surface p-3 text-left transition-colors hover:border-primary/50 hover:bg-primary/5"
                >
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-[13px] font-bold">{relationLabel(relation)}</span>
                    <span className="rounded-full bg-surface-container px-2 py-0.5 text-[10px] text-on-surface-variant">
                      {relation.status || "待核实"}
                    </span>
                  </div>
                  <p className="mt-1 text-[12px] text-on-surface-variant">{relation.evidence_text || "暂无证据文本。"}</p>
                </button>
              ))}
              {keyRelations.length === 0 && <EmptyState text="暂无关键关系，请先写入 Neo4j 或加载 graph_payload。" />}
            </div>
          </ReportSection>
        </section>

        <aside className="space-y-5">
          <ReportSection title="当前选中关系">
            {selectedRelation ? (
              <div className="space-y-2 text-[12px] text-on-surface-variant">
                <div className="text-[15px] font-bold text-on-surface">{relationLabel(selectedRelation)}</div>
                <div>状态：{selectedRelation.status || "待核实"}</div>
                <div>置信度：{typeof selectedRelation.confidence === "number" ? selectedRelation.confidence.toFixed(2) : "待核实"}</div>
                <div className="rounded-lg bg-surface-container-low p-3 text-on-surface">
                  {selectedRelation.evidence_text || "暂无证据文本。"}
                </div>
              </div>
            ) : (
              <EmptyState text="点击关键关系或图谱边后，这里会显示证据摘要。" />
            )}
          </ReportSection>

          <ReportSection title="证据来源">
            <div className="space-y-2">
              {evidence.map((item, index) => (
                <div key={item.chunk_id || index} className="rounded-xl border border-outline-variant bg-surface p-3">
                  <div className="text-[11px] font-bold text-outline">
                    {[item.source_grade, item.source_title].filter(Boolean).join(" / ") || `证据 ${index + 1}`}
                  </div>
                  <p className="mt-1 line-clamp-3 text-[12px] leading-relaxed text-on-surface-variant">{item.text || "暂无证据文本。"}</p>
                  {item.source_url && (
                    <a className="mt-2 block break-all text-[11px] text-primary hover:underline" href={item.source_url} target="_blank" rel="noreferrer">
                      {item.source_url}
                    </a>
                  )}
                </div>
              ))}
              {evidence.length === 0 && <EmptyState text="暂无证据片段。" />}
            </div>
          </ReportSection>
        </aside>
      </div>
    </main>
  );
}

function JsonImportDialog({
  jsonText,
  backendReference,
  isFetchingBackendPayload,
  onChange,
  onReferenceChange,
  onFetchBackendPayload,
  onClose,
  onApply,
}: {
  jsonText: string;
  backendReference: string;
  isFetchingBackendPayload: boolean;
  onChange: (value: string) => void;
  onReferenceChange: (value: string) => void;
  onFetchBackendPayload: () => void;
  onClose: () => void;
  onApply: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/35 p-6">
      <section className="flex h-[78vh] w-full max-w-5xl flex-col rounded-2xl border border-outline-variant bg-surface shadow-2xl">
        <div className="flex items-start justify-between gap-4 border-b border-outline-variant p-5">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-widest text-outline">Import insight_payload</p>
            <h2 className="mt-1 text-[20px] font-bold">导入后端 JSON</h2>
            <p className="mt-1 text-[13px] text-on-surface-variant">
              支持粘贴主后端 /report/ 完整响应、WebSocket path 消息、/api/reports 返回内容或裸 insight_payload。
            </p>
          </div>
          <button type="button" onClick={onClose} className="rounded-md p-1.5 text-on-surface-variant hover:bg-surface-container">
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>
        <div className="border-b border-outline-variant bg-surface-container-low p-4">
          <label className="text-[11px] font-bold uppercase tracking-widest text-outline">
            从 Insight 主后端拉取
          </label>
          <div className="mt-2 flex gap-2">
            <input
              value={backendReference}
              onChange={(event) => onReferenceChange(event.target.value)}
              placeholder="输入 report id、outputs/*.insight.json 路径或完整 URL"
              className="min-w-0 flex-1 rounded-md border border-outline-variant bg-surface px-3 py-2 text-[13px] outline-none focus:border-primary"
            />
            <button
              type="button"
              onClick={onFetchBackendPayload}
              disabled={isFetchingBackendPayload}
              className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-2 text-[13px] font-semibold text-white hover:bg-secondary disabled:cursor-not-allowed disabled:opacity-55"
            >
              <span className="material-symbols-outlined text-[17px]">download</span>
              {isFetchingBackendPayload ? "拉取中" : "拉取"}
            </button>
          </div>
          <p className="mt-2 text-[11px] text-on-surface-variant">
            默认主后端地址由 VITE_INSIGHT_API_BASE_URL 配置，当前为 {INSIGHT_API_BASE_URL}。
          </p>
        </div>
        <textarea
          value={jsonText}
          onChange={(event) => onChange(event.target.value)}
          spellCheck={false}
          className="min-h-0 flex-1 resize-none border-0 bg-surface-container-low p-4 font-mono text-[12px] leading-5 outline-none"
        />
        <div className="flex justify-end gap-2 border-t border-outline-variant p-4">
          <button type="button" onClick={onClose} className="rounded-md border border-outline-variant px-4 py-2 text-[13px] font-semibold hover:bg-surface-container">
            取消
          </button>
          <button type="button" onClick={onApply} className="rounded-md bg-primary px-4 py-2 text-[13px] font-semibold text-white hover:bg-secondary">
            解析并载入
          </button>
        </div>
      </section>
    </div>
  );
}

function buildLayers(nodes: IndustryNode[], skeleton: ChainSegment[]) {
  const layers = skeleton.map((segment) => {
    const meta = layerMeta(segment);
    return {
      key: meta.key,
      label: meta.label,
      en: meta.en,
      icon: meta.icon,
      industries: nodes.filter((node) => node.layer === meta.key),
    };
  });
  return layers.filter((layer) => layer.industries.length > 0 || nodes.length === 0);
}

function layerMeta(segment: ChainSegment) {
  const key = segment.segment_key || segment.segment;
  const fallback = LAYER_META[key] || { label: segment.segment, en: key.toUpperCase(), icon: "hub" };
  return { key, ...fallback };
}

function findCompany(cards: CompanyCard[], name: string | null) {
  return cards.find((card) => card.company_name === name || card.aliases?.includes(String(name))) || null;
}

function companyMatches(company: CompanyCard, term: string) {
  const haystack = [
    company.company_name,
    ...(company.aliases || []),
    company.segment,
    company.subsegment,
    company.business_summary,
    company.company_positioning,
    ...(company.business_lines || []),
    ...(company.product_lines || []),
    ...(company.core_technologies || []),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return haystack.includes(term);
}

function industryNodeMatches(node: IndustryNode, term: string) {
  const haystack = [node.name, node.sub, node.layerLabel, ...node.companies.map((company) => company.company_name)]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return haystack.includes(term) || node.companies.some((company) => companyMatches(company, term));
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
      <span className={`h-3 w-3 rounded-sm ${outline ? "border border-outline" : color}`} />
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

function ReportSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-2xl border border-outline-variant bg-surface p-5">
      <h3 className="text-[16px] font-bold">{title}</h3>
      <div className="mt-3">{children}</div>
    </section>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="rounded-xl border border-dashed border-outline-variant bg-surface-container-low p-4 text-center text-[12px] text-on-surface-variant">
      {text}
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
              className={`w-full rounded-xl border bg-white p-4 text-left transition-all ${
                active
                  ? "border-2 border-secondary shadow-lg ring-4 ring-secondary-fixed/30"
                  : "border-outline-variant shadow-sm hover:border-primary/40 hover:shadow-md"
              }`}
            >
              <div className="mb-2 flex items-center gap-3">
                <span className={`material-symbols-outlined rounded p-1.5 ${active ? "bg-primary text-white" : "bg-primary-container text-primary"}`}>
                  hub
                </span>
                <div className="min-w-0 flex-1">
                  <h3 className="truncate text-title-sm font-bold text-on-surface">{node.name}</h3>
                  <p className="truncate text-[11px] text-on-surface-variant">{node.sub}</p>
                </div>
                <span className="shrink-0 rounded bg-surface-container-high px-1.5 py-0.5 text-[10px] text-on-surface-variant">
                  {node.companies.length} 龙头
                </span>
              </div>
            </button>
            {active && (
              <div className="mt-3 grid grid-cols-1 gap-2 animate-in fade-in slide-in-from-top-2 duration-200">
                <p className="px-1 text-[10px] font-bold uppercase tracking-widest text-outline">行业龙头企业</p>
                {node.companies.length ? (
                  node.companies.map((company) => {
                    const isSelected = selectedCompany === company.company_name;
                    return (
                      <button
                        key={company.company_name}
                        onClick={() => onSelectCompany(company.company_name)}
                        className={`rounded-lg border p-3 text-left transition-colors ${
                          isSelected
                            ? "border-primary bg-primary/5"
                            : "border-outline-variant/60 bg-surface-container-low hover:border-primary"
                        }`}
                      >
                        <div className="mb-1 flex items-center justify-between">
                          <p className="text-body-sm font-bold text-on-surface">{company.company_name}</p>
                          {isSelected && <span className="rounded-full bg-primary px-2 py-0.5 text-[10px] text-white">当前聚焦</span>}
                        </div>
                        <p className="line-clamp-2 text-[11px] leading-relaxed text-on-surface-variant">
                          {company.business_summary || company.company_positioning || "sample 中暂无简介。"}
                        </p>
                      </button>
                    );
                  })
                ) : (
                  <div className="rounded-lg border border-outline-variant/60 bg-surface-container-low p-3 text-[12px] text-on-surface-variant">
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
    <div className="sticky top-6 flex flex-col gap-4 rounded-2xl border border-outline-variant bg-surface p-5">
      <div className="flex items-start justify-between border-b border-outline-variant pb-3">
        <div>
          <p className="mb-1 text-[11px] text-on-surface-variant">{industry?.name || company.subsegment}</p>
          <h2 className="text-headline-md font-bold text-on-surface">{company.company_name}</h2>
          <p className="mt-1 text-[12px] text-on-surface-variant">{company.company_positioning}</p>
        </div>
        <span className="whitespace-nowrap rounded-full bg-primary px-2 py-1 text-[10px] text-white">核心主体</span>
      </div>
      <div>
        <p className="mb-2 text-[10px] font-bold uppercase tracking-widest text-outline">企业简介</p>
        <p className="text-[12px] leading-relaxed text-on-surface-variant">{company.business_summary || "sample 中暂无企业简介。"}</p>
      </div>
      <div className="rounded-xl border border-primary/20 bg-primary/5 p-4">
        <div className="mb-1 flex justify-between text-[11px]">
          <span className="text-on-surface-variant">关键指标 · 证据完整度</span>
          <span className="font-bold text-primary">{Math.min(96, 64 + (company.evidence_excerpts?.length || 0) * 8)}%</span>
        </div>
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-outline-variant">
          <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${Math.min(96, 64 + (company.evidence_excerpts?.length || 0) * 8)}%` }} />
        </div>
      </div>
      <div>
        <p className="mb-2 text-[10px] font-bold uppercase tracking-widest text-outline">核心关联图谱</p>
        <RelationGraph center={company.company_name} graph={graph} onSelectCompany={onSelectCompany} onSelectRelation={onSelectRelation} />
      </div>
      {selectedRelation && (
        <div className="rounded-xl border border-outline-variant bg-surface-container-low p-3">
          <p className="mb-2 text-[10px] font-bold uppercase tracking-widest text-outline">关系证据</p>
          <p className="text-[13px] font-bold">{relationLabel(selectedRelation)}</p>
          <p className="mt-1 text-[12px] leading-relaxed text-on-surface-variant">{selectedRelation.evidence_text || "暂无证据文本。"}</p>
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
  const relations = (graph?.company_edges || []).filter((relation) => relation.head === centerId || relation.tail === centerId);
  const visible = (relations.length ? relations : graph?.company_edges || []).slice(0, 3);
  const positions = [
    { x: 80, y: 40 },
    { x: 320, y: 40 },
    { x: 200, y: 170 },
  ];

  return (
    <div className="relative h-[200px] overflow-hidden rounded-xl border border-outline-variant bg-surface-container-low">
      <svg viewBox="0 0 400 200" className="h-full w-full p-4">
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
              <text x={(200 + position.x) / 2} y={(100 + position.y) / 2 + 3} textAnchor="middle" fill="#434653" fontSize="8" className="pointer-events-none">
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
      {visible.length === 0 && <div className="absolute inset-0 flex items-center justify-center text-[12px] text-on-surface-variant">暂无公司关系。</div>}
      <div className="absolute left-3 top-2">
        <span className="text-[10px] font-bold uppercase tracking-wider text-on-surface-variant">核心关联图谱</span>
      </div>
    </div>
  );
}

function TagList({ title, tags }: { title: string; tags: string[] }) {
  return (
    <div>
      <p className="mb-2 text-[10px] font-bold uppercase tracking-widest text-outline">{title}</p>
      <div className="flex flex-wrap gap-2">
        {tags.length ? (
          tags.map((tag) => (
            <span key={tag} className="rounded-full bg-surface-container px-2 py-1 text-[11px] text-on-surface-variant">
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
