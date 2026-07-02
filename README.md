# Insight-front-kg

产业链知识图谱工作台项目，包含前端工作台、KG 服务、样例数据和联调文档。

## 当前推荐运行入口

```text
frontend/
```

`frontend` 现在是基于 Lovable UI 改造后的正式前端，支持产业总览、企业库、企业画像、核心关联图谱、完整 Cytoscape 知识图谱和本地 sample 数据预演。

旧 Next.js 前端已归档到：

```text
legacy-next-frontend/
```

一般开发和演示请优先使用 `frontend/`。

## 目录结构

```text
frontend/              正式前端，Vite + React + TanStack + Cytoscape
kg-service/            FastAPI 知识图谱服务
samples/               根目录样例数据
docs/                  接口协议、需求说明和文档
docker-compose.neo4j.yml
```

## 启动前端

```bash
cd frontend
npm install
npm run dev -- --host 0.0.0.0 --port 3003
```

访问：

```text
http://localhost:3003/
```

构建检查：

```bash
npm run build
```

## 前端数据

前端默认读取：

```text
frontend/public/samples/pharma-insight-payload.json
frontend/public/samples/new-energy-insight-payload.json
frontend/public/samples/new-energy-graph-payload.json
```

其中：

- `insight_payload` 驱动产业链地图、企业列表和企业画像。
- `graph_payload` 驱动核心关联图谱和完整知识图谱。

## 启动 KG 服务

```bash
cd kg-service
pip install -r requirements.txt
python -m uvicorn app:app --host 0.0.0.0 --port 8008 --reload
```

健康检查：

```text
http://localhost:8008/health
```

## Neo4j 可选入库

```bash
docker compose -f docker-compose.neo4j.yml up -d
```

环境变量示例：

```text
NEO4J_URI=bolt://localhost:7687
NEO4J_USER=neo4j
NEO4J_PASSWORD=your_password
GRAPH_AUTO_PERSIST=true
```

Neo4j Browser：

```text
http://localhost:7474
```

## 协作注意

- 不提交 `node_modules`、`.output`、`.next`、`.wrangler`、`__pycache__` 等生成目录。
- 前端改动优先进入 `frontend/src/`。
- KG 服务改动进入 `kg-service/`。
- 新增样例数据时，同步说明字段含义和使用入口。
- 提交前建议运行：

```bash
cd frontend
npm run build
```

```bash
cd kg-service
python -m pytest -q
```

