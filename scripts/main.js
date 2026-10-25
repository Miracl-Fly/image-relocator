import { RelocatorApp } from "./app.js";
import { ImageRelocator } from "./relocator.js";

Hooks.once('init', () => {
  game.settings.registerMenu("image-relocator", "relocatorMenu", {
    name: "打开图片迁移工具",
    label: "启动迁移",
    hint: "扫描并自动整理世界内的所有图片文件。",
    icon: "fas fa-images",
    type: class extends FormApplication {
      constructor(...args) {
        super(...args);
        setTimeout(() => { this.close(); RelocatorApp.open(); }, 100);
      }
      render() { return this; }
    },
    restricted: true
  });

  game.modules.get("image-relocator").api = {
    openApp: RelocatorApp.open,
    run: ImageRelocator.run.bind(ImageRelocator)
  };
});

Hooks.on("getSceneControlButtons", (controls) => {
  if (!game.user.isGM) return;

  // ★ 修复：去掉了所有 event 相关的错误操作，直接执行
  const handleOpen = () => {
    try {
      RelocatorApp.open();
    } catch (err) {
      console.error("Image Relocator | 打开窗口失败:", err);
      ui.notifications.error("打开失败，请按 F12 查看控制台。");
    }
  };

  let tokenControl = null;
  if (controls.tokens) tokenControl = controls.tokens;
  else if (controls.token) tokenControl = controls.token;
  else if (Array.isArray(controls)) tokenControl = controls.find(c => c.name === "token");

  if (tokenControl) {
    const newTool = {
      name: "image-relocator",
      title: "图片迁移工具",
      icon: "fas fa-images",
      button: true,
      onClick: handleOpen,
      visible: true
    };

    if (Array.isArray(tokenControl.tools)) {
      tokenControl.tools.push(newTool);
    } else {
      tokenControl.tools = tokenControl.tools || {};
      tokenControl.tools["image-relocator"] = newTool;
    }
  } else {
    controls["image-relocator-layer"] = {
      name: "image-relocator-layer",
      title: "图片迁移",
      icon: "fas fa-images",
      visible: true,
      tools: [{
        name: "image-relocator-run",
        title: "打开图片迁移工具",
        icon: "fas fa-images",
        button: true,
        onClick: handleOpen
      }]
    };
  }
});