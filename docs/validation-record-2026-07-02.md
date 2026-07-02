# 第一周验证记录

验证日期：2026-07-02

验证人：待补充

样例：新能源汽车

## 验证目标

验证以下第一周核心链路：

```text
mock insight_payload
-> KG 服务生成 graph_payload
-> 前端 IndustryGraphView 展示知识图谱
-> Neo4j 可选入库状态记录
```

## KG 服务

- `/health` 是否正常：是
- `/health` 返回：

```json
{"status":"ok","service":"insight-front-kg"}
```

- `/api/graph/build` 是否正常：是
- mock `insight_payload` 是否可生成 `graph_payload`：是
- graph_nodes 数量：43
- company_edges 数量：2
- profile_edges 数量：18
- evidence_chunks 数量：27

后端测试命令：

```powershell
cd E:\ai_insight\Insight-front-kg\kg-service
.\.venv\Scripts\python.exe -m pytest -q
```

测试结果：

```text
34 passed, 1 warning
```

说明：

- warning 来自 FastAPI/Starlette TestClient 依赖提示，不影响第一周功能验收。
- mock 数据可以生成非空 `company_edges`、`profile_edges`、`evidence_chunks`。

## 前端

- 前端构建是否通过：是
- 页面是否可访问：是
- 页面地址：`http://127.0.0.1:3001`
- 首页是否为图谱工作台：是
- 是否支持加载 mock：是，待人工点击确认
- 是否支持粘贴后端 JSON：是，待人工点击确认
- 是否支持调用 KG 服务生成图谱：是，待人工点击确认
- 是否支持生成并尝试入库：是，待人工点击确认
- 图谱统计是否展示：是
- 产业链摘要是否展示：是
- 公司关系图是否展示：是，待人工点击确认
- 公司节点是否可点击：是，待人工点击确认
- 画像关系是否展开：是，待人工点击确认
- 边证据是否显示：是，待人工点击确认
- 无 `company_edges` 时是否有空状态：代码已支持，待人工场景确认

前端构建命令：

```powershell
cd E:\ai_insight\Insight-front-kg\frontend
npm run build
```

构建结果：

```text
Compiled successfully
Linting and checking validity of types passed
Static pages generated successfully
```

页面访问结果：

```text
http://127.0.0.1:3001 返回 200
```

## Neo4j

- Neo4j 是否启动：未验证
- `persistence_meta.status`：未验证 persisted；未配置 Neo4j 时 skipped 逻辑已有自动测试覆盖
- 失败原因：未配置 Neo4j 时预期原因是 `missing_neo4j_uri`

说明：

- Neo4j 是第一周 P1 增强项，不是前端图谱展示硬依赖。
- 当前第一周最低要求可先记录 skipped 状态。
- 如需验证 persisted，需要启动 Neo4j 并配置：

```text
NEO4J_URI=bolt://localhost:7687
NEO4J_USER=neo4j
NEO4J_PASSWORD=your_password
GRAPH_AUTO_PERSIST=true
```

## 问题记录

### 后端字段缺口

- 当前 mock 数据字段满足第一周要求。
- 后续真实后端 Agent 输出仍需按 `docs/api-contract.md` 对齐。
- 特别需要保证：
  - `company_cards[].relationship_clues` 使用结构化格式。
  - `company_cards[].field_evidence` 可支撑画像关系证据展示。
  - `source_index[].source_grade` 可支撑证据来源质量展示。

### 图谱规则问题

- 当前新能源汽车 mock 可生成公司边和画像边。
- 当前基线结果符合文档记录：

```text
graph_nodes=43
company_edges=2
profile_edges=18
evidence_chunks=27
```

### 前端展示问题

- 已知问题：点击“生成并入库”后，公司节点视觉位置可能发生变化。
- 影响范围：仅影响前端交互体验，不影响 `graph_payload`、关系边、证据片段或 Neo4j 入库结果。
- 建议优先级：P1，后续优化 Cytoscape 状态保持。

## 第一周完成判断

当前状态：

- R1 mock 数据闭环：已完成
- R2 KG 服务接口：已完成
- R3 前端图谱结果区：已完成，仍需人工补充点击验收记录
- R4 后端 Agent 组对接字段：已完成
- R5 Neo4j 可选入库：skipped 路径已有测试覆盖，persisted 未验证
- R6 第一周演示路径：基本可跑通，建议人工完整走一遍并补充截图或备注

结论：

```text
第一周最低可交付状态已基本达成。
剩余工作主要是人工演示确认、Neo4j persisted 可选验证、真实后端 insight_payload 小样联调。
```
