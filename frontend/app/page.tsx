'use client';

import { useMemo, useState } from 'react';
import IndustryGraphView from '@/components/IndustryGraphView';
import { buildGraphPayload, ingestGraphPayload } from '@/lib/api';
import type { IndustryGraphPayload, IndustryInsightPayload } from '@/types/data';

const SAMPLE_PATH = '/samples/new-energy-insight-payload.json';

type Mode = 'debug-build' | 'ingest';

const emptyText = `{
  "task_profile": {
    "industry": "新能源汽车",
    "profile_id": "new_energy"
  },
  "chain_skeleton": [],
  "segment_companies": [],
  "company_cards": [],
  "source_index": []
}`;

const countByStatus = (graphPayload: IndustryGraphPayload | null) => {
  const counts: Record<string, number> = {};
  for (const relation of graphPayload?.relation_candidates || []) {
    counts[relation.status] = (counts[relation.status] || 0) + 1;
  }
  return counts;
};

export default function Home() {
  const [jsonText, setJsonText] = useState(emptyText);
  const [insightPayload, setInsightPayload] = useState<IndustryInsightPayload | null>(null);
  const [graphPayload, setGraphPayload] = useState<IndustryGraphPayload | null>(null);
  const [message, setMessage] = useState('加载 mock 数据后，可生成并写入 Neo4j 主存储。');
  const [loading, setLoading] = useState(false);

  const statusCounts = useMemo(() => countByStatus(graphPayload), [graphPayload]);
  const chainSkeleton = insightPayload?.chain_skeleton || [];
  const companyCards = insightPayload?.company_cards || [];

  const loadSample = async () => {
    setLoading(true);
    try {
      const response = await fetch(SAMPLE_PATH);
      if (!response.ok) {
        throw new Error(`加载样例失败：${response.status}`);
      }
      const payload = (await response.json()) as IndustryInsightPayload;
      setInsightPayload(payload);
      setJsonText(JSON.stringify(payload, null, 2));
      setGraphPayload(payload.graph_payload || null);
      setMessage('已加载新能源汽车 mock insight_payload。');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '加载样例失败。');
    } finally {
      setLoading(false);
    }
  };

  const parseJson = () => {
    try {
      const payload = JSON.parse(jsonText) as IndustryInsightPayload;
      setInsightPayload(payload);
      setGraphPayload(payload.graph_payload || null);
      setMessage(payload.graph_payload ? '已解析 JSON，并检测到内置 graph_payload。' : '已解析 JSON，可调用 KG 服务生成图谱。');
      return payload;
    } catch (error) {
      setMessage(error instanceof Error ? `JSON 解析失败：${error.message}` : 'JSON 解析失败。');
      return null;
    }
  };

  const generateGraph = async (mode: Mode) => {
    const payload = parseJson();
    if (!payload) {
      return;
    }

    setLoading(true);
    try {
      if (mode === 'ingest') {
        const result = await ingestGraphPayload(payload);
        const displayPayload =
          result.visualization_payload?.graph_nodes?.length ? result.visualization_payload : result.graph_payload;
        displayPayload.persistence_meta = result.persistence_meta;
        setGraphPayload(displayPayload);
        setInsightPayload({ ...payload, graph_payload: result.graph_payload });
        const status = String(result.persistence_meta?.status || 'unknown');
        const traceId = String(result.persistence_meta?.trace_id || '');
        const reason = String(result.persistence_meta?.reason || '');
        setMessage(
          status === 'persisted'
            ? `已写入 Neo4j，并从主存储返回图谱。trace_id=${traceId}`
            : `Neo4j 入库未成功：${status}${reason ? ` / ${reason}` : ''}${traceId ? ` / trace_id=${traceId}` : ''}`,
        );
        return;
      }

      const result = await buildGraphPayload(payload);
      setGraphPayload(result);
      setInsightPayload({ ...payload, graph_payload: result });
      setMessage('debug 预览：仅生成 graph_payload，未写入 Neo4j。');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '调用 KG 服务失败。');
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen bg-zinc-950 text-slate-50">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-6 lg:px-8">
        <header className="flex flex-col gap-3 border-b border-white/10 pb-5 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-sm text-cyan-200">Insight-front-kg</p>
            <h1 className="mt-1 text-2xl font-semibold">产业知识图谱工作台</h1>
            <p className="mt-2 max-w-3xl text-sm text-slate-400">
              用 mock 或后端 Agent 组输出的 insight_payload 生成 graph_payload，校验后写入 Neo4j，并优先从主存储返回图谱展示。
            </p>
          </div>
          <div className="grid grid-cols-2 gap-2 text-xs text-slate-300 md:grid-cols-4">
            <span className="rounded border border-white/10 px-3 py-2">节点 {graphPayload?.graph_nodes?.length || 0}</span>
            <span className="rounded border border-white/10 px-3 py-2">公司边 {graphPayload?.company_edges?.length || 0}</span>
            <span className="rounded border border-white/10 px-3 py-2">画像边 {graphPayload?.profile_edges?.length || 0}</span>
            <span className="rounded border border-white/10 px-3 py-2">
              入库 {String(graphPayload?.persistence_meta?.status || '未执行')}
            </span>
          </div>
        </header>

        <section className="grid gap-5 lg:grid-cols-[420px_minmax(0,1fr)]">
          <aside className="space-y-4">
            <div className="rounded-lg border border-white/10 bg-white/[0.04] p-4">
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={loadSample}
                  disabled={loading}
                  className="rounded bg-cyan-600 px-3 py-2 text-sm font-medium text-white hover:bg-cyan-500 disabled:opacity-60"
                >
                  加载 mock
                </button>
                <button
                  type="button"
                  onClick={parseJson}
                  disabled={loading}
                  className="rounded border border-white/15 px-3 py-2 text-sm text-white hover:bg-white/10 disabled:opacity-60"
                >
                  解析 JSON
                </button>
                <button
                  type="button"
                  onClick={() => generateGraph('debug-build')}
                  disabled={loading}
                  className="rounded bg-amber-500 px-3 py-2 text-sm font-medium text-zinc-950 hover:bg-amber-400 disabled:opacity-60"
                >
                  debug 生成
                </button>
                <button
                  type="button"
                  onClick={() => generateGraph('ingest')}
                  disabled={loading}
                  className="rounded bg-emerald-500 px-3 py-2 text-sm font-medium text-zinc-950 hover:bg-emerald-400 disabled:opacity-60"
                >
                  生成并写入 Neo4j
                </button>
              </div>
              <div className="mt-3 rounded border border-white/10 bg-black/25 px-3 py-2 text-sm text-slate-300">
                {loading ? '处理中...' : message}
              </div>
            </div>

            <div className="rounded-lg border border-white/10 bg-white/[0.04] p-4">
              <div className="mb-2 flex items-center justify-between">
                <h2 className="text-sm font-semibold">insight_payload</h2>
                <span className="text-xs text-slate-500">粘贴后端 JSON</span>
              </div>
              <textarea
                value={jsonText}
                onChange={(event) => setJsonText(event.target.value)}
                className="h-[460px] w-full resize-y rounded border border-white/10 bg-zinc-950 p-3 font-mono text-xs leading-5 text-slate-200 outline-none focus:border-cyan-500"
                spellCheck={false}
              />
            </div>
          </aside>

          <section className="space-y-5">
            <div className="grid gap-3 md:grid-cols-3">
              {chainSkeleton.map((segment, index) => (
                <div key={`${segment.segment}-${index}`} className="rounded-lg border border-white/10 bg-white/[0.04] p-4">
                  <div className="text-sm font-semibold">{segment.segment || `环节 ${index + 1}`}</div>
                  <div className="mt-2 text-sm text-slate-400">
                    {(segment.subsegments || []).join('、') || '待补充'}
                  </div>
                </div>
              ))}
              {chainSkeleton.length === 0 && (
                <div className="rounded-lg border border-white/10 bg-white/[0.04] p-4 text-sm text-slate-400 md:col-span-3">
                  解析或加载 insight_payload 后展示产业链摘要。
                </div>
              )}
            </div>

            <div className="grid gap-3 md:grid-cols-4">
              <Metric label="候选关系" value={graphPayload?.relation_candidates?.length || 0} />
              <Metric label="正式关系" value={graphPayload?.graph_edges?.length || 0} />
              <Metric label="证据片段" value={graphPayload?.evidence_chunks?.length || 0} />
              <Metric label="企业卡" value={companyCards.length} />
            </div>

            <div className="rounded-lg border border-white/10 bg-white/[0.04] p-4">
              <h2 className="text-sm font-semibold">关系状态</h2>
              <div className="mt-3 flex flex-wrap gap-2 text-xs text-slate-300">
                {Object.keys(statusCounts).length === 0 && <span>暂无关系状态。</span>}
                {Object.entries(statusCounts).map(([status, count]) => (
                  <span key={status} className="rounded-full border border-white/10 px-3 py-1">
                    {status} {count}
                  </span>
                ))}
              </div>
            </div>

            <IndustryGraphView graphPayload={graphPayload || undefined} />
          </section>
        </section>
      </div>
    </main>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-white/10 bg-white/[0.04] p-4">
      <div className="text-xs text-slate-500">{label}</div>
      <div className="mt-1 text-xl font-semibold">{value}</div>
    </div>
  );
}
