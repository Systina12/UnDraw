# Hand-drawn Function Finder Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 `soltest` 分支交付一款可离线使用的纯前端手绘函数识别器，让用户绘制曲线后得到简洁的数学表达式、拟合曲线和 Simple / Balanced / Accurate 候选。

**Architecture:** Canvas 只负责数学坐标、笔迹和呈现，Worker 负责预处理、模型拟合、有界符号搜索及渐进消息。无 DOM 依赖的 TypeScript core 统一使用 AST、CandidatePool、Pareto 和 MDL，参数模式复用标量求解器并对一对表达式联合评分。

**Tech Stack:** Vite、TypeScript、Canvas 2D、Web Worker、KaTeX、Vitest、Playwright、`vite-plugin-pwa`。

**Spec:** `docs/superpowers/specs/2026-09-21-hand-drawn-function-finder-design.md`。每项任务实施前先读该文档的相关章节；本计划的具体文件和接口是执行顺序的契约。

## Global Constraints

- 所有产品代码与文档提交到 `soltest`；执行前运行 `git branch --show-current` 并确认输出为 `soltest`。不从仓库其他开发分支复制代码。
- 第一版只处理一条主笔迹，函数和非单值参数曲线都要完整支持。
- `src/core/`、`src/math/`、`src/expr/`、`src/models/`、`src/search/`、`src/beautify/` 不得导入 DOM、Canvas 或 Worker API。
- 默认 x/y 视口均为 `[-5,5]`；正常函数样本 256、验证 bucket 128。
- 符号搜索结构复杂度最多 12，自由参数最多 8；每层最多 300 个结构，二元组合宽度 48，漂亮化 beam 宽度 32。
- 求解与输出曲线全部在浏览器 Worker 内完成；主线程只操作交互与 KaTeX。页面缓存后断网重开仍能求解。
- 普通函数和参数曲线最终公式、绘图以及复制内容都必须来自同一个最终 AST。
- 使用 Float64 数值运算，QR 求解最小二乘；不得显式求 `(AᵀA)⁻¹`。
- 输入有至少 8 个有效点才尝试求解；所有浮点运算必须处理 NaN、Infinity、domain 无效与近零除数。
- 测试中的合成笔迹使用固定种子；性能目标按设计规格第 24 节执行，CI 不设置严格墙钟断言。
- 每个任务遵循红→绿→重构；只提交该任务列出的文件及必要 lockfile，确保 `npm run build` 和当时已有测试保持通过。

## Review Focus

1. 近乎水平的笔迹使 `ys≈0`：预处理仍产生有限的归一化数据，常数模型得到正常结果；Task 4、Task 9 的测试固定此行为。
2. 圆、竖线或 x 回头：识别为参数模式并输出两个有效表达式；Task 3、Task 21 的测试固定此行为。
3. 迅速绘制第二条笔迹：旧 Worker 结果不会覆盖新结果，旧计算得到取消或 Worker 重建；Task 10、Task 22 的测试固定此行为。
4. 有理模型分母在笔迹区间内接近零：候选被拒绝，页面继续展示 fallback；Task 15、Task 22 的测试固定此行为。
5. 首次在线加载后断网重开：页面、Worker、KaTeX 字体与求解全部可用；Task 23 的测试固定此行为。

## File map and stable interfaces

| Files | Single responsibility | First owning task |
|---|---|---:|
| `package.json`, lockfile, `index.html`, `vite.config.ts`, `tsconfig*.json`, `vitest.config.ts`, `src/main.ts`, `src/ui/app.ts`, `src/ui/styles.css` | 构建、测试及可运行应用外壳 | 1 |
| `src/ui/viewport.ts`, `src/ui/canvas.ts`, `src/ui/gestures.ts` | 坐标变换、绘制及平移缩放 | 2、22 |
| `src/ui/stroke.ts`, `src/ui/state.ts`, `src/ui/controls.ts` | 指针采集、状态和操作历史 | 3、22 |
| `src/core/types.ts`, `options.ts`, `preprocess.ts`, `validateFunction.ts`, `noise.ts` | 公共契约、清洗、预噪声和模式选择 | 1、3 |
| `src/core/resample.ts`, `smooth.ts`, `normalize.ts` | 均匀采样、平滑、正式噪声与尺度 | 4 |
| `src/math/statistics.ts`, `vector.ts`, `matrix.ts`, `qr.ts`, `leastSquares.ts` | 分位数、MAD 与 Householder QR | 3、5 |
| `src/expr/ast.ts`, `evaluate.ts`, `serialize.ts`, `canonical.ts`, `simplify.ts`, `substitute.ts`, `polynomial.ts`, `latex.ts`, `plain.ts`, `complexity.ts` | 表达式语义和输出 | 6、7 |
| `src/search/producer.ts`, `candidatePool.ts`, `scoring.ts`, `pareto.ts`, `modelBank.ts`, `fallback.ts` | 模型候选生产、验证、比较和兜底 | 8、9、18 |
| `src/models/shared.ts`, `polynomial.ts`, `sinusoid.ts`, `fourier.ts`, `exponential.ts`, `logarithm.ts`, `absolute.ts`, `rational.ts`, `gaussian.ts`, `tanh.ts`, `logistic.ts`, `dampedSinusoid.ts` | 各模型拟合并生成 AST | 9、12、14～16 |
| `src/math/brent.ts`, `linearSolve.ts`, `lm.ts`, `robust.ts`, `fft.ts` | 有界优化、IRLS、频谱 | 11、12、13 |
| `src/beautify/rational.ts`, `constants.ts`, `beautify.ts` | 有限候选常数与组合吸附 | 17 |
| `src/core/features.ts`, `quality.ts`, `solver.ts`, `progressive.ts` | 特征、编排、质量与同步／渐进入口 | 9、10、19 |
| `src/expr/template.ts`, `src/search/grammar.ts`, `semanticHash.ts`, `symbolic.ts` | 带参数 grammar、语义去重和有限 beam | 20 |
| `src/worker/protocol.ts`, `solver.worker.ts`, `client.ts` | 消息、取消、Worker 生命周期 | 10 |
| `src/ui/app.ts`, `plot.ts`, `formulaPanel.ts` | 结果渲染、切换、可访问呈现 | 10、22 |
| `public/manifest.webmanifest`, `public/icons/*` | 离线安装元数据和本地图标 | 23 |
| `tests/unit/*`, `tests/integration/*`, `tests/synthetic/*`, `tests/browser/*`, `tests/fixtures/*` | 分层行为检验与固定种子生成器 | 各任务 |
| `benchmarks/solver.bench.ts`, `README.md` | 性能记录与使用说明 | 24 |

公共导出统一遵循规格第 6 节：`Point`、`Viewport`、`SolverOptions`、`Expr`、`Constant`、`Candidate`、`SolveResult`、`CandidateResult`、`ParametricCandidateResult`。这些类型一经定义由后续任务复用，不在模型文件里重定义。普通函数内部数据为 `CurveData`（`x`, `rawY`, `smoothY`, `weights`，均 256 点；`normalization`、`sigmaDraw`、`features`）；参数输入为 `ParametricData`（`t`, `rawX`, `rawY`, `smoothX`, `smoothY`, `sigmaX`, `sigmaY`, `sigmaDraw=hypot(sigmaX,sigmaY)`）。所有结果的绘图采样都调用 `evaluate(expr, x)`。

每项任务的测试命令使用 `npm test -- <path>`，由 `package.json` 的 `"test": "vitest run"` 支持。浏览器测试使用 `npm run test:e2e -- <path>`；Task 23 引入该命令。以下代码片段表达边界和关键断言；按该任务列出的接口、规格章节与断言实现完整行为。

---

### Task 1: 可构建的 Vite 外壳和测试入口

**Files:** Create `package.json`, `package-lock.json`, `index.html`, `vite.config.ts`, `vitest.config.ts`, `tsconfig.json`, `tsconfig.node.json`, `src/main.ts`, `src/ui/app.ts`, `src/ui/styles.css`, `src/core/types.ts`, `tests/unit/shell.test.ts`, `.gitignore`.

**Interfaces:** Consumes none. Produces `#app` DOM 容器、`npm run dev`, `npm run build`, `npm test`, `npm run typecheck`。

- [ ] **Step 1: 先创建失败的 shell 测试。**

```ts
// tests/unit/shell.test.ts
import { describe, expect, it } from 'vitest';
import { createAppShell } from '../../src/ui/app';
describe('app shell', () => {
  it('renders a canvas and an accessible drawing hint', () => {
    const root = document.createElement('div');
    createAppShell(root);
    expect(root.querySelector('canvas')).not.toBeNull();
    expect(root.textContent).toContain('Draw a curve');
  });
});
```

- [ ] **Step 2: 运行 `npm test -- tests/unit/shell.test.ts`，预期因 `src/ui/app` 尚不存在而失败。** 此步骤先创建最小 package scripts 与 `vitest.config.ts`，设置 jsdom 环境；安装 `vite typescript vitest jsdom katex @types/katex` 并生成 lockfile。

```json
{"scripts":{"dev":"vite","build":"tsc --noEmit && vite build","typecheck":"tsc --noEmit","test":"vitest run","test:watch":"vitest"}}
```

