# 后端 Agent 组对接协议

## 对接方式

第一版使用 REST JSON。

```text
后端 Agent 组
-> insight_payload
-> Insight-front-kg KG 服务生成 graph_payload
-> schema 校验
-> 写入 Neo4j 主存储
-> 从 Neo4j 查询 visualization_payload 给前端展示
```

KG 服务默认地址：

```text
http://localhost:8008
```

Insight 主后端默认地址：

```text
http://localhost:8000
```

主后端当前可提供的结果来源：

```text
POST /report/
GET  /api/reports/{research_id}
GET  /outputs/<task>.insight.json
WS   /ws -> type=path -> output.insight_payload
```

前端默认通过 `VITE_INSIGHT_API_BASE_URL` 配置主后端地址，通过 `VITE_KG_API_BASE_URL` 配置 KG 服务地址。

## 接口

### GET /health

返回服务状态。

### POST /api/graph/ingest

推荐主入口。

输入：

```json
{
  "insight_payload": {}
}
```

兼容输入：

```json
{
  "research_id": "task_demo",
  "report": "demo report",
  "insight_payload": {},
  "insight_json_path": "outputs/task_demo.insight.json"
}
```

```json
{
  "type": "path",
  "output": {
    "insight_payload": {},
    "insight_json": "outputs/task_demo.insight.json"
  }
}
```

```json
{
  "report": {
    "id": "task_demo",
    "orderedData": [
      {
        "type": "path",
        "output": {
          "insight_payload": {}
        }
      }
    ]
  }
}
```

输出：

```json
{
  "graph_payload": {},
  "visualization_payload": {},
  "persistence_meta": {
    "status": "persisted",
    "node_count": 43,
    "relation_count": 20,
    "trace_id": "kg_20260702_xxxx",
    "created_at": "2026-07-02T20:30:00+08:00"
  }
}
```

失败时：

```json
{
  "graph_payload": {},
  "visualization_payload": {},
  "persistence_meta": {
    "status": "failed",
    "reason": "missing_neo4j_uri",
    "error_type": "ConfigurationError",
    "trace_id": "kg_20260702_xxxx",
    "created_at": "2026-07-02T20:30:00+08:00"
  }
}
```

### GET /api/graph/visualization

从 Neo4j 查询前端图谱展示数据。

查询参数：

```text
trace_id=kg_20260702_xxxx
project_id=new_energy
```

至少提供一个查询参数。

### POST /api/graph/build

兼容/debug 接口。

输入 `insight_payload`，生成 `graph_payload` 并附带 `validation_meta`，不写 Neo4j。第一周可用于排查抽取规则，但不是最终产品主链路。

### POST /api/graph/persist

兼容接口。

输入 `graph_payload`，执行 schema 校验并写入 Neo4j。默认 Neo4j 必须可用。

### POST /api/graph/build-and-persist

兼容接口。

输入 `insight_payload`，生成 `graph_payload` 并写入 Neo4j。新代码建议前端使用 `/api/graph/ingest`。

## persistence_meta 语义

- `persisted`：schema 校验通过，Neo4j 事务写入成功。
- `failed`：schema 校验失败、Neo4j 未配置、连接失败或事务失败。
- `skipped`：只允许在显式配置 `KG_ALLOW_GRAPH_PAYLOAD_FALLBACK=true` 后出现，用于本地 debug。

`failed` 必须包含：

```text
reason
error_type
trace_id
created_at
```

## insight_payload 必需字段

后端 Agent 组至少需要提供：

```text
task_profile.industry

chain_skeleton[].segment
chain_skeleton[].subsegments
chain_skeleton[].evidence_sources

segment_companies[].segment
segment_companies[].companies[].company_name
segment_companies[].companies[].reason
segment_companies[].companies[].evidence_sources

company_cards[].company_name
company_cards[].segment
company_cards[].subsegment
company_cards[].business_lines
company_cards[].product_lines
company_cards[].core_technologies
company_cards[].field_evidence
company_cards[].relationship_clues
company_cards[].key_sources
company_cards[].evidence_excerpts

source_index[].title
source_index[].url
source_index[].snippet
source_index[].source_grade
```

## 公司关系线索格式

`relationship_clues` 建议使用结构化格式：

```text
目标企业=比亚迪；关系层级=industry_template；关系名称=动力电池供应；方向=本企业->目标企业；证据=宁德时代为比亚迪提供动力电池相关产品。；来源=https://example.com/catl-byd；来源等级=A；解释=宁德时代向比亚迪提供动力电池相关产品
```

如果只给自然语言，公司间关系边可能为空，前端会显示“暂无可视化公司关系”。

## 字段级证据

`field_evidence` 用来支撑画像关系边，建议格式：

```json
{
  "business_lines": [
    {
      "value": "动力电池业务",
      "evidence_text": "宁德时代主营动力电池业务。",
      "source_url": "https://example.com/catl-report",
      "source_title": "宁德时代年度报告",
      "source_grade": "A"
    }
  ]
}
```

## 前端展示条件

- 默认调用 `/api/graph/ingest`。
- 导入 JSON 支持裸 `insight_payload`、主后端 `/report/` 完整响应、WebSocket `path` 消息和 `/api/reports/{research_id}` 返回内容。
- 导入弹窗支持按 report id、`outputs/*.insight.json` 路径或完整 URL 从主后端拉取结果。
- 图谱展示优先使用 `visualization_payload`，该数据来自 Neo4j 查询。
- `company_edges` 非空：显示公司关系图。
- `company_edges` 为空：显示空状态和 `persistence_meta`。
- `profile_edges` 非空：点击公司节点后展示业务线、产品线、核心技术关系。
- `persistence_meta.status` 展示 Neo4j 主存储状态。

## 联调注意事项

主后端 CORS 默认只允许 3000。前端工作台运行在 3001 时，需要启动主后端前配置：

```powershell
$env:CORS_ALLOW_ORIGINS="http://localhost:3001,http://127.0.0.1:3001,http://localhost:3000,http://127.0.0.1:3000"
```

推荐联调顺序：

```text
1. 启动 Neo4j。
2. 启动 KG 服务 8008。
3. 启动 Insight 主后端 8000。
4. 启动 Insight-front-kg 前端 3001。
5. 主后端生成报告，复制 report id 或 insight_json 路径。
6. 前端导入弹窗拉取主后端结果。
7. 点击写入 Neo4j。
8. 在关联分析页查看图谱和证据。
```
