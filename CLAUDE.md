# 本地资源管理器

## 项目目标
构建一个本地文件管理器，替代 macOS 访达的核心文件浏览与管理功能。通过浏览器访问 localhost 使用。

## 技术栈
- **后端**: Python 3 + FastAPI
- **前端**: HTML + CSS + Vanilla JS（无构建工具）
- **运行方式**: `python main.py` 启动，浏览器打开 `http://localhost:4060`

## 目录结构
```
.
├── CLAUDE.md          # 项目规范（本文件）
├── main.py            # 启动入口
├── requirements.txt   # 依赖
├── server.py          # FastAPI 应用 & API 路由
└── static/
    ├── index.html     # 前端页面
    ├── style.css      # 样式
    └── app.js         # 前端逻辑
```

## 约束
- 仅操作本地文件系统，不涉及网络/云存储
- 危险操作（删除、覆盖）必须二次确认
- 不自动遍历深层目录，避免性能问题
- 前端不引入框架，保持轻量

## 文件命名规范
- Python: snake_case
- JS/CSS: camelCase / kebab-case
- 目录名: 小写中文或英文
