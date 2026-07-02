# Insight-front-kg

独立运行的知识图谱和图谱前端工作台。

目标链路：

```text
后端 Agent 组输出 insight_payload
-> KG 服务生成 graph_payload
-> schema 校验
-> 强制写入 Neo4j 主存储
-> 从 Neo4j 查询并转换为前端图谱展示 payload
```

`graph_payload` 仍保留，但定位是中间交换、调试、审计和重试格式；最终图谱主存储是 Neo4j。

## 目录结构

```text
frontend/     Next.js 图谱工作台
kg-service/   FastAPI 图谱服务
samples/      mock insight_payload 样例
docs/         接口协议和联调说明
```

## 第一周需求

第一周执行清单见：

```text
docs/第一周需求列表.md
```

前端和知识图谱小组分工清单见：

```text
docs/前端知识图谱组需求分工清单.md
```

## 启动 Neo4j

```powershell
cd D:\AAA_Favio_2026\AI_exploring\DigitalChina\Insight-front-kg
docker compose -f docker-compose.neo4j.yml up -d
```

Neo4j Browser:

```text
http://localhost:7474
```

默认账号：

```text
neo4j / your_password
```

## 启动 KG 服务

环境变量：

```powershell
$env:NEO4J_URI="bolt://localhost:7687"
$env:NEO4J_USER="neo4j"
$env:NEO4J_PASSWORD="your_password"
$env:KG_GRAPH_VERSION="v1"
```

只有本地 debug 时才允许跳过 Neo4j：

```powershell
$env:KG_ALLOW_GRAPH_PAYLOAD_FALLBACK="true"
```

启动服务：

```powershell
cd D:\AAA_Favio_2026\AI_exploring\DigitalChina\Insight-front-kg\kg-service
pip install -r requirements.txt
python -m uvicorn app:app --host 0.0.0.0 --port 8008 --reload
```

健康检查：

```text
http://localhost:8008/health
```

## 启动前端

```powershell
cd D:\AAA_Favio_2026\AI_exploring\DigitalChina\Insight-front-kg\frontend
npm install
npm run dev
```

访问：

```text
http://localhost:3001
```

## 主接口

推荐主入口：

```text
POST http://localhost:8008/api/graph/ingest
```

成功时返回：

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

失败时不静默跳过：

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

## Neo4j 验证

在 Neo4j Browser 中执行：

```cypher
MATCH (n) RETURN labels(n) AS labels, count(*) AS count ORDER BY count DESC;
```

查看关系：

```cypher
MATCH (a)-[r]->(b)
WHERE r.rel_id IS NOT NULL
RETURN a.name AS head, type(r) AS relation, b.name AS tail, r.confidence AS confidence
LIMIT 25;
```

按 trace 查询：

```cypher
MATCH (a)-[r]->(b)
WHERE "kg_20260702_xxxx" IN coalesce(r.trace_ids, [])
RETURN a.name, type(r), b.name, r.source, r.evidence
LIMIT 25;
```

## 第一周验收

- mock `insight_payload` 能生成 `graph_payload`。
- `graph_payload` 生成后必须通过 schema 校验。
- Neo4j 正常配置时，`persistence_meta.status = persisted`。
- 前端默认点击“生成并写入 Neo4j”，并优先展示 Neo4j 查询结果。
- 点击公司节点能展开画像关系。
- 点击关系边能看到证据和来源。
- Neo4j 失败时，前端能显示 `failed`、失败原因和 `trace_id`。

## 当前已验证

在 `industry_insight` conda 环境中已验证：

```text
kg-service: python -m pytest -q
结果：40 passed

mock 样例生成结果：
graph_nodes=43
company_edges=2
profile_edges=18
evidence_chunks=27

frontend: npm run build
结果：Next.js production build passed
```