- [ ] **Step 3: 创建最小应用外壳。** `createAppShell(root: HTMLElement): HTMLCanvasElement` 创建 heading、绘图说明和 canvas；`main.ts` 获取 `#app` 并调用它。`index.html` 通过 module script 加载 `/src/main.ts`，主线程 `tsconfig` 使用 DOM/ES2022 libs；Task 10 单独加入 Worker tsconfig。`src/core/types.ts` 先定义 `Viewport`，供 Task 2 使用。

```ts
// src/ui/app.ts
export function createAppShell(root: HTMLElement): HTMLCanvasElement {
  root.innerHTML = '<main><h1>UnDraw</h1><p>Draw a curve</p><canvas aria-label="Coordinate plane"></canvas></main>';
  return root.querySelector('canvas')!;
}
// src/core/types.ts
export interface Viewport {xMin:number;xMax:number;yMin:number;yMax:number}
```

- [ ] **Step 4: 运行 `npm test -- tests/unit/shell.test.ts`, `npm run typecheck`, `npm run build`，预期全部通过；启动 `npm run dev` 检查页面显示。**
- [ ] **Step 5: 仅提交本任务文件：** `git add package.json package-lock.json index.html vite.config.ts vitest.config.ts tsconfig.json tsconfig.node.json src/main.ts src/ui/app.ts src/ui/styles.css src/core/types.ts tests/unit/shell.test.ts .gitignore && git commit -m "chore: bootstrap UnDraw web app"`。

### Task 2: 数学视口、坐标轴与缩放

**Files:** Create `src/ui/viewport.ts`, `src/ui/canvas.ts`, `tests/unit/viewport.test.ts`; Modify `src/ui/app.ts`, `src/ui/styles.css`.

**Interfaces:** `ViewportTransform(view: Viewport, width: number, height: number)` produces `screenToWorld(px,py)`, `worldToScreen(x,y)`, `zoomAt(px,py,factor)`, `pan(dxPx,dyPx)`, `reset()`；`renderPlane(ctx, transform, devicePixelRatio)` draws grid/axes。

- [ ] **Step 1: 编写变换往返和光标缩放测试。**

```ts
const v = new ViewportTransform({xMin:-5,xMax:5,yMin:-5,yMax:5},1000,500);
expect(v.screenToWorld(500,250)).toEqual({x:0,y:0});
const world=v.screenToWorld(300,200);
v.zoomAt(300,200,2);
expect(v.screenToWorld(300,200).x).toBeCloseTo(world.x,12);
expect(v.screenToWorld(300,200).y).toBeCloseTo(world.y,12);
expect(v.worldToScreen(world.x,world.y).x).toBeCloseTo(300,12);
expect(v.worldToScreen(world.x,world.y).y).toBeCloseTo(200,12);
```

- [ ] **Step 2: 运行 `npm test -- tests/unit/viewport.test.ts`，预期 import 或断言失败。**
- [ ] **Step 3: 实现有限视口变换和 `renderPlane`。** x/y 的 CSS px 变换使用设计第 7 节公式；`zoomAt` 保持 world anchor 不动，跨度限制 `[1e-3,1e6]`；`pan` 使用视口跨度和 CSS px；`ResizeObserver` 更新 backing store 为 CSS 尺寸 × DPR，画布清晰并每帧重画。

```ts
screenToWorld(px:number,py:number) {
  return {x:this.view.xMin+px/this.width*(this.view.xMax-this.view.xMin),
          y:this.view.yMax-py/this.height*(this.view.yMax-this.view.yMin)};
}
```

- [ ] **Step 4: 运行视口测试、`npm run build`，手工在 dev 页面缩放后观察轴刻度和坐标方向。**
- [ ] **Step 5: 提交：** `git add src/ui/viewport.ts src/ui/canvas.ts src/ui/app.ts src/ui/styles.css tests/unit/viewport.test.ts && git commit -m "feat: draw a navigable coordinate plane"`。

### Task 3: Pointer 笔迹、初始噪声和函数判定

**Files:** Create `src/core/options.ts`, `src/core/preprocess.ts`, `src/core/noise.ts`, `src/core/validateFunction.ts`, `src/math/statistics.ts`, `src/ui/stroke.ts`, `tests/unit/stroke.test.ts`, `tests/unit/validateFunction.test.ts`, `tests/unit/statistics.test.ts`; Modify `src/core/types.ts`, `src/ui/app.ts`, `src/ui/canvas.ts`.

**Interfaces:** `median(values)`, `percentile(values,p)`, `mad(values)`；`sanitizeStroke(points: readonly Point[]): Point[]`; `estimatePreliminaryNoise(points): number`; `classifyStroke(points, bucketCount=128): 'function'|'parametric'`; `captureStroke(canvas, transform, onComplete): () => void` 返回监听器清理函数。

- [ ] **Step 1: 写线、回头、圆、竖线和绘图保序测试。**

```ts
expect(classifyStroke(Array.from({length:80},(_,i)=>({x:i/20,y:Math.sin(i/20),t:i})))).toBe('function');
const circle=Array.from({length:180},(_,i)=>({x:Math.cos(2*Math.PI*i/179),y:Math.sin(2*Math.PI*i/179),t:i}));
expect(classifyStroke(circle)).toBe('parametric');
expect(classifyStroke(Array.from({length:80},(_,i)=>({x:1,y:i/20,t:i})))).toBe('parametric');
expect(sanitizeStroke([{x:0,y:0,t:0},{x:NaN,y:1,t:1},{x:1,y:1,t:2}]).map(p=>p.x)).toEqual([0,1]);
expect(median([9,1,5])).toBe(5);
expect(percentile([0,10,20,30,40],.95)).toBeCloseTo(38,10);
const done=vi.fn();
const canvas=document.createElement('canvas');
canvas.setPointerCapture=vi.fn();
canvas.getBoundingClientRect=()=>({left:0,top:0,width:100,height:100} as DOMRect);
captureStroke(canvas,new ViewportTransform({xMin:-5,xMax:5,yMin:-5,yMax:5},100,100),done);
canvas.dispatchEvent(Object.assign(new Event('pointerdown'),{pointerId:4,button:0,clientX:50,clientY:50}));
canvas.dispatchEvent(Object.assign(new Event('pointerup'),{pointerId:4,clientX:60,clientY:50}));
expect(done).toHaveBeenCalledTimes(1);
expect(done.mock.calls[0][0][0]).toMatchObject({x:0,y:0});
```

- [ ] **Step 2: 运行 `npm test -- tests/unit/validateFunction.test.ts tests/unit/stroke.test.ts tests/unit/statistics.test.ts`，预期失败。**
- [ ] **Step 3: 扩展 `src/core/types.ts` 的 `Viewport`，增加 `Point`、`SolverOptions` 及默认值；在 `statistics.ts` 实现有界分位数、median/MAD；清洗非有限点、相邻重复点并保留时间顺序；局部预测残差 MAD 得预噪声；128 buckets 用 `y05..y95`、分离轨迹访问区段及 `max(4σ,0.05yRange)` 判断，连续多值 bucket 和近竖直跨度进入参数模式。** Pointer 捕获调用 `setPointerCapture`、`getCoalescedEvents`，`pointercancel` 以现有有效点结束；绘制时保存 world point，绘制过程锁定视口。

```ts
export type StrokeMode='function'|'parametric';
export function classifyStroke(points:readonly Point[],bucketCount=128):StrokeMode;
```

- [ ] **Step 4: 运行上述测试与 `npm run build`；dev 页面手绘，画布应实时显示完整有序笔迹。**
- [ ] **Step 5: 提交本任务文件：** `git add src/core src/math/statistics.ts src/ui/stroke.ts src/ui/app.ts src/ui/canvas.ts tests/unit/stroke.test.ts tests/unit/validateFunction.test.ts tests/unit/statistics.test.ts && git commit -m "feat: capture and classify world-coordinate strokes"`。

### Task 4: 均匀采样、平滑、正式噪声和归一化

**Files:** Create `src/core/resample.ts`, `src/core/smooth.ts`, `src/core/normalize.ts`, `tests/unit/preprocess.test.ts`; Modify `src/math/statistics.ts`, `src/core/preprocess.ts`, `src/core/noise.ts`, `src/core/types.ts`.

**Interfaces:** `resampleFunction(points,count=256): SampledCurve`; `resampleParametric(points,count=256): SampledParametric`; `smoothSeries(y): Float64Array`; `normalizeCurve(curve): CurveData`; `preprocess(points): {mode:'function',data:CurveData}|{mode:'parametric',data:ParametricData}`，输入非法时抛 `InvalidCurveError`。

- [ ] **Step 1: 用非均匀采样、孤立跳点、间隙和水平线测试。**

```ts
const p=Array.from({length:90},(_,i)=>({x:2*(i/89)**2-1,y:3,t:i}));
const r=preprocess(p);
expect(r.mode).toBe('function');
if(r.mode==='function') {
  expect(r.data.x).toHaveLength(256);
  expect(r.data.rawY.every(Number.isFinite)).toBe(true);
  expect(r.data.normalization.ys).toBeGreaterThan(0);
  expect(Math.max(...r.data.rawY)-Math.min(...r.data.rawY)).toBeLessThan(1e-9);
}
```

- [ ] **Step 2: 运行 `npm test -- tests/unit/preprocess.test.ts`，预期失败。**
- [ ] **Step 3: 实现 percentile/median/MAD；小缺口至多 3 buckets 插值，大缺口选最长连续域；256 点均匀 x 或弧长 t；median radius 2 与局部 Savitzky–Golay 11/3；raw 残差 MAD 得 `sigmaDraw`；`xs`, `ys` 按规格第 9 节计算并设置有限下限。** `ParametricData` 保存独立 x/y 噪声和闭合标记。`CurveData.features` 在 Task 13 前可选，Task 13 后每条预处理结果均填充它。

