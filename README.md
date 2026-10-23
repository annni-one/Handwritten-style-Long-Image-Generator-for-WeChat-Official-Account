# Handwritten-style-Long-Image-Generator-for-WeChat-Official-Account
本工具采用 AI 决策 + 确定性渲染 的路线： 上传一张参考图作为视觉素材源，本地 ONNX 模型抠图提取装饰贴纸、自动提取整套配色；粘贴纯文本文案，自动拆分为章节，支持手动调整标题与正文；内部通过 HTML+CSS 组装手账排版，复用 Playwright 无头浏览器截图输出高清 PNG
