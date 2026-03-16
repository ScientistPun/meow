# Seedream Tools

Seedream 图像生成工具的辅助应用，提供网页版和桌面版两种使用方式。

## 项目结构

```
├── web/        # 网页版 (Node.js + Express)
└── window/     # 桌面版 (Electron)
```

## 功能

- 支持 Seedream 模型参数配置
- 图像生成接口封装
- 本地服务器提供 Web UI

## 快速开始

### 网页版

```bash
cd web
npm install
npm start
```

访问 http://localhost:3000

### 桌面版

```bash
cd window
npm install
npm start
```

打包分发：
```bash
npm run dist
```

## 配置

编辑 `config.yml` 配置 Seedream API 参数。

## License

ISC
