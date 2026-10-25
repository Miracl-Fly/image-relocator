export class ImageRelocator {
  static sanitizeName(name) {
    if (!name) return "uncategorized";
    let cleanName = name.trim();
    cleanName = cleanName.replace(/\s+/g, '-');
    cleanName = cleanName.replace(/[\/\\:*?"<>|]/g, '');
    if (!cleanName) return "uncategorized";
    return cleanName;
  }

  static getFolderPath(doc) {
    let parts = [];
    let current = doc.folder;
    while (current) {
      parts.unshift(this.sanitizeName(current.name));
      current = current.folder;
    }
    return parts.length > 0 ? parts.join("/") : "uncategorized";
  }

  static get FP() {
    return foundry.applications?.apps?.FilePicker?.implementation || FilePicker;
  }

  static async ensureDirectory(source, path) {
    if (!path) return;
    const parts = path.split('/');
    let current = '';
    for (const part of parts) {
      current = current ? `${current}/${part}` : part;
      try {
        await this.FP.browse(source, current);
      } catch (e) {
        try {
          await this.FP.createDirectory(source, current);
        } catch (err) {}
      }
    }
  }

  static async getBlobHash(blob) {
    try {
      const arrayBuffer = await blob.arrayBuffer();
      const bytes = new Uint8Array(arrayBuffer);
      let hash = 2166136261;
      for (let i = 0; i < bytes.length; i++) {
        hash ^= bytes[i];
        hash += (hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24);
      }
      return (hash >>> 0).toString(16).padStart(8, '0');
    } catch (e) {
      return `size${blob.size}_${Math.random().toString(36).substring(2, 6)}`;
    }
  }

  static async run({ BASE_DIR, isDryRun = false, onProgress }) {
    const imageMap = new Map(); 
    
    const isAlreadyClassified = (path) => {
      return path.startsWith(`${BASE_DIR}/actors/`) || path.startsWith(`${BASE_DIR}/items/`) || 
             path.startsWith(`${BASE_DIR}/scenes/`) || path.startsWith(`${BASE_DIR}/journals/`) || 
             path.startsWith(`${BASE_DIR}/macros/`) || path.startsWith(`${BASE_DIR}/tables/`);
    };

    const addPath = (path, type, docId, baseDir, doc, docName) => {
      if (!path || typeof path !== "string") return;
      if (path.startsWith("icons/") || path.startsWith("systems/") || isAlreadyClassified(path)) return;
      
      if (!imageMap.has(path)) {
        imageMap.set(path, { type, docId, baseDir, folderPath: this.getFolderPath(doc), sources: [] });
      }
      const info = imageMap.get(path);
      if (!info.sources.some(s => s.name === docName && s.type === type)) {
        info.sources.push({ name: docName, type: type });
      }
    };

    for (const actor of game.actors) {
      addPath(actor.img, "角色头像", actor.id, "actors", actor, actor.name);
      addPath(actor.prototypeToken?.texture?.src, "角色Token", actor.id, "actors", actor, actor.name);
    }
    for (const item of game.items) addPath(item.img, "物品图片", item.id, "items", item, item.name);
    for (const scene of game.scenes) {
      addPath(scene.background?.src, "场景背景", scene.id, "scenes", scene, scene.name);
      if (scene.foreground) addPath(scene.foreground, "场景前景", scene.id, "scenes", scene, scene.name);
      for (const token of scene.tokens) addPath(token.texture?.src, "场景Token", token.id, "scenes", scene, `${scene.name} (Token: ${token.name})`);
      for (const tile of scene.tiles) addPath(tile.texture?.src, "场景图块", tile.id, "scenes", scene, `${scene.name} (图块)`);
    }
    for (const journal of game.journal) {
      for (const page of journal.pages) {
        if (page.type === "image") addPath(page.src, "日志图片", page.id, "journals", journal, `${journal.name} (页面: ${page.name || '图片页'})`);
        else if (page.type === "text") {
          const html = page.text?.content ?? "";
          const imgRegex = /<img[^>]+src=["']([^"']+)["']/gi;
          let match;
          while ((match = imgRegex.exec(html)) !== null) addPath(match[1], "日志文本图片", page.id, "journals", journal, `${journal.name} (页面: ${page.name || '文本页'})`);
        }
      }
    }
    for (const macro of game.macros) addPath(macro.img, "宏图片", macro.id, "macros", macro, macro.name);
    for (const table of game.tables) addPath(table.img, "掷骰表图片", table.id, "tables", table, table.name);

    if (imageMap.size === 0) return { success: true, msg: "没有找到需要整理的图片。", stats: { total: 0 } };
    
    if (isDryRun) {
      const preview = [...imageMap.entries()].map(([path, info]) => ({
        旧图片路径: path, 引用文档: info.sources.map(s => s.name).join(", "), 将迁移至: `${BASE_DIR}/${info.baseDir}/${info.folderPath}`
      }));
      return { success: true, msg: "试运行结束", preview };
    }

    // ================= 阶段 1：复制图片 =================
    const pathMap = new Map(); 
    const failedPaths = []; 
    let successCount = 0;
    let idx = 0;
    const processedHashes = new Map(); 

    for (const [oldPath, info] of imageMap) {
      idx++;
      let rawFileName = oldPath.split("/").pop();
      try { rawFileName = decodeURIComponent(rawFileName); } catch (e) {}
      
      if(onProgress) onProgress({ stage: 'copy', current: idx, total: imageMap.size, fileName: rawFileName });
      await new Promise(resolve => setTimeout(resolve, 10));
      
      try {
        let blob;
        let fetchUrl = oldPath.startsWith("http") || oldPath.startsWith("assets") ? oldPath : "assets/" + oldPath.replace(/^\/+/, '');
        
        try { blob = await foundry.utils.fetchResource(fetchUrl); }
        catch (e1) {
          try { blob = await foundry.utils.fetchResource(oldPath); }
          catch (e2) {
            try { blob = await foundry.utils.fetchResource(decodeURIComponent(oldPath)); }
            catch (e3) { throw new Error("源文件丢失或无法读取 (404)"); }
          }
        }

        const contentHash = await this.getBlobHash(blob);
        const extMatch = rawFileName.match(/\.[a-zA-Z0-9]+$/);
        const ext = extMatch ? extMatch[0].toLowerCase() : ".png";
        const newFileName = `img_${contentHash}${ext}`;
        
        const targetDirPath = `${BASE_DIR}/${info.baseDir}/${info.folderPath}`;
        const newPath = `${targetDirPath}/${newFileName}`;
        
        if (processedHashes.has(newPath)) {
          pathMap.set(oldPath, newPath);
          successCount++;
          continue;
        }

        await this.ensureDirectory("data", targetDirPath);
        const browseResult = await this.FP.browse("data", targetDirPath);
        const existsOnDisk = browseResult.files.some(f => decodeURIComponent(f) === decodeURIComponent(newPath));

        if (existsOnDisk) {
          pathMap.set(oldPath, newPath);
          processedHashes.set(newPath, true);
          successCount++;
          continue;
        }

        const file = new File([blob], newFileName, { type: blob.type });
        
        try { await this.FP.upload("data", targetDirPath, file, {}, { notify: false }); } 
        catch (uploadErr) {
          await this.ensureDirectory("data", targetDirPath);
          await this.FP.upload("data", targetDirPath, file, {}, { notify: false });
        }
        
        const postBrowse = await this.FP.browse("data", targetDirPath);
        if (postBrowse.files.some(f => decodeURIComponent(f) === decodeURIComponent(newPath))) {
          pathMap.set(oldPath, newPath);
          processedHashes.set(newPath, true);
          successCount++;
        } else {
          throw new Error("上传后校验失败");
        }
      } catch (err) {
        failedPaths.push({
          图片原路径: oldPath, 涉及文档: info.sources.map(s => s.name).join(", "), 
          文档类型: [...new Set(info.sources.map(s => s.type))].join(", "), 失败原因: err.message
        });
      }
    }

    // ================= 阶段 2：重写文档引用 =================
    // 统计总数，方便做进度条
    let totalDocs = game.actors.size + game.scenes.size + game.items.size + game.macros.size + game.tables.size + game.journal.size;
    let docCurrent = 0;

    if (onProgress) onProgress({ stage: 'update', current: 0, total: totalDocs });
    await new Promise(resolve => setTimeout(resolve, 10));

    for (const actor of game.actors) {
      const updates = {};
      if (pathMap.has(actor.img)) updates.img = pathMap.get(actor.img);
      if (pathMap.has(actor.prototypeToken?.texture?.src)) updates["prototypeToken.texture.src"] = pathMap.get(actor.prototypeToken.texture.src);
      if (Object.keys(updates).length) await actor.update(updates);
      
      docCurrent++;
      if (onProgress) onProgress({ stage: 'update', current: docCurrent, total: totalDocs });
      await new Promise(resolve => setTimeout(resolve, 5));
    }

    for (const scene of game.scenes) {
      const sUpdates = {};
      if (pathMap.has(scene.background?.src)) sUpdates["background.src"] = pathMap.get(scene.background.src);
      if (scene.foreground && pathMap.has(scene.foreground)) sUpdates["foreground"] = pathMap.get(scene.foreground);
      if (Object.keys(sUpdates).length) await scene.update(sUpdates);
      
      for (const token of scene.tokens) {
        if (pathMap.has(token.texture?.src)) await token.update({ "texture.src": pathMap.get(token.texture.src) });
      }
      for (const tile of scene.tiles) {
        if (pathMap.has(tile.texture?.src)) await tile.update({ "texture.src": pathMap.get(tile.texture.src) });
      }

      docCurrent++;
      if (onProgress) onProgress({ stage: 'update', current: docCurrent, total: totalDocs });
      await new Promise(resolve => setTimeout(resolve, 5));
    }

    for (const item of game.items) {
      if (pathMap.has(item.img)) await item.update({ img: pathMap.get(item.img) });
      docCurrent++;
      if (onProgress) onProgress({ stage: 'update', current: docCurrent, total: totalDocs });
      await new Promise(resolve => setTimeout(resolve, 5));
    }

    for (const macro of game.macros) {
      if (pathMap.has(macro.img)) await macro.update({ img: pathMap.get(macro.img) });
      docCurrent++;
      if (onProgress) onProgress({ stage: 'update', current: docCurrent, total: totalDocs });
      await new Promise(resolve => setTimeout(resolve, 5));
    }

    for (const table of game.tables) {
      if (pathMap.has(table.img)) await table.update({ img: pathMap.get(table.img) });
      docCurrent++;
      if (onProgress) onProgress({ stage: 'update', current: docCurrent, total: totalDocs });
      await new Promise(resolve => setTimeout(resolve, 5));
    }

    for (const journal of game.journal) {
      for (const page of journal.pages) {
        if (page.type === "image" && pathMap.has(page.src)) {
          await page.update({ src: pathMap.get(page.src) });
        } else if (page.type === "text") {
          let html = page.text?.content ?? "";
          let changed = false;
          for (const [oldPath, newPath] of pathMap) {
            if (html.includes(oldPath)) {
              html = html.split(oldPath).join(newPath).split(encodeURIComponent(oldPath)).join(newPath);
              changed = true;
            }
          }
          if (changed) await page.update({ "text.content": html });
        }
      }
      docCurrent++;
      if (onProgress) onProgress({ stage: 'update', current: docCurrent, total: totalDocs });
      await new Promise(resolve => setTimeout(resolve, 5));
    }

    return { success: true, stats: { total: imageMap.size, copied: successCount, failed: failedPaths }, failedPaths };
  }
}