```ts
const ys=Math.max((percentile(rawY,.95)-percentile(rawY,.05))/2,1e-9);
const noise=Math.max(1.4826*mad(rawY.map((v,i)=>v-smoothY[i])),1e-9);
```

- [ ] **Step 4: 运行测试、`npm run build`，确认保留 raw/smooth 双数组与覆盖权重。**
- [ ] **Step 5: 提交：** `git add src/math/statistics.ts src/core tests/unit/preprocess.test.ts && git commit -m "feat: preprocess drawn and parametric curves"`。

### Task 5: Householder QR 与加权最小二乘

**Files:** Create `src/math/vector.ts`, `src/math/matrix.ts`, `src/math/qr.ts`, `src/math/leastSquares.ts`, `tests/unit/leastSquares.test.ts`.

**Interfaces:** `leastSquares(a: Float64Array, rows:number, cols:number, b:Float64Array, weights?:Float64Array): {coefficients:Float64Array;rank:number;residualNorm:number}`；矩阵 row-major。

- [ ] **Step 1: 写病态尺度、秩亏和加权解的断言。**

```ts
const a=Float64Array.from([1,-1,1,0,1,1]);
const b=Float64Array.from([-1,1,3]);
const fit=leastSquares(a,3,2,b);
expect([...fit.coefficients]).toEqual([1,2]);
expect(fit.rank).toBe(2);
const rankDef=leastSquares(Float64Array.from([1,1,2,2]),2,2,Float64Array.from([2,4]));
expect(rankDef.rank).toBe(1);
```

- [ ] **Step 2: 运行 `npm test -- tests/unit/leastSquares.test.ts`，预期失败。**
- [ ] **Step 3: 实现列缩放、Householder QR、秩阈值、back substitution；权重通过每行乘 `sqrt(w)` 实现，权重负数或非有限抛 RangeError。** 秩亏时零化不确定列，并返回有限近似系数；禁止构造 normal equations。

```ts
const tolerance=Number.EPSILON*Math.max(rows,cols)*Math.abs(r[0]??0);
```

- [ ] **Step 4: 运行测试与 `npm run build`，再用 `1e-8,1e8` 列尺度 fixture 验证解有限。**
- [ ] **Step 5: 提交：** `git add src/math/vector.ts src/math/matrix.ts src/math/qr.ts src/math/leastSquares.ts tests/unit/leastSquares.test.ts && git commit -m "feat: add stable least-squares core"`。

### Task 6: 表达式 AST、安全求值及公式文本

**Files:** Create `src/expr/ast.ts`, `src/expr/evaluate.ts`, `src/expr/serialize.ts`, `src/expr/plain.ts`, `src/expr/latex.ts`, `tests/unit/expr.test.ts`; Modify `src/core/types.ts`.

**Interfaces:** `evaluate(expr:Expr, input:number): {value:number;valid:boolean}`；`toPlain(expr)`、`toLatex(expr)`；`serializeExpr` / `deserializeExpr`；公共 AST/Constant 类型严格采用规格第 6.2 节。

- [ ] **Step 1: 写数值、安全域、优先级及 round-trip 测试。**

```ts
const x={kind:'var',name:'x'} as const;
const expr={kind:'sin',arg:{kind:'mul',args:[{kind:'const',value:{kind:'piMultiple',p:1,q:1}},x]}} as const;
expect(evaluate(expr,0.5)).toEqual({value:1,valid:true});
expect(toLatex(expr)).toContain('\\pi');
expect(deserializeExpr(serializeExpr(expr))).toEqual(expr);
expect(evaluate({kind:'log',arg:{kind:'const',value:{kind:'integer',value:-1}}},0).valid).toBe(false);
```

- [ ] **Step 2: 运行 `npm test -- tests/unit/expr.test.ts`，预期失败。**
- [ ] **Step 3: 实现变量 x/t、全部 12 种节点、Constant 六类及 visitor 输出。** 除数低于 `1e-10`、无效 log/sqrt、非整数指数的负底数、绝对中间值超过 `1e100` 返回 invalid；exp argument 限到 `[-30,30]`；输出自动加括号。序列化严格检查 kind 和有限数字，拒绝未知 JSON。

```ts
if(expr.kind==='div') {
  const d=evaluate(expr.b,input);
  if(!d.valid||Math.abs(d.value)<1e-10)return {value:NaN,valid:false};
}
```

- [ ] **Step 4: 运行表达式测试、`npm run build`，增加 eMultiple 和 sqrtMultiple 对正负系数的快照。**
- [ ] **Step 5: 提交：** `git add src/expr src/core/types.ts tests/unit/expr.test.ts && git commit -m "feat: define safe expression AST and renderers"`。

### Task 7: Canonicalization、代换和代数化简

**Files:** Create `src/expr/canonical.ts`, `src/expr/simplify.ts`, `src/expr/substitute.ts`, `src/expr/polynomial.ts`, `src/expr/complexity.ts`, `tests/unit/simplify.test.ts`.

**Interfaces:** `canonicalize(expr:Expr):Expr`; `simplify(expr:Expr, domain?:[number,number]):Expr`; `substituteVariable(expr,name:VariableName,replacement:Expr):Expr`; `structuralHash(expr):string`; `operatorComplexity(expr):number`。

- [ ] **Step 1: 写交换次序、幂次、负号与 domain 保留测试。**

```ts
expect(structuralHash(canonicalize(add(x,one)))).toBe(structuralHash(canonicalize(add(one,x))));
expect(simplify(mul(x,x))).toEqual(pow(x,int(2)));
expect(evaluate(simplify(sqrt(pow(x,int(2)))),-3).value).toBe(3);
expect(simplify(exp(log(x)))).toEqual(exp(log(x)));
```

其中 `add`, `mul`, `pow`, `int` 为测试文件本地构造 `Expr` 的 helper。

- [ ] **Step 2: 运行 `npm test -- tests/unit/simplify.test.ts`，预期失败。**
- [ ] **Step 3: flatten+排序 Add/Mul，归并常数、重复因子、同次幂与多项式系数；仅在 domain 已证明时执行有条件恒等式；substitute 在反归一化时只代换指定变量；structural hash 使用稳定序列化。**

```ts
// canonicalize(add([a,b])) 与 canonicalize(add([b,a])) 应产生相同序列化。
const args=flattenedArgs.map(canonicalize).sort((a,b)=>structuralHash(a).localeCompare(structuralHash(b)));
```

- [ ] **Step 4: 运行测试、`npm run build`；额外用确定性随机 AST 检查 canonicalize 幂等和合法域上 simplify 数值不变。**
- [ ] **Step 5: 提交：** `git add src/expr tests/unit/simplify.test.ts && git commit -m "feat: canonicalize and simplify expression trees"`。

### Task 8: CandidatePool、评分、Pareto 和三候选选择

**Files:** Create `src/search/producer.ts`, `src/search/candidatePool.ts`, `src/search/scoring.ts`, `src/search/pareto.ts`, `tests/unit/ranking.test.ts`; Modify `src/core/types.ts`, `src/core/options.ts`.

**Interfaces:** `CandidateDraft={expr:Expr;params:number[];modelFamily:string;freeParameterCount:number;approximation:boolean}`；`CandidatePool(data:CurveData,capacity=300).add(draft): boolean`；`.frontier(): Candidate[]`；`selectRepresentatives(frontier,noise): {simple:Candidate;balanced:Candidate;accurate:Candidate}`；`CandidateProducer.produce(data,context): Iterable<CandidateDraft>|AsyncIterable<CandidateDraft>`。

- [ ] **Step 1: 写噪声地板、Pareto 支配、候选去重及按钮选择测试。**

```ts
const frontier=paretoPrune([
  candidate({rmse:.02,complexity:2,score:10}),
  candidate({rmse:.01,complexity:5,score:12}),
  candidate({rmse:.03,complexity:8,score:14}),
]);
expect(frontier).toHaveLength(2);
const choice=selectRepresentatives(frontier,.015);
expect(choice.simple.metrics.rmse).toBe(.02);
expect(choice.accurate.metrics.rmse).toBe(.01);
expect(scoreMdl({mseNormalized:.0001,sigmaNormalized:.01,n:256,k:3}))
  .toBe(scoreMdl({mseNormalized:.00001,sigmaNormalized:.01,n:256,k:3}));
```

测试 `candidate()` 是本文件的类型完整 fixture 构造器。

- [ ] **Step 2: 运行 `npm test -- tests/unit/ranking.test.ts`，预期失败。**
- [ ] **Step 3: 实现标准化误差 `mseEff=max(mseN,sigmaN²,1e-16)`、常数复杂度表、`N ln(mseEff)+K ln N`；候选从最终 world AST 重评 256 raw 点，非法比例 >2% 拒绝；基于 structural/semantic hash 合并；Pareto 用 `1e-9` 容差，前沿上限 24，pool 最多 300；Simple 阈值 `2.5 max(sigma,minRMSE)`。** 候选错误仅使 `.add` 返回 false 并增加拒绝计数。

