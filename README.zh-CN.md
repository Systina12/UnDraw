# UnDraw

[English](README.md) · [简体中文](README.zh-CN.md)

**随手画条曲线，找出它的数学表达式。** [打开在线演示](https://systina12.github.io/UnDraw/)。

UnDraw 能为手绘曲线和图片中的线条寻找表达式。拟合与边缘识别都在浏览器的 Web Worker 中运行。

## 演示

<p align="center">
  <img src="docs/images/hand-drawn.jpg" width="230" alt="手绘输入" />
  <img src="docs/images/image-edges.jpg" width="230" alt="从图片中选择边缘" />
  <img src="docs/images/fitted-curves.jpg" width="230" alt="图片上的拟合曲线" />
</p>

手绘输入 · 图片描边 · 拟合曲线

## 怎么玩

1. 在坐标系里画一笔或多笔；也可以点 **Upload image** 上传图片，再点选需要拟合的边缘。用 **Draw by hand** 可以在图片上补画。
2. 选择 **One per stroke**（每笔一个函数）或 **Best fit · auto count**（自动决定函数数量），然后点 **Find functions**。结果会逐步出现；继续画新笔可以打断当前计算。
3. 比较 **Simple**、**Balanced** 和默认选中的 **Accurate**。展开 **Prefer shorter formulas**，可以用少量视觉误差换取更简短的系数，默认限度为 5%。结果可以复制为 LaTeX 或普通文本。

按住 Shift 拖动或用鼠标中键平移，滚轮或双指缩放；支持撤销、清空和重置视图。对于无法表示为 `y = f(x)` 的曲线，程序还可以给出参数形式 `x(t)`、`y(t)`。

## 本地运行

需要 Node.js 22 或更新版本。

```sh
npm ci
npm run dev
```

运行 `npm test` 执行测试，或用 `npm run build` 构建可安装、支持离线计算的正式版本。正式版首次联网加载后即可离线计算。界面使用 Canvas 和 KaTeX；独立于界面的求解器在 `src/core/solver.ts` 中导出 `solveCurve(points, options)`。

## 隐私

笔迹和上传的图片在你的设备上处理。页面通过 Cloudflare Web Analytics 统计访问量。

本项目使用 [MIT 许可证](LICENSE)。
