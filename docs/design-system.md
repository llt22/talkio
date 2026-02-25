# Talkio 2.0 — 设计规范 (Design System)

> 2026/02/25 确定

---

## 一、设计令牌 (Design Tokens)

### 1.1 颜色系统

```css
:root {
  /* 品牌色 */
  --color-primary:          #3B82F6;  /* 蓝 */
  --color-primary-hover:    #2563EB;
  --color-primary-light:    #EFF6FF;  /* primary/8 */

  /* 语义色 */
  --color-success:          #22C55E;
  --color-warning:          #F59E0B;
  --color-error:            #EF4444;
  --color-error-light:      #FEF2F2;

  /* 背景 */
  --color-bg:               #FFFFFF;
  --color-bg-secondary:     #F9FAFB;
  --color-bg-card:          #FFFFFF;
  --color-bg-hover:         #F3F4F6;
  --color-bg-input:         #F9FAFB;

  /* 文字 */
  --color-text:             #111827;
  --color-text-secondary:   #6B7280;
  --color-text-muted:       #9CA3AF;
  --color-text-hint:        #D1D5DB;

  /* 边框 */
  --color-border:           #E5E7EB;
  --color-border-light:     #F3F4F6;
}
```

暗色模式覆盖同一套变量名，切换时只需替换值。

### 1.2 圆角

| 令牌 | 值 | 用途 |
|------|-----|------|
| `--radius-sm` | 6px | 标签、Badge |
| `--radius-md` | 10px | 输入框、卡片 |
| `--radius-lg` | 16px | 对话框、底部抽屉 |
| `--radius-full` | 9999px | 头像、胶囊按钮 |

### 1.3 字体层级

| 名称 | 大小 | 字重 | 用途 |
|------|------|------|------|
| `title` | 18px | semibold | 页面标题 |
| `subtitle` | 16px | medium | 对话标题、设置项 |
| `body` | 14px | normal | 正文、消息内容 |
| `caption` | 13px | normal | 辅助文字、时间戳 |
| `footnote` | 12px | normal | 注释、版本号 |
| `micro` | 10px | medium | Badge、代码语言标签 |

### 1.4 间距节奏（4px 基准）

| 令牌 | 值 | 用途 |
|------|-----|------|
| `xs` | 4px | 紧凑间距（图标与文字） |
| `sm` | 8px | 组件内间距 |
| `md` | 12px | 组件间距 |
| `lg` | 16px | 区块间距 |
| `xl` | 24px | 大区块间距 |
| `2xl` | 32px | 页面边距 |

### 1.5 阴影

| 名称 | 值 | 用途 |
|------|-----|------|
| `sm` | `0 1px 2px rgba(0,0,0,0.05)` | 卡片 |
| `md` | `0 4px 6px rgba(0,0,0,0.07)` | 弹窗 |
| `lg` | `0 10px 15px rgba(0,0,0,0.1)` | 模态框 |

---

## 二、组件规格

### 2.1 按钮

| 变体 | 高度 | 圆角 | 样式 |
|------|------|------|------|
| **主要** | 40px | `radius-md` | `bg-primary text-white font-medium` |
| **次要** | 40px | `radius-md` | `border border-border text-primary` |
| **幽灵** | 40px | `radius-md` | `text-text-secondary hover:bg-hover` |
| **危险** | 40px | `radius-md` | `bg-error text-white` |
| **图标** | 40×40px | `radius-full` | 仅图标，无文字 |
| **小图标** | 32×32px | `radius-full` | 紧凑场景 |

### 2.2 输入框

| 属性 | 值 |
|------|-----|
| 高度 | 44px |
| 圆角 | `radius-md` |
| 边框 | `border-border-light` |
| 背景 | `bg-input` |
| 文字 | 16px（防止 iOS 自动缩放） |
| 占位符 | `text-hint` |

### 2.3 卡片

| 属性 | 值 |
|------|-----|
| 圆角 | `radius-lg` |
| 边框 | `border-border` |
| 内边距 | 16px |
| 背景 | `bg-card` |

### 2.4 列表项

| 属性 | 值 |
|------|-----|
| 内边距 | `px-4 py-3` |
| 分割线 | `border-b border-border-light` |
| 点击态 | 移动端 `active:bg-hover` / 桌面端 `hover:bg-hover` |

### 2.5 头像

| 尺寸 | 大小 | 用途 |
|------|------|------|
| sm | 28×28px | 消息气泡 |
| md | 36×36px | 对话列表 |
| lg | 48×48px | 详情页 |

---

## 三、交互规范

### 3.1 触摸/点击反馈

| 交互 | 移动端 | 桌面端 |
|------|--------|--------|
| 按钮按下 | `active:opacity-70` | `hover:bg-hover` + `active:scale-[0.98]` |
| 列表项点击 | `active:bg-hover` | `hover:bg-hover/50` |
| 图标按钮 | `active:bg-gray-200`，最小热区 44×44 | `hover:bg-gray-100`，最小热区 32×32 |
| 危险操作 | 红色反馈 + 确认弹窗 | 红色反馈 + 确认弹窗 |

### 3.2 导航转场