```ts
export function scoreMdl(v:{mseNormalized:number;sigmaNormalized:number;n:number;k:number}):number {
  return v.n*Math.log(Math.max(v.mseNormalized,v.sigmaNormalized**2,1e-16))+v.k*Math.log(v.n);
}
```

- [ ] **Step 4: 运行排名测试、`npm run build`，检查候选数上限与 Pareto 内无互相支配项。**
- [ ] **Step 5: 提交：** `git add src/search src/core/types.ts src/core/options.ts tests/unit/ranking.test.ts && git commit -m "feat: rank candidates with noise-aware Pareto scoring"`。

### Task 9: Chebyshev 多项式与同步完整闭环

**Files:** Create `src/models/shared.ts`, `src/models/polynomial.ts`, `src/search/modelBank.ts`, `src/core/quality.ts`, `src/core/solver.ts`, `tests/fixtures/generateStroke.ts`, `tests/integration/polynomialSolver.test.ts`; Modify `src/core/types.ts`, `src/expr/polynomial.ts`, `src/search/candidatePool.ts`.

**Interfaces:** `fitPolynomial(data:CurveData,degree:number):CandidateDraft|null`；`solveCurve(points:readonly Point[],options?:Partial<SolverOptions>):SolveResult`；`makeCandidateResult(candidate,data):CandidateResult`；`makeStroke(f,{min,max,noise,seed}):Point[]`，初版固定种子 Gaussian 噪声生成器，Task 24 扩展其他扰动；`CandidateResult.plot` 从最终 world AST 采样。`solveCurve` 的 invalid input 抛 `InvalidCurveError`。

- [ ] **Step 1: 写带笔迹扰动的线、二次、水平线与纯文本/绘图一致性测试。**

```ts
const points=Array.from({length:140},(_,i)=>{
  const x=-2+4*i/139;
  return {x,y:2*x+1+0.002*Math.sin(i*7),t:i};
});
const result=solveCurve(points,{maxStructuralComplexity:0});
expect(result.mode).toBe('function');
if(result.mode==='function') {
  expect(result.best.rmse).toBeLessThan(.02);
  expect(result.pareto.length).toBeGreaterThan(0);
  for(let i=0;i<result.best.plot.x.length;i++) {
    expect(result.best.plot.y[i]).toBeCloseTo(evaluate(result.best.expr,result.best.plot.x[i]).value,9);
  }
}
```

- [ ] **Step 2: 运行 `npm test -- tests/integration/polynomialSolver.test.ts`，预期失败。**
- [ ] **Step 3: 用 Chebyshev recurrence 构造 degree 0..8 的列矩阵并调用 QR；将系数递推转成幂基，再把 `u=(x-xc)/xs`、`y=yc+ysv` 代入 AST，做 simplification；`solveCurve` 预处理→poly drafts→CandidatePool→Pareto→Simple/Balanced/Accurate→质量标签与 256 点 plot。** 先建常数候选，水平线时 `ys>0` 且所有指标有限。阶段诊断包含 generated/fitted/rejected 和停止原因。`makeStroke` 使用整数 PRNG 加 Box–Muller，可复用到所有后续 synthetic 任务。

```ts
for(let d=0;d<=8;d++) {
  const draft=fitPolynomial(data,d);
  if(draft) pool.add(draft);
}
return finalizeFunctionResult(pool,data,diagnostics);
```

- [ ] **Step 4: 运行集成测试、既有 unit、`npm run build`；页面继续可画线，求解核心可通过同步 API 验证；Task 10 接入 Worker 后页面展示公式。**
- [ ] **Step 5: 提交：** `git add src/models/shared.ts src/models/polynomial.ts src/search/modelBank.ts src/core/quality.ts src/core/solver.ts src/core/types.ts src/expr/polynomial.ts src/search/candidatePool.ts tests/fixtures/generateStroke.ts tests/integration/polynomialSolver.test.ts && git commit -m "feat: solve drawn curves with Chebyshev polynomials"`。

### Task 10: Worker、渐进编排与首个可交互结果

**Files:** Create `src/core/progressive.ts`, `src/worker/protocol.ts`, `src/worker/solver.worker.ts`, `src/worker/client.ts`, `src/ui/plot.ts`, `src/ui/formulaPanel.ts`, `tsconfig.worker.json`, `tests/integration/progressive.test.ts`, `tests/unit/workerClient.test.ts`; Modify `src/core/solver.ts`, `src/ui/app.ts`, `src/main.ts`, `src/ui/styles.css`, `package.json`.

**Interfaces:** `solveCurveProgressive(points,options,hooks):Promise<SolveResult>`；`SolveHooks={now;shouldAbort;emit;yieldControl}`；`WorkerClient.solve(points,view,options,onMessage):number`；`WorkerClient.cancel(id):void`；`drawFittedPlot(ctx,result)`；`renderFormula(root,result,kind)`。

- [ ] **Step 1: 写 progress 顺序、取消、新 request 覆盖旧 request 测试。**

```ts
const stages:string[]=[];
const result=await solveCurveProgressive(lineStroke(),{}, {
  now:()=>0,shouldAbort:()=>false,yieldControl:async()=>{},
  emit:p=>stages.push(p.stage),
});
expect(stages).toContain('fast-models');
expect(stages.at(-1)).toBe('finalize');
expect(result.mode).toBe('function');
const fake=fakeWorker();
const client=new WorkerClient(() => fake);
client.solve(firstStroke,view,defaults,render);
const second=client.solve(secondStroke,view,defaults,render);
fake.deliver({type:'progress',id:second-1,stage:'fast-models'});
expect(render).not.toHaveBeenCalledWith(expect.objectContaining({id:second-1}));
```

测试 Worker fake 使用同一实例，检查 cancel、100 ms watchdog 和重建；`lineStroke` 为测试 helper。

- [ ] **Step 2: 运行 `npm test -- tests/integration/progressive.test.ts tests/unit/workerClient.test.ts`，预期失败。**
- [ ] **Step 3: 将 `solveCurve` 与 progressive 复用同一阶段 runner；快速池首次有完整前沿就 post progress；异步每 ~8 ms 或 32 drafts `await yieldControl()`；Worker 接受 solve/cancel，用 request ID 丢弃旧消息；客户端在二次输入时取消旧任务，100 ms 未确认则终止重建。** 在 UI `pointerup` 后传 world stroke，绘制 AST plot，以 KaTeX 渲染公式（`throwOnError:false,trust:false`），导入 `katex/dist/katex.min.css` 本地字体，为三类按钮显示基本候选。主线程 tsconfig 排除 `solver.worker.ts`，Worker 使用 `tsconfig.worker.json` 的 WebWorker/ES2022 libs，`typecheck`/`build` 脚本同时检查两个工程。

```ts
const worker=new Worker(new URL('./solver.worker.ts',import.meta.url),{type:'module'});
worker.onmessage=e=>{if(e.data.id!==this.activeId)return;this.onMessage(e.data);};
```

- [ ] **Step 4: 运行测试、`npm run build`，在浏览器画二次曲线并检查松手后公式和拟合曲线出现、拖动仍流畅。**
- [ ] **Step 5: 提交：** `git add src/core/progressive.ts src/core/solver.ts src/worker src/ui src/main.ts tsconfig.worker.json tsconfig.json package.json tests/integration/progressive.test.ts tests/unit/workerClient.test.ts && git commit -m "feat: solve progressively in a cancellable worker"`。

### Task 11: Brent、IRLS 与 Levenberg–Marquardt

**Files:** Create `src/math/brent.ts`, `src/math/linearSolve.ts`, `src/math/robust.ts`, `src/math/lm.ts`, `tests/unit/optimization.test.ts`.

**Interfaces:** `minimizeBounded(f,lo,hi,tol):{x:number;fx:number}`；`huberWeights(residuals,delta):Float64Array`；`fitLm(model,observed,initial,options): {params:Float64Array;loss:number;iterations:number;converged:boolean}`；`LmModel(theta,x):number`。

- [ ] **Step 1: 写有界峰值、Huber 离群点和非线性拟合测试。**

```ts
expect(minimizeBounded(x=>(x-1.25)**2,-3,3,1e-8).x).toBeCloseTo(1.25,6);
expect([...huberWeights(Float64Array.from([0,.2,20]),1)][2]).toBeLessThan(.1);
const fitted=fitLm((theta,x)=>theta[0]*Math.exp(theta[1]*x),
  Float64Array.from([1,Math.E,Math.E**2]),Float64Array.from([.8,.8]),{x:[0,1,2],delta:.1,maxIterations:60});
expect(fitted.params[0]).toBeCloseTo(1,2);
expect(fitted.params[1]).toBeCloseTo(1,2);
const withOutlier=fitLm((theta,x)=>theta[0]*x,
  Float64Array.from([0,1,2,30]),Float64Array.from([.5]),
  {x:[0,1,2,3],delta:1,maxIterations:60});
expect(withOutlier.params[0]).toBeLessThan(3);
```

- [ ] **Step 2: 运行 `npm test -- tests/unit/optimization.test.ts`，预期失败。**
- [ ] **Step 3: 实现粗 bracket 可调用的 Brent；LM central difference `h=1e-5 max(1,|θ|)`，使用 QR 解阻尼增广 least squares 并以 IRLS 权重更新，每轮根据 actual/predicted reduction 调 damping；非法预测拒绝 step；限制 8 参数、60 轮、连续 6 次拒绝停止。** 线性求解只用于小型三角系统与曲率估计，不构造法方程逆矩阵。

