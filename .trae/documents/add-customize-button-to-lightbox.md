# 预览弹窗新增「去定制」按钮

## Summary

在任务页 / 卡夹页共用的图片预览弹窗（lightbox）中，于「做同款」和「分享」之间新增一个高亮的「去定制」按钮。点击后跳转到选图定制页 `/draw/order`，并通过 URL 参数 `?jobId=<jobId>` 默认选中当前预览的这张图。

## Current State Analysis

- 预览弹窗为任务页 / 卡夹页 / 主页结果区共用，位于 [src/main.jsx#L6935-L6972](file:///d:/Prompt-Reference-Board/Prompt-Reference-Board/src/main.jsx#L6935-L6972)。按钮组在 `activeResult.isLiked && experienceType === "draw-card"` 分支（L6946-L6956），当前顺序：移出卡夹 → 下载原图 → 做同款 → 分享 → 风格码。
- 「做同款」的导航先例（[openSameStyle, main.jsx#L5929-L5941](file:///d:/Prompt-Reference-Board/Prompt-Reference-Board/src/main.jsx#L5929-L5941)）：任务/卡夹页**不先关闭弹窗**直接 `window.location.assign(...)`，否则 `ModalRouteHistory` 的 `history.go(-1)` 会取消未完成的跨文档导航（项目已踩坑）。
- 选图定制页 `DrawCardCheckoutPage`（[main.jsx#L3986](file:///d:/Prompt-Reference-Board/Prompt-Reference-Board/src/main.jsx#L3986)）目前**不支持 URL 参数**，默认选中卡夹第一张（L4026-L4029：`setSelectedJobIds(items[0]?.jobId ? [items[0].jobId] : [])`）。图片选择仅出现在「邮寄」模式下，选中状态 `selectedJobIds` 与 `toggleSelectedItem` 均已存在。
- 「去定制」按钮只加在「已加入卡夹」的按钮组里，因此点击时该图必然已在卡夹中，checkout 页的 `clipItems` 一定能找到对应 `jobId`（`activeResult.jobId` 来自 `toDisplayResult`，已包含 jobId）。
- 按钮样式参考：`.draw-card-clip-remove` / `.draw-card-clip-download`（[styles.css#L3130-L3144](file:///d:/Prompt-Reference-Board/Prompt-Reference-Board/src/styles.css#L3130-L3144)，`min-height: 40px; padding: 0 14px; border-radius: 999px`）；高亮色参考 `.draw-card-primary`（[styles.css#L2563-L2566](file:///d:/Prompt-Reference-Board/Prompt-Reference-Board/src/styles.css#L2563-L2566)，金色渐变底 + 深色字）。
- lucide 图标 import 在 [main.jsx#L3](file:///d:/Prompt-Reference-Board/Prompt-Reference-Board/src/main.jsx#L3)，当前无 `ShoppingBag`，需补充。

## Proposed Changes

### 1. `src/main.jsx` — lucide import 补充图标

在 L3 的 `lucide-react` import 列表中按字母序加入 `ShoppingBag`（用于「去定制」按钮图标）。

### 2. `src/main.jsx` — 预览弹窗按钮组（L6946-L6956）

在「做同款」和「分享」按钮之间插入：

```jsx
<button
  className="draw-card-clip-customize"
  onClick={() => window.location.assign(`/draw/order?jobId=${encodeURIComponent(activeResult.jobId)}`)}
  type="button"
>
  <ShoppingBag size={16} />
  <span>去定制</span>
</button>
```

要点：
- 不先关闭弹窗，直接 `window.location.assign`（与 openSameStyle 同一模式，规避 ModalRouteHistory 的 `history.go(-1)` 取消导航问题；从任何共用该弹窗的页面跳转均适用）。
- `activeResult.jobId` 已在 isLiked 分支内，必然存在于卡夹。

### 3. `src/main.jsx` — `DrawCardCheckoutPage` 支持预选（L4019-L4029）

在加载完成回调中，改为优先读取 URL 参数：

```js
if (!hasInitializedDefaultSelectionRef.current) {
  const requestedJobId = new URLSearchParams(window.location.search).get("jobId") || "";
  const requestedItem = items.find((item) => String(item.jobId) === String(requestedJobId));
  setSelectedJobIds(requestedItem?.jobId ? [requestedItem.jobId] : items[0]?.jobId ? [items[0].jobId] : []);
  hasInitializedDefaultSelectionRef.current = true;
}
```

要点：
- `jobId` 参数命中卡夹内图片 → 默认只选中该图（数量走已有的默认逻辑）。
- 未传参数或参数无效（图已被移出卡夹等）→ 回落为现状：选中第一张；卡夹为空则不选。

### 4. `src/styles.css` — 新增 `.draw-card-clip-customize` 样式

放在 `.draw-card-clip-download:disabled`（L3152-L3155）之后：

```css
.draw-card-clip-customize {
  border-color: transparent;
  background: linear-gradient(135deg, #f1dfc3, #b98f58);
  color: #111214;
}
```

要点：
- 尺寸/圆角/字重继承自与 `.draw-card-clip-remove` 共用的规则块（同一选择器组新增此类名最简：把 L3130 选择器改为 `.draw-card-clip-remove, .draw-card-clip-download, .draw-card-clip-customize`），仅覆盖底色与文字色实现高亮，与 `.draw-card-primary` 视觉一致。

## Assumptions & Decisions

- **商户风格码来源（补充需求）**：用户经商户风格码进入时，首页已调用 `claimStoreOwnerContext`（main.jsx L5624-L5641）把店家信息写入 visitor 记录；`DrawCardCheckoutPage` 加载时检测到 `storeOwnerWechatId` 会自动切到「现场制作」并隐藏邮寄选图区（main.jsx L4036-L4044、L4364 条件门）。因此该需求由现有机制覆盖，**无需新增代码**；`?jobId=` 预选仅影响选中状态，在现场制作模式下不展示，互不冲突；若商户用户手动切回「邮寄」，预选的图仍然生效。
- 「去定制」只出现在已加入卡夹的图片预览中（跟随现有按钮组条件），未入卡夹的预览不加，避免出现未入卡夹却跳定制页选不中图的边界情况。
- 预选用 URL 参数 `?jobId=` 而非 localStorage，符合项目现有 `?sameStyleId=` / `?invite=` 模式，且可分享/刷新保留。
- 高亮样式复用 `.draw-card-primary` 的金色渐变，不引入新颜色。
- 「现场制作」模式没有选图 UI，但选中状态保留，切回「邮寄」即生效；默认 fulfillmentMode 为 mail（店家账号除外），符合现状不改。

## Verification

1. `npm.cmd run build` 通过。
2. 本地 `http://localhost:3000`（服务已在跑新代码，改前端后需重新 build 或走 dev 端口 5173）：
   - 任务页 / 卡夹页打开已入卡夹图片的预览弹窗，确认按钮顺序：移出卡夹 / 下载原图 / 做同款 / **去定制** / 分享 / 风格码，「去定制」为金色高亮且尺寸与「移出卡夹」一致。
   - 点击「去定制」→ 跳转 `/draw/order?jobId=...`，「选择图片」区只有该图被选中。
   - 直接访问 `/draw/order`（无参数）→ 仍默认选中第一张；访问 `/draw/order?jobId=不存在的id` → 回落选中第一张。
   - 响应式：窄屏（375px）下按钮组换行正常、无右侧溢出。
