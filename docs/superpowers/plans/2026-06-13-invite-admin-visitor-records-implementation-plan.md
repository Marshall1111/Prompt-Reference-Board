# 后台邀请码页访问记录改造实现计划

## 目标

基于已确认的设计，将后台 `邀请码` 页面从“邀请码 + 访客额度”改造成“邀请码 + 访问记录”，并补齐真实访问停留时长所需的访问会话埋点与聚合接口。

本次实现以可上线的最小完整链路为目标，优先保证：

- 访问时长数据真实可用
- 后台页面先能稳定展示最近访问记录
- 不破坏现有邀请码、公共生成、下单流程

## 范围

本次实现包含：

- 新增访问会话存储与读写逻辑
- 新增公共访问上报接口
- 公共页面接入 `enter` / `heartbeat` / `leave`
- 新增管理端访问记录聚合接口
- 后台 `InviteAdminPage` 替换掉 `访客额度` 区块
- 后台样式改为紧凑访问记录列表

本次实现不包含：

- 访问记录筛选、导出、图表
- 访客详情页或抽屉
- 历史访问时长回填
- 数据库存储迁移

## 实施顺序

### 阶段 1：服务端访问会话基础设施

目标：先让服务端具备保存和读取访问会话的能力，为后续前台埋点和后台聚合打底。

任务：

1. 在 `server/index.js` 中新增访问会话的数据模型、路径与安全校验函数
2. 新增 `data/visit-sessions/` 目录的读写辅助函数
3. 定义访问会话标准结构与归一化函数
4. 实现单条访问会话读取、保存、列举能力
5. 实现访问会话超时收口逻辑所需的基础工具函数

建议新增或修改的函数：

- `getVisitSessionPath(sessionId)`
- `isSafeVisitSessionId(sessionId)`
- `normalizeVisitSession(session)`
- `readVisitSession(sessionId)`
- `saveVisitSession(session)`
- `listVisitSessions()`
- `closeTimedOutVisitSessions(now)`

验收标准：

- 服务端可以独立创建、读取、更新访问会话 JSON 文件
- 非法 `sessionId` 会被拒绝
- 旧数据缺字段时能通过归一化补齐默认值

### 阶段 2：访客状态补充字段

目标：在不重构现有访客状态结构的前提下，为访问会话衔接增加轻量字段。

任务：

1. 扩展 `normalizeVisitorState`，补充：
   - `lastActiveAt`
   - `activeVisitSessionId`
2. 确保旧访客状态文件无这两个字段时仍能正常读取
3. 确保写回访客状态时不会丢失现有字段

涉及文件：

- `server/index.js`

验收标准：

- 现有访客状态数据可无损兼容
- 访客状态可记录当前活跃访问会话

### 阶段 3：公共访问上报接口

目标：提供统一的访问上报入口，让前台用一个接口处理进入、心跳、离开事件。

任务：

1. 在 `server/index.js` 中新增：
   - `POST /api/visit-sessions/report`
2. 处理三类事件：
   - `enter`
   - `heartbeat`
   - `leave`
3. `enter` 时创建访问会话并回传 `sessionId`
4. `heartbeat` 时刷新 `lastHeartbeatAt`
5. `leave` 时写入 `endedAt`、`durationSeconds`、`status`
6. 同步更新访客状态中的：
   - `lastActiveAt`
   - `activeVisitSessionId`
7. 在接口内或聚合前调用超时收口逻辑，避免活跃会话长期悬挂

接口返回建议：

- `enter` 返回新建的 `sessionId`
- `heartbeat` 返回当前会话摘要
- `leave` 返回结束后的会话摘要

验收标准：

- 同一访客进入页面后能拿到稳定的访问会话 ID
- 心跳可以持续刷新会话活跃时间
- 离开页面后会话会正确结束
- 丢失 `leave` 时，会话最终会被超时关闭

### 阶段 4：前台公共页面埋点接入

目标：让公开页面在真实用户访问过程中自动上报访问事件。

任务：

1. 在 `src/main.jsx` 中新增访问会话上报请求函数，例如：
   - `reportVisitSessionEvent`
2. 在 `PublicExperiencePage` 中维护当前访问会话 ID
3. 页面加载时触发 `enter`
4. 页面保持前台活跃时按固定间隔触发 `heartbeat`
5. 页面关闭、刷新、隐藏、路由离开时尽量发送 `leave`
6. 处理冰箱贴页与默认公开页的共用逻辑，避免重复埋点实现

建议接入点：

- `useEffect` 初始化进入事件
- `visibilitychange`
- `pagehide` 或 `beforeunload`
- 页面卸载清理逻辑

注意事项：

- `leave` 事件应尽量使用浏览器允许的轻量发送方式
- 如果离开事件失败，服务端超时收口仍应保证数据最终可用
- 不应阻塞现有生成、收藏、下单流程

涉及文件：

- `src/main.jsx`

验收标准：

- 用户打开公开页会生成访问记录
- 用户停留期间会有持续心跳
- 用户离开后大多数情况下可正确生成停留时长

### 阶段 5：管理端访问记录聚合接口

目标：提供后台真正需要的按访客聚合结果，而不是把原始访问会话直接暴露给页面。

任务：

1. 在 `server/index.js` 中新增：
   - `GET /api/admin/visitor-records`
2. 聚合以下数据源：
   - 访客状态
   - 访问会话
   - 公开生成会话或可替代的公开生成轮次数据
   - 订单数据