```ts
const h=1e-5*Math.max(1,Math.abs(theta[j]));
const jacobian=(model(plus,x)-model(minus,x))/(2*h);
```

- [ ] **Step 4: 运行优化测试、`npm run build`，确认初值超界或全部无效模型给出有限失败结果且不使 Worker 崩溃。**
- [ ] **Step 5: 提交：** `git add src/math/brent.ts src/math/linearSolve.ts src/math/robust.ts src/math/lm.ts tests/unit/optimization.test.ts && git commit -m "feat: add robust one-dimensional and nonlinear fitting"`。

### Task 12: FFT、单频正弦与 Fourier

**Files:** Create `src/math/fft.ts`, `src/models/sinusoid.ts`, `src/models/fourier.ts`, `tests/unit/fft.test.ts`, `tests/synthetic/periodic.test.ts`; Modify `src/search/modelBank.ts`.

**Interfaces:** `spectralPeaks(series,sampleSpacing,limit=5):number[]`；`fitSinusoid(data,withTrend):CandidateDraft[]`；`fitFourier(data,k:number):CandidateDraft[]`，`k=2..5`。

- [ ] **Step 1: 写 256 点频谱峰和带噪 `2sin(πx)` 恢复测试。**

```ts
const x=Array.from({length:256},(_,i)=>-2+4*i/255);
const data=x.map((v,i)=>({x:v,y:2*Math.sin(Math.PI*v)+.006*Math.sin(i*11),t:i}));
const result=solveCurve(data);
expect(result.mode).toBe('function');
if(result.mode==='function') {
  expect(result.balanced.rmse).toBeLessThan(.025);
  expect(result.balanced.complexity).toBeLessThan(12);
}
```

- [ ] **Step 2: 运行 `npm test -- tests/unit/fft.test.ts tests/synthetic/periodic.test.ts`，预期失败。**
- [ ] **Step 3: 实现 radix-2 FFT、去趋势、Hann 窗、抛物线谱峰插值；峰频率与 1/2、1/3 候选进入粗网格+Brent；固定频率时 QR 解 sin/cos、偏移、可选趋势；合并为 `A sin(ωx+φ)`；Fourier k=2..5 使用同一基频优化。** 对固定 ω 的线性参数先使用 unweighted QR，再在最终 raw points 上做 Huber 权重二次拟合。

```ts
const column=(k:number,u:number)=>[Math.sin(k*omega*u),Math.cos(k*omega*u)];
const phase=Math.atan2(cosCoefficient,sinCoefficient);
```

- [ ] **Step 4: 运行周期测试、已有测试、`npm run build`；测试 sin 带线性趋势、三角谐波和直线对 FFT 假峰的抑制。**
- [ ] **Step 5: 提交：** `git add src/math/fft.ts src/models/sinusoid.ts src/models/fourier.ts src/search/modelBank.ts tests/unit/fft.test.ts tests/synthetic/periodic.test.ts && git commit -m "feat: recover sinusoids and Fourier series"`。

### Task 13: 特征分析只影响顺序与初值

**Files:** Create `src/core/features.ts`, `tests/unit/features.test.ts`; Modify `src/core/types.ts`, `src/core/preprocess.ts`, `src/search/modelBank.ts`.

**Interfaces:** `extractFeatures(data:CurveData):CurveFeatures`，含 extrema、zeroCrossings、monotonicity、evenError、oddError、cusp、periodicity、spectralPeaks、curvaturePeaks；`prioritizeModels(features): string[]`。

- [ ] **Step 1: 写线、V 形、周期及特征不会剔除 model family 的测试。**

```ts
expect(extractFeatures(makeCurve(x=>Math.abs(x-1))).cusp).toBeGreaterThan(.5);
expect(prioritizeModels(extractFeatures(makeCurve(Math.sin)))[0]).toMatch(/sin|fourier/);
const order=prioritizeModels(extractFeatures(makeCurve(x=>x*x)));
expect(order).toContain('exponential');
```

- [ ] **Step 2: 运行 `npm test -- tests/unit/features.test.ts`，预期失败。**
- [ ] **Step 3: 基于 smooth 数据 central difference、峰显著度、自相关和 FFT 计算特征；映射为稳定、确定性排序与初值建议；保留所有 fast model family 的最小执行预算。** 大幅改变曲线形状的 smoothing 只用于 features，真实评分仍用 rawY。

```ts
const derivative=(y[i+1]-y[i-1])/(x[i+1]-x[i-1]);
const prioritized=[...allFamilies].sort((a,b)=>priority[b]-priority[a]||a.localeCompare(b));
```

- [ ] **Step 4: 运行测试、`npm run build`；比较有特征排序与无特征排序时同一组候选的最终分数保持一致。**
- [ ] **Step 5: 提交：** `git add src/core/features.ts src/core/types.ts src/core/preprocess.ts src/search/modelBank.ts tests/unit/features.test.ts && git commit -m "feat: prioritize fitting with curve features"`。

### Task 14: 指数、对数、绝对值与 hinge

**Files:** Create `src/models/exponential.ts`, `src/models/logarithm.ts`, `src/models/absolute.ts`, `tests/synthetic/basicFamilies.test.ts`; Modify `src/search/modelBank.ts`.

**Interfaces:** `fitExponential(data):CandidateDraft[]`；`fitLogarithm(data):CandidateDraft[]`；`fitAbsolute(data,withTrend):CandidateDraft[]`。

- [ ] **Step 1: 写四组可重复合成笔迹恢复断言。**

```ts
for(const [f,family] of [
  [(x:number)=>Math.exp(.7*x),'exponential'],
  [(x:number)=>Math.log(x+2),'logarithm'],
  [(x:number)=>Math.abs(x-1),'absolute'],
] as const) {
  const r=solveCurve(makeStroke(f,{min:-1,max:1,noise:.006,seed:42}));
  expect(r.mode).toBe('function');
  if(r.mode==='function')expect(r.pareto.some(c=>c.modelFamily===family&&c.rmse<.04)).toBe(true);
}
```

- [ ] **Step 2: 运行 `npm test -- tests/synthetic/basicFamilies.test.ts`，预期失败。**
- [ ] **Step 3: exp 搜索 `b∈[-10,10]`，固定 b 后 QR 解 a、c；log 两侧 shift 用正 gap 限制整个 domain 合法；abs breakpoint 由曲率峰+网格设初值，固定 b 后 QR 解 `|u-b|`、`u`、常数，再 Brent 精化。** 生成 AST 后反归一化，完整 domain 再次验证。

```ts
const gap=Math.max(1e-4,Math.exp(theta));
const shiftLeft=data.uMin-gap;
const shiftRight=data.uMax+gap;
```

- [ ] **Step 4: 运行 family 测试、全部现有测试和 build；log 左右两侧及 V 形趋势项均有 fixture。**
- [ ] **Step 5: 提交：** `git add src/models/exponential.ts src/models/logarithm.ts src/models/absolute.ts src/search/modelBank.ts tests/synthetic/basicFamilies.test.ts && git commit -m "feat: fit exponential logarithmic and absolute curves"`。

### Task 15: 有理式与极点拒绝

**Files:** Create `src/models/rational.ts`, `tests/synthetic/rational.test.ts`; Modify `src/search/modelBank.ts`.

**Interfaces:** `fitRational(data:CurveData,m:number,n:number):CandidateDraft|null`，`m<=3,n<=2`；`hasDomainPole(denominator,domain):boolean`。

- [ ] **Step 1: 写 `1/(x+2)` 及假极点拒绝测试。**

```ts
const valid=solveCurve(makeStroke(x=>1/(x+2),{min:-1,max:1,noise:.003,seed:11}));
expect(valid.mode).toBe('function');
if(valid.mode==='function')expect(valid.pareto.some(c=>c.modelFamily==='rational'&&c.rmse<.03)).toBe(true);
expect(hasDomainPole([1,-2],[-1,1])).toBe(true);
expect(hasDomainPole([1,.1],[-1,1])).toBe(false);
```

- [ ] **Step 2: 运行 `npm test -- tests/synthetic/rational.test.ts`，预期失败。**
- [ ] **Step 3: 对每个 `(m,n)` 构造 `yQ=P` 的线性化 QR 初值；固定 `Q(0)=1`；LM 优化真实 residual；在 512 个 domain 检查点上检测 `min|Q|<1e-5` 或符号变换，疑似极点直接丢弃；每个 draft 的数值异常只增加 rejected 计数。**

```ts
for(let m=0;m<=3;m++)for(let n=1;n<=2;n++) {
  const candidate=fitRational(data,m,n);
  if(candidate)yield candidate;
}
```

- [ ] **Step 4: 运行 rational 测试、全部测试与 build；构造跳点误导的平滑曲线，确认仍显示 polynomial fallback。**
- [ ] **Step 5: 提交：** `git add src/models/rational.ts src/search/modelBank.ts tests/synthetic/rational.test.ts && git commit -m "feat: fit safe low-order rational expressions"`。

### Task 16: Gaussian、tanh、Logistic 和阻尼正弦

**Files:** Create `src/models/gaussian.ts`, `src/models/tanh.ts`, `src/models/logistic.ts`, `src/models/dampedSinusoid.ts`, `tests/synthetic/nonlinearFamilies.test.ts`; Modify `src/search/modelBank.ts`.

