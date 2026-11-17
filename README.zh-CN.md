# witness / panel lab

[English](README.md)

在浏览器里制作、试画和求解《The Witness》的面板谜题。可以从示例库选一题，也可以从空白网格开始。

- 在 **Build** 里放置断线、六边形点、方块、星星、三角、拼块和消除符号，也能设置音高序列、对称、圆柱面板，或用同一条路径解多块面板。
- 在 **Trace** 里手动画线、试摆正负拼块。参考图可以手动对齐，再标出必经或禁行的线段。颜色工具可叠加或去除 RGB 通道。
- **Solve** 能检查路径并标出冲突，也可以提示下一步、从当前路径接着找，或切换已找到的解。

面板和标注保存在浏览器里。要备份或换设备，可以导出 JSON 再导入。网格较大时，搜索可能到达时限。

## 本地运行

用 HTTP 服务托管 `dist/` 目录。如果电脑装了 Python 3，在仓库根目录运行下面的命令。

```sh
python3 -m http.server 8000 --bind 127.0.0.1 --directory dist
```

在浏览器里打开本机的 8000 端口。项目使用原生 HTML、CSS 和 JavaScript 模块，谜题规则在 [engine.mjs](dist/engine.mjs)，搜索由 [Web Worker](dist/worker.mjs) 在后台执行。