3. 计算每个访客的：
   - `visitorId`
   - `sourceMerchantId`
   - `sourceMerchantName`
   - `lastActiveAt`
   - `lastVisitDurationSeconds`
   - `generationCount`
   - `orderTotalCents`
   - `createdAt`
   - `updatedAt`
4. 按 `lastActiveAt` 倒序输出
5. 首版先限制为返回最近 50 条记录

关键实现决策：

- `generationCount` 优先按公开生成会话数统计，不按单张任务数统计
- `orderTotalCents` 排除已取消订单
- `lastVisitDurationSeconds` 没有埋点时返回 `null`

涉及文件：

- `server/index.js`

验收标准：

- 管理端能拿到按访客聚合后的访问记录
- 返回顺序正确
- 聚合字段口径与 spec 一致

### 阶段 6：后台 Invite 页面数据接线

目标：让后台“邀请码”页读取新的访问记录接口，并移除旧的访客额度展示。

任务：

1. 在 `src/main.jsx` 中新增读取访问记录的请求函数，例如：
   - `fetchAdminVisitorRecords`
2. 在 `AdminApp` 中新增访问记录状态：
   - `visitorRecords`
3. 后台初始化与刷新逻辑改为拉取：
   - `inviteCodes`
   - `visitorRecords`
   - `settings`
4. 保留现有邀请码相关刷新逻辑
5. 移除 `visitors` 在 `InviteAdminPage` 中的旧展示职责

涉及文件：

- `src/main.jsx`

验收标准：

- 后台刷新按钮可同时刷新邀请码与访问记录
- 页面不再依赖旧 `GET /api/admin/visitors` 的展示结果

### 阶段 7：后台 Invite 页面 UI 改造

目标：把原来的“访客额度卡片列表”替换成更紧凑的“访问记录列表”。

任务：

1. 更新 `InviteAdminPage` 标题和说明文案：
   - 标题改为 `邀请码与访问记录`
   - 说明改为邀请码 + 最近访客运营数据
2. 保留匿名免费次数设置和邀请码管理区块
3. 删除原 `访客额度` 卡片列表
4. 新增 `访问记录` 区块
5. 使用紧凑的表头 + 行列表现，不再使用大卡片
6. 展示列：
   - 访客
   - 来源商户
   - 最近活跃
   - 最近停留时长
   - 生成次数
   - 订单金额
7. 提供空状态：
   - `还没有访问记录。`

涉及文件：

- `src/main.jsx`
- `src/styles.css`

验收标准：

- 页面信息密度明显高于旧访客额度区块
- 一屏能看到更多最近访客记录
- 历史记录无停留时长时能稳定显示 `--`

### 阶段 8：样式与响应式收尾

目标：保证后台访问记录列表在桌面和窄屏下都可读。

任务：

1. 在 `src/styles.css` 中新增访问记录列表样式
2. 桌面端使用单行紧凑布局
3. 小屏下折为两行信息块
4. 控制长商户名、长 ID 的溢出和截断
5. 保持与现有后台视觉语言一致，不引入新的复杂设计系统

验收标准：

- 桌面端字段对齐清晰
- 移动端或窄屏仍能完整读出主要信息
- 页面整体比原先更紧凑

### 阶段 9：验证与回归

目标：确保新链路可用，并且没有破坏现有流程。

服务端验证：

1. 创建访问会话
2. 心跳刷新
3. 正常离开
4. 超时关闭
5. 聚合访问记录
6. 取消订单不计入金额

前端验证：

1. 公开页进入后生成访问记录
2. 页面停留后可看到真实停留时长
3. 冰箱贴页与默认公开页都不报错
4. 后台“邀请码”页能正常加载访问记录
5. 邀请码创建、启停、历史折叠逻辑不受影响

手工回归重点：

- `/`
- `/fridge`
- `/admin/invites`

## 文件清单

预计主要修改文件：

- `server/index.js`
- `src/main.jsx`
- `src/styles.css`

预计新增数据目录：

- `data/visit-sessions/`

预计新增文档：

- 当前实现计划文档

## 风险与应对

### 风险 1：浏览器离开事件不稳定

应对：

- 以前端 `heartbeat` 为主
- 以服务端超时收口兜底

### 风险 2：生成次数口径实现偏成任务数

应对：

- 实现前先明确使用“公开生成会话”口径
- 如果现有代码没有直接可复用的会话集合，就补一个明确的聚合函数，不直接拿任务条数顶替

### 风险 3：老数据没有访问会话

应对：

- 页面允许显示 `--`
- 不阻塞首版上线

### 风险 4：后台页面改造影响邀请码管理体验

应对：

- 邀请码区域只做轻量布局整理
- 不动邀请码数据模型和核心交互

## 建议提交拆分

为了降低回归风险，建议按下面的提交粒度实现：

1. `server: add visit session storage and report endpoint`
2. `client: report public visit sessions`
3. `server: add admin visitor records aggregation`
4. `admin: replace visitor quota list with visitor records`

这样出现问题时更容易定位和回退。

## 完成定义

满足以下条件即可认为本次实现完成：

- 公开页访问会被记录为访问会话
- 后台 `邀请码` 页不再展示访客额度列表
- 后台能展示按访客聚合的最近访问记录
- 最近停留时长对新访问数据真实可用
- 生成次数和订单金额口径与 spec 一致