**Interfaces:** `fitGaussian`, `fitTanh`, `fitLogistic`, `fitDampedSinusoid` 均签名 `(data:CurveData):CandidateDraft[]`；LM 的参数数不超过 8，multi-start 4–8 次。

- [ ] **Step 1: 写四个 family 的代表性样本。**

```ts
const cases=[
  {family:'gaussian',f:(x:number)=>Math.exp(-x*x)},
  {family:'tanh',f:(x:number)=>Math.tanh(2*x-.3)},
  {family:'logistic',f:(x:number)=>2/(1+Math.exp(-3*(x-.2)))-.4},
  {family:'damped-sinusoid',f:(x:number)=>Math.exp(-.2*x)*Math.sin(4*x)},
];
for(const item of cases) {
  const r=solveCurve(makeStroke(item.f,{min:-1,max:2,noise:.005,seed:19}));
  expect(r.mode).toBe('function');
  if(r.mode==='function')expect(r.pareto.some(c=>c.modelFamily===item.family&&c.rmse<.05)).toBe(true);
}
```

- [ ] **Step 2: 运行 `npm test -- tests/synthetic/nonlinearFamilies.test.ts`，预期失败。**
- [ ] **Step 3: Gaussian 从显著峰和半高宽初始化，宽度为 `exp(gamma)`；tanh/Logistic 从上下分位平台、最大斜率点初始化；阻尼正弦从 FFT 频率与局部峰包络初始化。** 使用 deterministic multi-start 和统一 Huber LM；tanh 用 `(exp(2z)-1)/(exp(2z)+1)`、Logistic 用 `1/(1+exp(-z))` 组装现有 AST，绝不引入仅展示可用的私有函数节点；形态退化时返回 null，不发送无效表达式。

```ts
const width=Math.exp(theta[2]);
const gaussian=theta[0]*Math.exp(-((x-theta[1])/width)**2)+theta[3];
```

- [ ] **Step 4: 运行 nonlinear 测试、全部既有测试和 build；对反向峰与下降 S 形增加断言。**
- [ ] **Step 5: 提交：** `git add src/models/gaussian.ts src/models/tanh.ts src/models/logistic.ts src/models/dampedSinusoid.ts src/search/modelBank.ts tests/synthetic/nonlinearFamilies.test.ts && git commit -m "feat: fit common nonlinear families"`。

### Task 17: 有理数、π 等漂亮常数的联合选择

**Files:** Create `src/beautify/rational.ts`, `src/beautify/constants.ts`, `src/beautify/beautify.ts`, `tests/unit/beautify.test.ts`, `tests/synthetic/prettySinusoid.test.ts`; Modify `src/core/solver.ts`, `src/core/progressive.ts`, `src/expr/simplify.ts`.

**Interfaces:** `prettyAlternatives(value:number):Constant[]`；`beautifyCandidate(candidate,data,width=32):Candidate[]`；`normalizeTrig(expr:Expr):Expr`。

- [ ] **Step 1: 写数值吸附和模型选择的完整断言。**

```ts
expect(prettyAlternatives(3.1412)).toContainEqual({kind:'piMultiple',p:1,q:1});
expect(prettyAlternatives(.6668)).toContainEqual({kind:'rational',p:2,q:3});
const r=solveCurve(makeStroke(x=>2*Math.sin(Math.PI*x),{min:-1,max:1,noise:.012,seed:7}));
expect(r.mode).toBe('function');
if(r.mode==='function') {
  expect(r.balanced.latex).toContain('\\pi');
  expect(r.balanced.complexity).toBeLessThan(r.accurate.complexity+5);
}
```

- [ ] **Step 2: 运行 `npm test -- tests/unit/beautify.test.ts tests/synthetic/prettySinusoid.test.ts`，预期失败。**
- [ ] **Step 3: 连分数生成 `q<=12, |p|<=48`，加整数、π/e/√n 倍数，按相对差和常数编码代价筛 top 4；每常数保留 original+4，宽 32 的组合 beam 每次替换后重算 raw curve RMSE 与 MDL；已吸附常数固定，其余线性参数可再次 QR；规范化三角相位与幅度。** 只向 frontier 邻域候选运行漂亮化，并将变体回送 CandidatePool 正常竞争。

```ts
for(const replacement of prettyAlternatives(original).slice(0,4)) {
  const snapped=replaceAtPath(expr,path,replacement);
  const evaluated=evaluateDraft(snapped,data);
  if(evaluated)nextBeam.push(evaluated);
}
```

- [ ] **Step 4: 运行 pretty tests、全部测试和 build；检查大噪声下错误 π 吸附被重评拒绝，plot 与表达式求值一致。**
- [ ] **Step 5: 提交：** `git add src/beautify src/core/solver.ts src/core/progressive.ts src/expr/simplify.ts tests/unit/beautify.test.ts tests/synthetic/prettySinusoid.test.ts && git commit -m "feat: rank globally validated beautiful constants"`。

### Task 18: Chebyshev 与 Fourier 通用兜底

**Files:** Create `src/search/fallback.ts`, `tests/synthetic/fallback.test.ts`; Modify `src/core/solver.ts`, `src/core/progressive.ts`, `src/core/quality.ts`, `src/search/modelBank.ts`.

**Interfaces:** `produceFallback(data:CurveData):CandidateDraft[]`；高阶 fallback `approximation=true`；`classifyQuality(candidate,noise,secondBest?):MatchQuality`。

- [ ] **Step 1: 写 `sin(x²)`、随机 Chebyshev、突变缺口与常数 fallback 测试。**

```ts
const r=solveCurve(makeStroke(x=>Math.sin(x*x),{min:-2,max:2,noise:.01,seed:9}));
expect(r.mode).toBe('function');
if(r.mode==='function') {
  expect(Number.isFinite(r.best.rmse)).toBe(true);
  expect(r.best.plot.y.every(Number.isFinite)).toBe(true);
  expect(r.best.rmse).toBeLessThan(.25);
}
```

- [ ] **Step 2: 运行 `npm test -- tests/synthetic/fallback.test.ts`，预期失败。**
- [ ] **Step 3: 先入常数 fallback；Chebyshev degree 4、6、8、10、12、16 共用 Task 9 的 QR；periodic feature 强时再拟合最多 8 harmonics；所有候选仍经噪声地板、domain 检查和 MDL。** 高阶 fallback 的 `quality` 最多 approximation。空输入仍按 Task 4 的 InvalidCurveError 流程处理。

```ts
for(const degree of [4,6,8,10,12,16]) {
  const c=fitPolynomial(data,degree);
  if(c)yield {...c,modelFamily:'chebyshev-fallback',approximation:true};
}
```

- [ ] **Step 4: 运行 fallback 测试、全部测试与 build；确认 `CandidatePool` 不可能因为一个模型异常被清空。**
- [ ] **Step 5: 提交：** `git add src/search/fallback.ts src/core/solver.ts src/core/progressive.ts src/core/quality.ts src/search/modelBank.ts tests/synthetic/fallback.test.ts && git commit -m "feat: guarantee stable curve approximations"`。

### Task 19: 带自由参数的 grammar 与模板拟合

**Files:** Create `src/expr/template.ts`, `src/search/grammar.ts`, `tests/unit/grammar.test.ts`; Modify `src/expr/canonical.ts`, `src/expr/complexity.ts`.

**Interfaces:** `TemplateExpr` 在 Expr union 外加 `{kind:'param',id:number}`；`enumerateGrammar(level,byLevel):TemplateExpr[]`；`parameterizeShape(shape):TemplateExpr`；`fitTemplate(template,data,starts):CandidateDraft|null`；`templateHash(template):string`；`countParams(template):number`。

- [ ] **Step 1: 写 sin(x) outer/inner affine、交换归并与禁止冗余模板的测试。**

```ts
const templates=enumerateGrammar(2,new Map([[0,[{kind:'var',name:'x'}]]]));
expect(templates.some(t=>templateHash(t).includes('sin'))).toBe(true);
const t=parameterizeShape({kind:'sin',arg:{kind:'var',name:'x'}});
expect(countParams(t)).toBeLessThanOrEqual(4);
expect(templateHash(makeAdd(t,x))).toBe(templateHash(makeAdd(x,t)));
```

- [ ] **Step 2: 运行 `npm test -- tests/unit/grammar.test.ts`，预期失败。**
- [ ] **Step 3: 实现设计第 15 节 grammar：x、+、×、/、固定整数幂、sin/cos/exp/log|E|/abs/sqrt|E|；按复杂度逐层构造，生成时 flatten/排序并阻止 `abs(abs(E))`、`exp(log(E))` 等直接逆操作；外层 affine、sin 输入 affine 与二元线性组合稳定分配参数 ID。** 自由参数最多 8；能 QR 消元的线性参数直接 QR，剩余参数经 LM multi-start；最终 materialize 为普通 `Expr`。

```ts
function parameterizeShape(shape:TemplateExpr):TemplateExpr {
  const param=(id:number):TemplateExpr=>({kind:'param',id});
  const inner=shape.kind==='sin'||shape.kind==='cos'
    ? {...shape,arg:{kind:'add',args:[{kind:'mul',args:[param(2),shape.arg]},param(3)]}}
    : shape;
  return {kind:'add',args:[{kind:'mul',args:[param(0),inner]},param(1)]};
}
```

