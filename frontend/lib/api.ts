import type { GraphIngestResponse, IndustryGraphPayload, IndustryInsightPayload } from '@/types/data';

const API_BASE = process.env.NEXT_PUBLIC_KG_API_BASE || 'http://localhost:8008';

export async function buildGraphPayload(insightPayload: IndustryInsightPayload): Promise<IndustryGraphPayload> {
  const response = await fetch(`${API_BASE}/api/graph/build`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ insight_payload: insightPayload }),
  });

  if (!response.ok) {
    throw new Error(`KG service build failed: ${response.status}`);
  }

  return response.json();
}

export async function buildAndPersistGraphPayload(
  insightPayload: IndustryInsightPayload,
): Promise<IndustryGraphPayload> {
  const response = await fetch(`${API_BASE}/api/graph/build-and-persist`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ insight_payload: insightPayload }),
  });

  if (!response.ok) {
    throw new Error(`KG service build-and-persist failed: ${response.status}`);
  }

  return response.json();
}

export async function ingestGraphPayload(insightPayload: IndustryInsightPayload): Promise<GraphIngestResponse> {
  const response = await fetch(`${API_BASE}/api/graph/ingest`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ insight_payload: insightPayload }),
  });

  if (!response.ok) {
    throw new Error(`KG service ingest failed: ${response.status}`);
  }

  return response.json();
}
