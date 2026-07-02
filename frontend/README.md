# 产业链知识图谱工作台

这是一个基于 Lovable UI 改造的产业链知识图谱前端项目，用于展示产业链地图、企业库、企业画像、核心关联图谱和完整知识图谱。

## 技术栈

- React 19
- Vite
- TanStack Router / TanStack Start
- Tailwind CSS
- Cytoscape / react-cytoscapejs

## 快速启动

```bash
npm install
npm run dev -- --host 0.0.0.0 --port 3003
```

访问：

```text
http://localhost:3003/
```

生产构建：

```bash
npm run build
```

## 页面功能

- `产业总览`：展示产业链上下游结构、产业环节和环节内代表企业。
- `企业库`：左侧展示所有企业；中间展示完整知识图谱；右侧展示选中企业画像。
- `核心关联图谱`：在企业详情中展示当前企业与核心关联企业的关系。
- `完整知识图谱`：使用 Cytoscape 展示 `graph_payload.company_edges` 和 `graph_payload.profile_edges`。
- 点击图谱公司节点：选中企业并展开该企业的业务线、产品线、核心技术等画像关系。
- 点击图谱关系边：展示关系证据、来源、置信度和状态。

## 数据位置

当前使用本地 sample 数据，放在：

```text
public/samples/pharma-insight-payload.json
public/samples/new-energy-insight-payload.json
public/samples/new-energy-graph-payload.json
```

其中：

- `insight_payload` 驱动产业链地图、企业列表和企业画像。
- `graph_payload` 驱动完整知识图谱和核心关联图谱。

## 主要目录

```text
src/routes/index.tsx                 首页与主要业务布局
src/components/IndustryGraphView.tsx 完整知识图谱组件
src/components/ui/                   Lovable/shadcn UI 基础组件
src/styles.css                       全局样式和主题变量
public/samples/                      预演样例数据
```

## 协作约定

1. 不提交 `node_modules`、`.output`、`.wrangler` 等本地生成目录。
2. 新增页面功能优先放在 `src/routes/index.tsx` 或拆到 `src/components/`。
3. 新增图谱字段时，先更新 sample 数据，再更新 TypeScript 类型。
4. 提交前至少运行一次：

```bash
npm run build
```

## 当前默认端口

建议本项目使用：

```text
3003
```

避免和旧 Next 前端项目的 `3001/3002` 冲突。
