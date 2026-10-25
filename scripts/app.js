import { ImageRelocator } from "./relocator.js";

export class RelocatorApp {
  static open() {
    if (!game.user.isGM) return ui.notifications.error("只有 GM 才能使用此工具！");

    const getCustomPath = () => {
      return new Promise((resolve) => {
        try {
          new Dialog({
            title: "图片迁移工具 - 设置",
            content: `
              <form>
                <div class="form-group">
                  <label>目标根文件夹 (相对于 Data 目录):</label>
                  <div style="display: flex; gap: 8px; align-items: center; margin-top: 4px;">
                    <input type="text" name="targetDir" value="assets/image-relocator" style="flex: 1; height: 28px;" />
                    <button type="button" class="browse-btn" style="width: auto; flex-shrink: 0; height: 28px;">
                      <i class="fas fa-folder-open"></i> 浏览
                    </button>
                  </div>
                </div>
              </form>
            `,
            buttons: {
              run: {
                icon: '<i class="fas fa-play"></i>',
                label: "真实执行",
                callback: (html) => {
                  let path = html.find('input[name="targetDir"]').val().trim();
                  while (path.includes('%')) { let temp = path; try { path = decodeURIComponent(path); } catch (e) { break; } if (temp === path) break; }
                  resolve({ path: path.replace(/\\/g, '/').replace(/^\/+|\/+$/g, '') || "assets", isDryRun: false });
                }
              },
              dryRun: {
                icon: '<i class="fas fa-eye"></i>',
                label: "试运行",
                callback: (html) => {
                  let path = html.find('input[name="targetDir"]').val().trim();
                  while (path.includes('%')) { let temp = path; try { path = decodeURIComponent(path); } catch (e) { break; } if (temp === path) break; }
                  resolve({ path: path.replace(/\\/g, '/').replace(/^\/+|\/+$/g, '') || "assets", isDryRun: true });
                }
              },
              cancel: { icon: '<i class="fas fa-times"></i>', label: "取消", callback: () => resolve(null) }
            },
            render: (html) => {
              html.find('.browse-btn').on('click', (e) => {
                e.preventDefault(); 
                const FP = foundry.applications?.apps?.FilePicker?.implementation || FilePicker;
                let currentPath = html.find('input[name="targetDir"]').val().trim();
                try { currentPath = decodeURIComponent(currentPath); } catch(err) {}
                new FP({
                  type: "folder",
                  current: currentPath || "assets",
                  callback: (p) => {
                    while (p.includes('%')) { let t = p; try { p = decodeURIComponent(p); } catch (e) { break; } if (t === p) break; }
                    html.find('input[name="targetDir"]').val(p.replace(/^\/+|\/+$/g, '') || "assets");
                  }
                }).browse();
              });
            },
            close: () => resolve(null)
          }).render(true);
        } catch (err) {
          console.error("弹窗创建失败:", err);
          resolve(null);
        }
      });
    };

    getCustomPath().then(async (config) => {
      if (!config || !config.path) return;
      if (!config.isDryRun && !confirm("【警告】此操作将复制图片并修改所有引用。\n请确保已备份世界！\n\n确定继续吗？")) return;

      const progressDialog = new Dialog({
        title: "正在处理图片",
        content: `
          <div style="text-align: center; padding: 15px;">
            <p id="progress-text" style="margin-bottom: 10px; font-weight: bold; font-size: 14px; color: #333;">正在扫描并准备...</p>
            <div style="width: 100%; background-color: #222; border-radius: 6px; height: 24px; overflow: hidden; border: 1px solid #444;">
              <div id="progress-bar" style="width: 0%; background-color: #4caf50; height: 100%; transition: width 0.1s linear; display: flex; align-items: center; justify-content: center; color: white; font-size: 12px; font-weight: bold;">0%</div>
            </div>
          </div>
        `,
        buttons: {},
        closeOnEscape: false,
        render: (html) => {
          html.parent().find('.header-button.close').hide();
        }
      });
      
      if (!config.isDryRun) progressDialog.render(true);
      
      try {
        const result = await ImageRelocator.run({ 
          BASE_DIR: config.path, 
          isDryRun: config.isDryRun,
          onProgress: (data) => {
             if (!progressDialog.element) return;
             const bar = progressDialog.element.find("#progress-bar");
             const text = progressDialog.element.find("#progress-text");
             
             // ★ 阶段1：复制图片（绿色）
             if (data.stage === 'copy') {
                 const percent = Math.round((data.current / data.total) * 100);
                 bar.css("width", `${percent}%`);
                 bar.css("background-color", "#4caf50");
                 bar.text(`${percent}%`);
                 
                 const shortName = data.fileName && data.fileName.length > 35 ? "..." + data.fileName.slice(-32) : (data.fileName || "");
                 text.html(`[1/2] 复制图片: ${data.current} / ${data.total} 张 <br><span style="font-size: 11px; font-weight: normal; color: #666; word-break: break-all; word-wrap: break-word;">${shortName}</span>`);
             } 
             // ★ 阶段2：更新文档（蓝色）
             else if (data.stage === 'update') {
                 const percent = Math.round((data.current / data.total) * 100);
                 bar.css("width", `${percent}%`);
                 bar.css("background-color", "#2196f3");
                 bar.text(`${percent}%`);
                 text.html(`[2/2] 更新文档: ${data.current} / ${data.total} <br><span style="font-size: 11px; font-weight: normal; color: #666;">正在替换角色、物品等文档中的图片路径...</span>`);
             }
          }
        });
        
        if (!config.isDryRun) progressDialog.close();

        if (result.stats && result.stats.total === 0) return ui.notifications.warn(result.msg);

        if (config.isDryRun) {
          const previewData = result.preview;
          let tableHtml = `
            <table style="width: 100%; border-collapse: collapse; font-size: 13px;">
              <thead>
                <tr style="background: #f3f3f3; text-align: left;">
                  <th style="padding: 6px; border-bottom: 2px solid #ccc;">旧图片路径</th>
                  <th style="padding: 6px; border-bottom: 2px solid #ccc;">引用文档</th>
                  <th style="padding: 6px; border-bottom: 2px solid #ccc;">将迁移至</th>
                </tr>
              </thead>
              <tbody>
          `;
          previewData.forEach((item, i) => {
            const bg = i % 2 === 0 ? "#fff" : "#fafafa";
            tableHtml += `
              <tr style="background: ${bg};">
                <td style="padding: 6px; border-bottom: 1px solid #ddd; word-break: break-all; font-family: monospace; font-size: 11px;">${item.旧图片路径}</td>
                <td style="padding: 6px; border-bottom: 1px solid #ddd;">${item.引用文档}</td>
                <td style="padding: 6px; border-bottom: 1px solid #ddd; word-break: break-all; color: #2e7d32;">${item.将迁移至}</td>
              </tr>
            `;
          });
          tableHtml += `</tbody></table>`;

          new Dialog({
            title: `试运行预览 (共 ${previewData.length} 张图片)`,
            content: `<div style="max-height: 500px; overflow-y: auto; border: 1px solid #ccc; border-radius: 4px;">${tableHtml}</div>`,
            buttons: { ok: { icon: '<i class="fas fa-check"></i>', label: "确认无误" } },
            default: "ok"
          }).render(true);
          return;
        }

        const { copied, failed } = result.stats;
        if (failed.length > 0) {
          let htmlList = `
            <p style="color: #d32f2f; font-weight: bold;">成功复制 ${copied} 张，失败 ${failed.length} 张。</p>
            <div style="max-height: 400px; overflow-y: auto; border: 1px solid #ccc; border-radius: 4px; padding: 10px;">
          `;
          failed.forEach((f, i) => {
            htmlList += `
              <div style="margin-bottom: 10px; padding-bottom: 10px; border-bottom: 1px solid #eee;">
                <div style="font-weight: bold; color: #d32f2f;">${i + 1}. ${f.涉及文档} <span style="font-weight: normal; color: #666;">[${f.文档类型}]</span></div>
                <div style="font-family: monospace; font-size: 11px; margin-top: 4px; word-break: break-all;">${f.图片原路径}</div>
                <div style="font-size: 12px; color: #e65100; margin-top: 4px;">原因: ${f.失败原因}</div>
              </div>
            `;
          });
          htmlList += `</div>`;
          
          new Dialog({
            title: "⚠️ 部分图片复制失败",
            content: htmlList,
            buttons: { ok: { icon: '<i class="fas fa-check"></i>', label: "知道了" } },
            default: "ok"
          }).render(true);
          
          ui.notifications.warn(`迁移完成：成功 ${copied} 张，失败 ${failed.length} 张。`);
        } else {
          new Dialog({
            title: "✅ 迁移完美完成",
            content: `
              <div style="text-align: center; padding: 20px;">
                <i class="fas fa-check-circle" style="font-size: 48px; color: #4caf50; margin-bottom: 10px;"></i>
                <h3 style="margin: 0 0 10px 0;">全部成功！</h3>
                <p>共成功复制并修改了 <b>${copied}</b> 张图片。</p>
              </div>
            `,
            buttons: { ok: { icon: '<i class="fas fa-thumbs-up"></i>', label: "太棒了" } },
            default: "ok"
          }).render(true);
        }
      } catch (err) {
        if (!config.isDryRun && progressDialog.element) progressDialog.close();
        console.error(err);
        ui.notifications.error("迁移过程中发生严重错误，请查看 F12 控制台。");
      }
    });
  }
}