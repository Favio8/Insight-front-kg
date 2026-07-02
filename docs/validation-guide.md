# 第一周验证说明

## 验证目标

第一周验证以下链路：

```text
mock insight_payload
-> graph_payload
-> schema 校验
-> Neo4j 主存储事务写入
-> 从 Neo4j 查询 visualization_payload
-> 前端 IndustryGraphView 展示
```

## 后端测试

```powershell
cd D:\AAA_Favio_2026\AI_exploring\DigitalChina\Insight-front-kg\kg-service
python -m pytest -q
```

通过标准：

- 图谱模块测试通过。
- API 测试通过。
- mock 数据能生成 `company_edges`、`profile_edges`、`evidence_chunks`。
- 缺少 Neo4j 配置时默认返回 `failed`，不返回 `skipped`。
- 显式设置 `KG_ALLOW_GRAPH_PAYLOAD_FALLBACK=true` 时才允许 `skipped`。

## Neo4j 启动

```powershell
cd D:\AAA_Favio_2026\AI_exploring\DigitalChina\Insight-front-kg
docker compose -f docker-compose.neo4j.yml up -d
```

环境变量：

```powershell
$env:NEO4J_URI="bolt://localhost:7687"
$env:NEO4J_USER="neo4j"
$env:NEO4J_PASSWORD="your_password"
$env:KG_GRAPH_VERSION="v1"
```

本地 debug 临时预览才使用：

```powershell
$env:KG_ALLOW_GRAPH_PAYLOAD_FALLBACK="true"
```

## KG 服务验证

```powershell
cd D:\AAA_Favio_2026\AI_exploring\DigitalChina\Insight-front-kg\kg-service
python -m uvicorn app:app --host 0.0.0.0 --port 8008 --reload
```

检查：

```text
GET  http://localhost:8008/health
POST http://localhost:8008/api/graph/ingest
GET  http://localhost:8008/api/graph/visualization?trace_id=<trace_id>
```

`/api/graph/ingest` 成功标准：

```text
persistence_meta.status = persisted
persistence_meta.node_count > 0
persistence_meta.relation_count > 0
persistence_meta.trace_id 非空
persistence_meta.created_at 非空
visualization_payload.graph_nodes 非空
```

## 前端构建

```powershell
cd D:\AAA_Favio_2026\AI_exploring\DigitalChina\Insight-front-kg\frontend
npm run build
```

通过标准：

- 构建无 TypeScript 错误。
- 页面可访问 `http://localhost:3001`。
- 点击“加载 mock”后能解析样例。
- 点击“生成并写入 Neo4j”后能看到图谱。
- Neo4j 失败时页面显示 `failed`、原因和 `trace_id`。

## Neo4j Browser 验证

节点统计：

```cypher
MATCH (n)
RETURN labels(n) AS labels, count(*) AS count
ORDER BY count DESC;
```

关系统计：

```cypher
MATCH ()-[r]->()
RETURN type(r) AS relation_type, count(*) AS count
ORDER BY count DESC;
```

按 trace 查看本次入库：

```cypher
MATCH (a)-[r]->(b)
WHERE "<trace_id>" IN coalesce(r.trace_ids, [])
RETURN a.name AS head, type(r) AS relation, b.name AS tail, r.confidence AS confidence, r.source AS source
LIMIT 25;
```

查看证据：

```cypher
MATCH (rf:RelationFact)-[:SUPPORTED_BY]->(e:EvidenceChunk)
WHERE "<trace_id>" IN coalesce(rf.trace_ids, [])
RETURN rf.relation AS relation, e.text AS evidence, e.source_url AS source
LIMIT 25;
```

## 验证记录模板

```text
验证日期：
验证人：
样例：新能源汽车

KG 服务：
- /health 是否正常：
- /api/graph/ingest 是否正常：
- persistence_meta.status：
- trace_id：
- graph_nodes 数量：
- company_edges 数量：
- profile_edges 数量：
- evidence_chunks 数量：

前端：
- mock 是否加载：
- 是否从 Neo4j 返回 visualization_payload：
- 图谱是否显示：
- 公司节点是否可点击：
- 画像关系是否展开：
- 边证据是否显示：
- Neo4j 失败时是否显示原因：

Neo4j：
- 是否启动：
- 节点数量：
- 关系数量：
- RelationFact 数量：
- EvidenceChunk 数量：
- 是否能按 trace_id 查询：

问题：
- 后端字段缺口：
- 图谱规则问题：
- Neo4j 配置问题：
- 前端展示问题：
```
