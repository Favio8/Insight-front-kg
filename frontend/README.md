# Insight 前端工作台

Insight is all you need。

这是 `Insight-front-kg` 的独立前端，用于演示知识图谱结果区、Neo4j 入库状态、企业画像、关系证据和后端 `insight_payload` 接入。

## 技术栈

- React 19
- Vite
- TanStack Router / TanStack Start
- Tailwind CSS
- Cytoscape / react-cytoscapejs

## 快速启动

```bash
npm install
npm run dev
```

访问：

```text
http://127.0.0.1:3001/
```

生产构建：

```bash
npm run build
```

## 页面功能

- `产业总览`：展示产业链分层、环节、龙头企业和右侧企业画像。
- `企业库`：展示企业列表、局部关系图和企业画像，点击公司或关系会联动详情。
- `关联分析`：展示完整知识图谱，支持缩放、拖拽、重置视图、节点展开和关系证据查看。
- `研究报告`：展示当前产业、Neo4j 状态、trace_id、节点/关系/证据统计、企业摘要和关键关系。
- 顶部搜索框支持按企业、环节、技术和产品筛选并自动聚焦。
- `导入 JSON` 支持粘贴后端 Agent 组输出的 `insight_payload`、`/report/` 完整响应、WebSocket `path` 消息或 `/api/reports/{id}` 返回内容。
- 导入弹窗支持按主后端报告 ID、`outputs/*.insight.json` 路径或完整 URL 拉取真实结果。
- `写入 Neo4j` 调用 KG 服务 `/api/graph/ingest`，成功后优先展示 Neo4j 返回的 visualization payload。

## 数据位置

本地演示 sample 放在：

```text
public/samples/new-energy-insight-payload.json
public/samples/new-energy-graph-payload.json
public/samples/pharma-insight-payload.json
```

说明：

- `insight_payload` 驱动产业链地图、企业列表和企业画像。
- `graph_payload` 仅作为中间格式、调试和临时预览数据。
- Neo4j 是主存储；前端主流程通过 KG 服务写入 Neo4j 并展示返回的图谱可视化结果。

## 配置

```text
VITE_KG_API_BASE_URL=http://127.0.0.1:8008
VITE_INSIGHT_API_BASE_URL=http://127.0.0.1:8000
```

## 与 Insight 主后端对接

主项目后端位于 `Insight/AI-Insights-into-the-Future-of-Industry`，当前可对接的结果来源：

```text
POST /report/
GET  /api/reports/{research_id}
GET  /outputs/<task>.insight.json
WS   /ws -> type=path -> output.insight_payload
```

前端导入弹窗支持三种方式：

- 粘贴裸 `insight_payload`。
- 粘贴 `/report/` 完整响应或 WebSocket `path` 消息。
- 输入报告 ID、`outputs/*.insight.json` 路径或完整 URL，从主后端拉取。

拿到 `insight_payload` 后，本前端仍调用 KG 服务 `/api/graph/ingest` 完成 `graph_payload -> Neo4j -> visualization_payload`。

## 主要目录

```text
src/routes/index.tsx                 首页与主要业务布局
src/components/IndustryGraphView.tsx Cytoscape 知识图谱组件
src/components/ui/                   Lovable/shadcn UI 基础组件
src/styles.css                       全局样式和主题变量
public/samples/                      预演样例数据
```

## 提交前检查

```bash
npm run build
```
