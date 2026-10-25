<h1 align="center">🖼️ Image Relocator (Foundry VTT 图片迁移工具)</h1>

一个专为 Foundry VTT 打造的神器级图片管理模块。无论你导入了多么混乱的模组（比如 PF1 的冒险之路），只需一键，即可自动扫描世界内的所有图片，按规范分类、去重并重写所有文档引用。
✨ 核心功能
📦 自动分类与建库：自动将图片按类型（actors、items、scenes、journals、macros 等）进行整理。

📁 保留文件夹层级：读取 Foundry 中的文件夹结构，自动转化为对应的物理文件夹（支持中文，空格自动转为连字符 -）。

🧠 智能路径补全：自动识别缺失 assets/ 前缀的图片，并支持 URL 编码（如 %E6%...）的自动解码读取，极大提高图片加载成功率。

♻️ 内容级物理去重：基于纯 JS 哈希算法（Hash）比对图片内容。100 个怪物用同一张默认图，硬盘里也只会保存 1 份，彻底告别空间浪费。

📊 双阶段进度条 UI：内置精美的可视化进度条。第一阶段（绿色）复制图片，第二阶段（蓝色）更新文档引用，绝不假死。

🛡️ 防呆与错误报告：先提供“试运行”预览表，确认无误后再执行。如果存在 404 丢失图片或权限问题，会弹窗生成详细的失败列表（精确到角色名、物品名），方便排查。

⚡ 局域网完美兼容：摆脱 HTTPS 限制，即使在局域网 HTTP 环境下也能完美运行。

🚀 安装方法
方法一：Manifest URL 安装（推荐）
打开 Foundry VTT 的“附加模块 (Add-on Modules)”页面。

点击底部的“安装模块 (Install Module)”。

在“Manifest URL”输入框中粘贴：[这里填入你GitHub发布后的module.json链接]

点击安装。

方法二：手动安装
下载本仓库的 .zip 压缩包。

解压并将其放入你的 {UserData}/Data/modules/ 目录下。

确保解压后的文件夹名称为 image-relocator。

📖 使用指南
在 Foundry 中启用该模块。

作为 GM，进入游戏。在左侧工具栏找到“Token 控制”（小人图标），点击下方的 🖼️ (Image Relocator) 按钮。

（可选）你也可以在 “游戏设置 -> 配置设置” 中找到并打开它。

在弹出的设置窗口中，输入或通过“浏览”选择你想要保存图片的目标文件夹（默认 assets/image-relocator）。

💡 强烈建议先点击“试运行”，在预览表格中确认文件夹分类和路径是否符合你的预期。

确认无误后，点击 “真实执行”，看着进度条跑完即可！

⚠️ 注意事项
务必提前备份世界数据：任何批量修改文档引用的操作都有风险，执行前请务必备份你的 worlds 文件夹。

模块会自动跳过系统默认图标（如 icons/svg/mystery-man.svg），不会对系统文件进行复制。

由于 Foundry V13 的安全限制，建议将目标路径设置在 Data/assets/ 目录下，模块已做自动兼容处理。

## 🛠️ 开发者 API

如果您希望在自己的宏或模块中调用此工具，可以使用以下全局 API：

**1. 直接打开可视化 UI 界面**

```javascript
game.modules.get("image-relocator").api.openApp();
```
**2. 纯代码静默调用 (示例)**
```javascript
await game.modules.get("image-relocator").api.run({
  BASE_DIR: "assets/my-custom-folder",
  isDryRun: false,
  onProgress: (data) => {
    // data.stage 为 'copy' 或 'update'
    console.log(`进度: ${data.current}/${data.total}`);
  }
});
```

## 📜 许可协议 (License)

本项目采用 MIT License 许可。你可以自由分发、修改，甚至用于商业跑团，但请保留原作者信息。