- [ ] **Step 4: 运行 grammar 测试和 build；验证 `sin(x²)` 模板在指定复杂度内且不会生成无界参数。**
- [ ] **Step 5: 提交：** `git add src/expr/template.ts src/search/grammar.ts src/expr/canonical.ts src/expr/complexity.ts tests/unit/grammar.test.ts && git commit -m "feat: generate bounded symbolic templates"`。

### Task 20: 语义哈希、beam 搜索和停止策略

**Files:** Create `src/search/semanticHash.ts`, `src/search/symbolic.ts`, `tests/unit/semanticHash.test.ts`, `tests/integration/symbolic.test.ts`; Modify `src/core/solver.ts`, `src/core/progressive.ts`, `src/core/types.ts`.

**Interfaces:** `semanticSignature(expr,variable='x'):string|null`；`searchSymbolic(data,context,onLevel:(level:number,beamSize:number)=>void): Iterable<CandidateDraft>`；`SolveContext={options,deadline,now,shouldAbort,features,diagnostics}`。每层最多 300，组合前 48，family 保留至少 8。

- [ ] **Step 1: 写 affine 等价、语义近似、`sin(x²)` 恢复、deadline 和 3 层停滞测试。**

```ts
expect(semanticSignature(add(x,x))).toBe(semanticSignature(mul(int(2),x)));
const r=solveCurve(makeStroke(x=>Math.sin(x*x),{min:-2,max:2,noise:.004,seed:29}),
                   {maxStructuralComplexity:12,deterministicSeed:29});
expect(r.mode).toBe('function');
if(r.mode==='function')expect(r.pareto.some(c=>c.modelFamily==='symbolic'&&c.rmse<.07)).toBe(true);
const seen:number[]=[];
const prepared=preprocess(makeStroke(x=>Math.sin(x*x),{min:-2,max:2,noise:.004,seed:29}));
if(prepared.mode!=='function')throw new Error('expected scalar curve');
// contextWithDeadline 是本测试创建确定性 now()、deadline 和诊断的 helper。
[...searchSymbolic(prepared.data,contextWithDeadline(Infinity),(_level,size)=>seen.push(size))];
expect(Math.max(...seen)).toBeLessThanOrEqual(300);
```

- [ ] **Step 2: 运行 `npm test -- tests/unit/semanticHash.test.ts tests/integration/symbolic.test.ts`，预期失败。**
- [ ] **Step 3: 在 `[-1,1]` 取 32 个 Chebyshev probes，去均值/标准差、量化 ×1000，用双 64-bit FNV-1a 签名；常数单独签名，无效 probe >1 则拒绝；相同签名按复杂度和 fit error 筛；每层 quality `log(error+1e-12)+0.02C` 排序保留最多 300；二元组合前 48 与 family quota。** 256 raw points 再次确认候选数值等价，避免哈希碰撞。遍历每 32 templates 或 ~8 ms 检查 deadline/cancel，噪声地板、停滞 3 层、复杂度 12 任一触发停止并写 diagnostics。

```ts
for(let level=1;level<=context.options.maxStructuralComplexity;level++) {
  if(context.shouldAbort()||context.now()>=context.deadline)break;
  const pruned=deduplicateAndBeam(generate(level),300,48);
  context.diagnostics.maxComplexityReached=level;
  for(const draft of fitLayer(pruned))yield draft;
}
```

- [ ] **Step 4: 运行 symbolic tests、全部测试与 build；固定 seed 重复两次应给相同 Balanced AST 和诊断计数。**
- [ ] **Step 5: 提交：** `git add src/search/semanticHash.ts src/search/symbolic.ts src/core/solver.ts src/core/progressive.ts src/core/types.ts tests/unit/semanticHash.test.ts tests/integration/symbolic.test.ts && git commit -m "feat: search symbolic expressions with bounded beams"`。

### Task 21: 非单值笔迹的参数表达式

**Files:** Create `tests/synthetic/parametric.test.ts`; Modify `src/core/solver.ts`, `src/core/progressive.ts`, `src/core/preprocess.ts`, `src/core/types.ts`, `src/core/quality.ts`, `src/search/candidatePool.ts`, `src/ui/formulaPanel.ts`, `src/ui/plot.ts`.

**Interfaces:** `solveParametric(data:ParametricData,options,hooks):ParametricSolveResult`；候选为 `{xExpr,yExpr,...}`，联合 RMSE 用二维欧氏残差并除以鲁棒包围盒对角尺度；`t` 在 `[0,1]`。

- [ ] **Step 1: 写圆、竖线、折返和闭合笔迹测试。**

```ts
const circle=Array.from({length:240},(_,i)=>{
  const t=i/239;
  return {x:3*Math.cos(2*Math.PI*t),y:3*Math.sin(2*Math.PI*t),t:i};
});
const result=solveCurve(circle);
expect(result.mode).toBe('parametric');
if(result.mode==='parametric') {
  expect(result.best.rmse).toBeLessThan(.08);
  expect(result.best.plot.x).toHaveLength(256);
  expect(result.best.latex).toContain('t');
}
```

- [ ] **Step 2: 运行 `npm test -- tests/synthetic/parametric.test.ts`，预期失败。**
- [ ] **Step 3: 弧长均匀 t→x/y 标量数据，各复用 fast/fallback/symbolic 但共享 deadline；先取 x/y 各自前 8 个 Pareto 候选，小型联合 beam 组成表达式对；按联合 RMSE、联合复杂度、MDL 建 Pareto 并选三档。** 闭合曲线给周期初值 `2π`，竖直线的 x(t) 使用常数模型。参数 plot 从最终 xExpr/yExpr 求值。

```ts
for(const xc of xFrontier.slice(0,8))for(const yc of yFrontier.slice(0,8)) {
  pairPool.add(makePair(xc,yc,data));
}
```

- [ ] **Step 4: 运行 parametric 测试、全部测试与 build；在 UI 画圆应显示双行公式并能切换三档。**
- [ ] **Step 5: 提交：** `git add src/core src/search/candidatePool.ts src/ui/formulaPanel.ts src/ui/plot.ts tests/synthetic/parametric.test.ts && git commit -m "feat: recover parametric expressions for non-functions"`。

### Task 22: 完整交互、历史、质量与可访问性

**Files:** Create `src/ui/gestures.ts`, `src/ui/state.ts`, `src/ui/controls.ts`, `tests/unit/uiState.test.ts`, `tests/integration/interaction.test.ts`; Modify `src/ui/app.ts`, `src/ui/canvas.ts`, `src/ui/plot.ts`, `src/ui/formulaPanel.ts`, `src/ui/styles.css`, `src/worker/client.ts`.

**Interfaces:** `UiState={phase:'idle'|'drawing'|'solving'|'result'|'invalid';stroke;result;selected:'simple'|'balanced'|'accurate';view;history}`；`undo`, `clear`, `resetView`, `selectCandidate`, `copyLatex`, `copyPlain` 是 controls action。

- [ ] **Step 1: 写三档切换、Undo、Clear、坐标锁定、旧 request 及复制内容测试。**

```ts
const s=createUiState();
const first=commitStroke(s,lineStroke());
const second=commitStroke(first,quadraticStroke());
expect(undo(second).stroke).toEqual(first.stroke);
expect(clear(second).stroke).toEqual([]);
expect(selectCandidate(withResult(second),'accurate').selected).toBe('accurate');
const chosen=selectCandidate(withResult(second),'accurate');
expect(renderCopyText(chosen,'latex')).toBe(chosen.result!.accurate.latex);
```

- [ ] **Step 2: 运行 `npm test -- tests/unit/uiState.test.ts tests/integration/interaction.test.ts`，预期失败。**
- [ ] **Step 3: 在 `ui/state.ts` 实现最多 20 个快照的不可变状态；中键/空格拖动平移、滚轮锚点缩放、双指平移；绘制中锁定视口、隐藏上一拟合；按钮与键盘操作使用原生语义；三档 tablist 保留选择；质量等级以文字显示，指标通过 focus/hover/信息按钮呈现；复制先 Clipboard API，失败使用 textarea fallback。** 响应布局按规格第 21 节，深浅色和 reduced-motion CSS；Worker 错误重建一次并显示可恢复提示。

```ts
function acceptWorkerMessage(state:UiState,msg:WorkerResponse):UiState {
  if(msg.id!==state.activeRequestId)return state;
  return reduceWorkerMessage(state,msg);
}
```

- [ ] **Step 4: 运行交互测试、全部测试、build；键盘顺序、移动窄屏和系统深色模式手工检查，公式旁有 plain text live region。**
- [ ] **Step 5: 提交：** `git add src/ui src/worker/client.ts tests/unit/uiState.test.ts tests/integration/interaction.test.ts && git commit -m "feat: complete accessible drawing controls and candidate UI"`。

### Task 23: 离线应用壳和浏览器端到端验收

**Files:** Create `playwright.config.ts`, `tests/browser/helpers.ts`, `tests/browser/draw.spec.ts`, `tests/browser/offline.spec.ts`, `public/manifest.webmanifest`, `public/icons/icon.svg`; Modify `package.json`, `package-lock.json`, `vite.config.ts`, `index.html`, `src/main.ts`, `src/ui/styles.css`.

**Interfaces:** `npm run test:e2e` 使用 Playwright Chromium，`npm run preview` 预览生产构建；PWA precache 包含 HTML、JS、CSS、Worker、KaTeX 本地字体、manifest 与图标。

- [ ] **Step 1: 写真实浏览器绘制、切换、复制、取消以及离线重载测试。**