| 操作 | 移动端 | 桌面端 |
|------|--------|--------|
| 进入详情 | `slide-in-right` 150ms | 右侧面板内容 `fade` 100ms |
| 返回 | 左滑返回 或 返回按钮 | 无（三栏布局不需要返回） |
| Tab 切换 | 底部 Tab 无动画，内容 `fade` | 左侧图标切换，中间面板 `fade` |
| 弹窗出现 | 底部 `slide-up` 300ms | 居中 `fade-in` + `scale` 200ms |
| 弹窗关闭 | 下滑关闭（手势拖拽） | 点击遮罩 或 ESC |

### 3.3 列表操作

| 操作 | 移动端 | 桌面端 | 统一点 |
|------|--------|--------|--------|
| 删除 | 左滑显示删除按钮 | hover 三点菜单 → 删除 | 都需确认弹窗 |
| 置顶 | 左滑显示置顶按钮 | hover 三点菜单 → 置顶 | 置顶后显示📌图标 |
| 搜索 | 顶部下拉搜索框 | 面板顶部固定搜索框 | 同一搜索逻辑 |
| 新建 | 右上角 `+` 按钮 | 面板顶部 `+` 按钮 | 同一创建流程 |
| 长列表 | 原生滚动 + 下拉刷新 | 虚拟滚动 + 滚动条 | 同一数据源 |

### 3.4 消息操作

| 操作 | 移动端 | 桌面端 | 统一点 |
|------|--------|--------|--------|
| 复制 | 长按 → 底部 Sheet | hover → 操作按钮 | 同一 `copyToClipboard` |
| 重新生成 | 长按 → Sheet | hover → 🔄 按钮 | 同一 `regenerate()` |
| 删除 | 长按 → Sheet → 确认 | 右键菜单 → 确认 | 同一 `deleteMessage()` |
| TTS | 长按 → Sheet → 🔊 | hover → 🔊 按钮 | 同一 `speechSynthesis` |

### 3.5 输入框交互

| 操作 | 移动端 | 桌面端 | 统一点 |
|------|--------|--------|--------|
| 发送 | 点击发送按钮 | `Enter` 发送，`Shift+Enter` 换行 | 同一 `sendMessage()` |
| @提及 | `@` → 底部 Sheet 选择 | `@` → 下拉 Popover | 同一模型列表 |
| 图片 | 点击📎 → 系统相册 | 拖拽/粘贴/点击选择 | 同一图片处理 |
| 录音 | 长按🎙️ 开始 | 点击🎙️ 切换 | 同一 STT 逻辑 |
| 停止生成 | 红色 ⏹ 按钮 | 红色 ⏹ 按钮 | 同一 `stopGeneration()` |

### 3.6 动画时间规范

| 名称 | 时长 | 缓动 | 用途 |
|------|------|------|------|
| `fast` | 100ms | `ease-out` | hover 状态变化 |
| `normal` | 200ms | `ease-in-out` | 弹窗/面板切换 |
| `slow` | 300ms | `ease-in-out` | 页面转场/底部抽屉 |
| `spring` | — | `damping:20, stiffness:300` | 拖拽释放/弹性动画 |

所有动画使用 `framer-motion`，保持一致性和可中断性。

---

## 四、交互原则

1. **最小点击区域**: 移动端 44×44px，桌面端 32×32px
2. **危险操作必须确认**: 删除对话、清空消息、移除 Provider
3. **操作可撤销优于确认**: 能 undo 的场景用 toast + undo，不弹确认框
4. **加载状态必须有反馈**: skeleton / spinner / 进度条，不留空白
5. **错误必须有提示**: toast 通知，不静默失败
6. **滚动位置记忆**: 切换页面后返回保持位置
7. **键盘快捷键**: 桌面端所有常用操作有快捷键

---

## 五、跨平台组件封装

核心思路：**调用方不关心平台，组件内部自动适配。**

### 5.1 `ActionSheet`

```
调用：<ActionSheet actions={[...]} />

移动端 → 底部 Sheet（手势可拖拽关闭）
桌面端 → DropdownMenu 或 ContextMenu
```

### 5.2 `PressableItem`

```
调用：<PressableItem onPress={...} />

移动端 → active:bg-hover，最小热区 44px
桌面端 → hover:bg-hover，cursor:pointer
```

### 5.3 `ConfirmDialog`

```
调用：confirm({ title, message, onConfirm })

移动端 → 居中 Dialog（底部按钮）
桌面端 → 居中 Dialog（底部按钮 + ESC 关闭）
```

### 5.4 Hooks

```
usePlatform()           → 'mobile' | 'desktop'
useHaptic()             → 统一触觉反馈
useLongPress(callback)  → 移动端长按检测
useKeyboardShortcut()   → 桌面端快捷键注册
useConfirm()            → 统一确认弹窗
```

---

## 六、UI 组件库

使用 **shadcn/ui** 作为基础组件库。

策略：
- **Layer 2 共享组件** → shadcn/ui（Button, Input, Dialog, Select, Switch, ScrollArea, Tooltip, Tabs）
- **Layer 3 移动端交互** → 自写（BottomSheet 手势、滑动删除、触摸操作栏）
- **Layer 3 桌面端交互** → shadcn/ui（DropdownMenu, ContextMenu, Command）

shadcn/ui 的默认主题用本文档的设计令牌覆盖，确保全局一致。

---

*文档最后更新: 2026/02/25*
