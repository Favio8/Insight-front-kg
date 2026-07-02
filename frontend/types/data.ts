export interface BaseData {
  type: string;
}

export interface BasicData extends BaseData {
  type: 'basic';
  content: string;
}

export interface DifferencesData extends BaseData {
  type: 'differences';
  content: string;
  output: string;
}

export interface QuestionData extends BaseData {
  type: 'question';
  content: string;
}

export interface ChatData extends BaseData {
  type: 'chat';
  content: string;
  metadata?: any; // For storing search results and other contextual information
}

export type Data = BasicData | DifferencesData | QuestionData | ChatData;

export interface MCPConfig {
  name: string;
  command: string;
  args: string[];
  env: Record<string, string>;
}

export interface ChatBoxSettings {
  report_type: string;
  report_source: string;
  tone: string;
  domains: string[];
  defaultReportType: string;
  layoutType: string;
  mcp_enabled: boolean;
  mcp_configs: MCPConfig[];
  mcp_strategy?: string;
}

export interface Domain {
  value: string;
}

export interface ChatMessage {
  role: "user" | "assistant" | "system";
  content: string;
  timestamp?: number;
  metadata?: any; // For storing search results and other contextual information
}

export interface InsightSource {
  title: string;
  url: string;
  snippet: string;
  source_grade: string;
}

export interface IndustryChainSegment {
  segment_key: string;
  segment: string;
  description: string;
  subsegments: string[];
  confidence?: number;
  evidence_sources?: string[];
}

export interface IndustryChainCandidate {
  segment_key: string;
  segment: string;
  subsegment_name: string;
  aliases: string[];
  description: string;
  confidence: number;
  evidence_sources: string[];
  discovery_rounds: number[];
}

export interface IndustryCompanySummary {
  company_name: string;
  company_positioning?: string;
  business_summary?: string;
  key_sources?: InsightSource[];
}

export interface IndustryFieldEvidence {
  value: string;
  evidence_text: string;
  source_url: string;
  source_title: string;
  source_grade: string;
}

export interface IndustrySegmentLeaders {
  segment_key: string;
  segment: string;
  subsegments: string[];
  companies: IndustryCompanySummary[];
}

export interface IndustryCompanyCard {
  company_name: string;
  aliases: string[];
  segment: string;
  subsegment: string;
  business_summary: string;
  company_positioning: string;
  business_lines: string[];
  product_lines: string[];
  core_technologies: string[];
  relationship_clues: string[];
  key_sources: InsightSource[];
  field_evidence?: Record<string, IndustryFieldEvidence[]>;
  evidence_excerpts: string[];
}

export interface IndustryCoverageMeta {
  coverage_complete: boolean;
  missing_segments: string[];
  repair_attempts: number;
  company_count?: number;
  [key: string]: unknown;
}

export interface IndustryGraphNode {
  node_id: string;
  node_type: string;
  name: string;
  aliases: string[];
  normalized_name: string;
  source_refs: string[];
  raw_mentions: string[];
  normalization_method?: string;
  entity_id?: string;
  entity_type?: string;
  source?: string;
  evidence?: string;
  confidence?: number;
  project_id?: string;
  document_id?: string;
  version?: string;
  created_at?: string;
  updated_at?: string;
}

export interface IndustryEvidenceChunk {
  chunk_id: string;
  text: string;
  source_url: string;
  source_title: string;
  source_grade: string;
  entity_id?: string;
  entity_type?: string;
  source?: string;
  evidence?: string;
  confidence?: number;
  project_id?: string;
  document_id?: string;
  version?: string;
  created_at?: string;
  updated_at?: string;
}

export interface IndustryRelationCandidate {
  rel_id: string;
  head: string;
  head_type: string;
  relation: string;
  tail: string;
  tail_type: string;
  evidence_refs: string[];
  evidence_text: string;
  source_url: string;
  source_title: string;
  source_grade: string;
  relation_origin: string;
  relation_level?: string;
  relation_name?: string;
  field_name?: string;
  field_value?: string;
  direction?: string;
  explanation?: string;
  edge_kind?: string;
  confidence: number;
  status: string;
  direction_uncertain: boolean;
  score_breakdown: Record<string, unknown>;
  entity_id?: string;
  entity_type?: string;
  relation_type?: string;
  source?: string;
  evidence?: string;
  project_id?: string;
  document_id?: string;
  version?: string;
  created_at?: string;
  updated_at?: string;
}

export interface IndustryGraphPayload {
  task_profile: Record<string, unknown>;
  graph_nodes: IndustryGraphNode[];
  relation_candidates: IndustryRelationCandidate[];
  graph_edges: IndustryRelationCandidate[];
  company_edges?: IndustryRelationCandidate[];
  profile_edges?: IndustryRelationCandidate[];
  structural_edges?: IndustryRelationCandidate[];
  inter_company_relations?: IndustryRelationCandidate[];
  evidence_chunks: IndustryEvidenceChunk[];
  normalization_index: Record<string, unknown>[];
  confidence_meta: Record<string, unknown>;
  qa_index_hints: Record<string, unknown>;
  persistence_meta?: Record<string, unknown>;
  visualization_meta?: Record<string, unknown>;
}

export interface GraphIngestResponse {
  graph_payload: IndustryGraphPayload;
  visualization_payload?: IndustryGraphPayload;
  persistence_meta: Record<string, unknown>;
}

export interface IndustryInsightPayload {
  task_profile: Record<string, unknown>;
  chain_skeleton: IndustryChainSegment[];
  chain_candidates?: IndustryChainCandidate[];
  segment_companies: IndustrySegmentLeaders[];
  company_cards: IndustryCompanyCard[];
  next_stage_budget?: Record<string, unknown>;
  source_index: InsightSource[];
  coverage_meta?: IndustryCoverageMeta;
  run_meta?: Record<string, unknown>;
  inter_company_relations?: IndustryRelationCandidate[];
  graph_payload?: IndustryGraphPayload;
}

export interface ResearchHistoryItem {
  id: string;
  question: string;
  answer: string;
  timestamp: number;
  orderedData: Data[];
  chatMessages?: ChatMessage[];
} 