```ts
test('works after an offline reload',async ({page,context})=>{
  await page.goto('/');
  await page.evaluate(async()=>{await navigator.serviceWorker.ready;});
  await page.reload(); // 此次载入由已激活的 service worker 控制
  await context.setOffline(true);
  await page.reload();
  await drawWorldCurve(page,x=>2*Math.sin(Math.PI*x));
  await expect(page.getByRole('tab',{name:'Balanced'})).toBeVisible();
  await expect(page.getByTestId('formula')).toContainText('sin');
});
```

`drawWorldCurve()` 由 `tests/browser/helpers.ts` 导出，坐标从可见 Canvas bounding box 换算。另一个测试验证 200 ms 内快速两次绘制后只显示最后一条结果。

- [ ] **Step 2: 安装 `@playwright/test vite-plugin-pwa`，运行 `npx playwright install chromium`，添加 `test:e2e`/`preview` scripts 与 `webServer` 启动生产预览；运行 `npm run test:e2e -- tests/browser/offline.spec.ts`，预期因无 service worker 而失败。**
- [ ] **Step 3: 在 Vite 配置 PWA precache，`src/main.ts` 导入 `virtual:pwa-register` 并调用 `registerSW()`，manifest 指向本地 SVG；所有 KaTeX 静态字体经构建导入打包，Worker 使用 `new URL` 让 Vite 产物被 precache；更新仅在旧页面全部关闭后的下一次加载生效。** Playwright context 允许 service workers；测试中第一次访问等待 SW controller 生效再切离线，记录网络请求，离线求解时不得请求外部资源。

```ts
VitePWA({registerType:'prompt',workbox:{skipWaiting:false,clientsClaim:false,
  globPatterns:['**/*.{js,css,html,woff2,svg,webmanifest}']}})
```

- [ ] **Step 4: 运行 `npm run build`, `npm run test:e2e`，预期画线、切换、复制、圆形参数模式、快速重绘和离线重载全部通过。**
- [ ] **Step 5: 提交：** `git add package.json package-lock.json vite.config.ts index.html src/main.ts playwright.config.ts public src/ui/styles.css tests/browser && git commit -m "feat: support offline solving and browser workflows"`。

### Task 24: 合成恢复套件、边界回归和基准记录

**Files:** Create `tests/synthetic/recovery.test.ts`, `tests/synthetic/property.test.ts`, `benchmarks/solver.bench.ts`, `README.md`; Modify `tests/fixtures/generateStroke.ts`, `package.json`, `package-lock.json`, `src/core/solver.ts` only if diagnostics need a stable export.

**Interfaces:** `makeStroke(f, {min,max,noise,seed,wobble?,dropRate?,outliers?,xJitter?,reverse?}):Point[]`；`npm run benchmark` 输出逐阶段耗时/候选计数 JSON。

- [ ] **Step 1: 写固定种子的 12 个指定函数、随机 Chebyshev/Fourier 和属性测试。**

```ts
const target=(x:number)=>2*Math.sin(Math.PI*x);
const p=makeStroke(target,{min:-2,max:2,noise:.01,seed:2309,wobble:.006,
                           dropRate:.07,outliers:2,xJitter:.002,reverse:true});
const r=solveCurve(p,{deterministicSeed:2309});
expect(r.mode).toBe('function');
if(r.mode==='function') {
  expect(r.balanced.rmse).toBeLessThanOrEqual(1.5*r.noise);
  expect(r.balanced.complexity).toBeLessThan(14);
}
```

固定样本覆盖 `2x+1,x²,x³-x,2sin(πx),x+½sin(3x),e^{.7x},log(x+2),|x-1|,1/(x+2),e^{-x²},e^{-.2x}sin(4x),sin(x²)`。数值恒等允许清晰标识的高度等价形式，失败时打印 seed、family、误差和候选式。

- [ ] **Step 2: 运行 `npm test -- tests/synthetic/recovery.test.ts tests/synthetic/property.test.ts`，预期尚未涵盖的噪声、缺口或模型选择用例失败。** 记录每个失败样本的 deterministic seed；针对失败原因修改所属算法，避免全局放宽阈值。
- [ ] **Step 3: 在 generator 实现 Gaussian noise、低频 wobble、非均匀 x、丢样、孤立跳点、x jitter、反向笔迹；property tests 检查 AST round-trip、canonicalize 幂等、坐标/归一化往返、Pareto 无支配关系；安装 `tsx` 并增加 `"benchmark":"tsx benchmarks/solver.bench.ts"`，分阶段记录 preprocess、fast、symbolic 各 level、beautify、total、generated/fitted/rejected、最大 beam 与 Node heapUsed。** README 说明安装、运行、build、test、offline、架构、算法取舍、浏览器支持与第一版限制。

```ts
const phases=['preprocess','fast-models','extended-models','fallback','symbolic','beautify'];
process.stdout.write(JSON.stringify({phases:timings,diagnostics,
  heapUsed:process.memoryUsage().heapUsed},null,2));
```

- [ ] **Step 4: 运行 `npm run typecheck`, `npm test`, `npm run build`, `npm run test:e2e`, `npm run benchmark` 并保存各命令输出供审查；基准只作记录，不对共享 CI 时间做硬门槛。**
- [ ] **Step 5: 提交：** `git add tests/fixtures tests/synthetic benchmarks README.md package.json package-lock.json src/core/solver.ts && git commit -m "test: verify recovery and document the completed app"`。若 `src/core/solver.ts` 无变更则不加入该路径。

## Final cross-check

- [ ] `git branch --show-current` 输出 `soltest`，`git status --short` 为空。
- [ ] `npm run typecheck`、`npm test`、`npm run build`、`npm run test:e2e` 均成功，命令输出与 commit SHA 可复核。
- [ ] 一条近似 `2sin(πx)` 的手绘笔迹优先显示漂亮常数，三个 Pareto 候选都可选择且公式与 plot 一致。
- [ ] 圆、竖线和回头笔迹显示 x(t)/y(t)，复杂波形至少得到稳定 approximation。
- [ ] 连续两条笔迹只显示后者，Worker 取消后 CPU 不积压。
- [ ] 首次在线加载并缓存后断网重载仍能求解。
- [ ] benchmark 记录 256 样本下每阶段耗时、候选计数和峰值 beam；对性能目标逐项标记实际测量与硬件环境。
- [ ] 自设计文档第 1～31 节逐项核对，无遗漏或未声明的公共接口变更；必要变更先更新规格与测试，再提交。

## Spec coverage map

| Spec sections | Owning tasks |
|---|---|
| 1–5 目标、范围、架构、目录 | 1、9、10、22–24 与本计划 file map |
| 6 公共类型 | 1、3、4、6、8–10、21 |
| 7 Canvas 输入 | 2、3、22 |
| 8–9 验证、重采样、噪声、归一化 | 3、4、21 |
| 10–11 特征与数值基础 | 5、11–13 |
| 12 AST、求值、化简 | 6、7、17 |
| 13–14 Producer 与 fast models | 8、9、12、14–16 |
| 15 Symbolic grammar、beam、停止 | 19、20 |
| 16 Universal fallback | 9、18 |
| 17–19 评分、Pareto、漂亮化、质量 | 8、17、18 |
| 20 Worker 进度与取消 | 10、20–22 |
| 21 UI 与可访问性 | 2、3、10、22、23 |
| 22 离线 | 23 |
| 23 数值与异常隔离 | 3、6、8、10、11、15、18 |
| 24 性能与资源 | 10、20、24 |
| 25–26 测试与基准 | 1–24 |
| 27–31 交付顺序、验收、风险、歧义 | 任务顺序、Review Focus 与 Final cross-check |

## 实施记录（2026-09-23）

- `soltest` 上按任务 1–24 实现；分支起始为空文件树，未修改默认分支。
- `npm run typecheck`、`npm test`（84 项）、`npm run build` 和 Chromium `npm run test:e2e`（4 项，含离线重载）均通过。
- Vite PWA precache 有 66 项，包含 HTML、Worker、KaTeX 字体、manifest 和图标；浏览器在断网重载后重新计算通过。
- 256 个重采样点的 Node 参考基准：简单曲线首个结果约 35–85 ms；`2sin(πx)` 完整结果约 680 ms；含离群点的 `sin(x²)` 约 1563 ms，略高于桌面 1.5 s 的理想目标。具体硬件与分阶段数据见 README 和 `npm run benchmark`。
- 页面有单指绘制、鼠标滚轮缩放、Shift/中键平移；双指缩放和平移留待后续版本。浏览器基准不能代表移动设备性能。

## 复审修复（2026-09-23）

- 修正稀疏及不均匀采样的有效域、桶中心造成的直线波纹，以及接近端点的单次笔跳污染。
- 渐进预算从预处理开始计时，参数曲线先提供快速结果再继续拟合；同步 `null` 预算按有限结构搜索，不设隐含的墙钟截止时间。
- 双指平移与缩放支持保留既有公式和仍在运行的求解；导航结束后可以继续单指绘制。
- `npm test` 96 项、`npm run build` 和 Chromium `npm run test:e2e` 5 项通过，浏览器测试覆盖触控与离线重载。
- 追加稀疏指数与高次曲线的端点回归；单指移动超过绘制阈值后及时终止旧 Worker，双指提前加入仍保留原求解。`npm test` 98 项与 `npm run build` 再次通过。
