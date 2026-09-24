# Godot 与浏览器版差距补齐实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 补齐 Godot 版相对浏览器版仍缺失/不一致的功能，使两版行为严格一致。

> **状态：✅ 全部完成（2026-09-24）** — Task E/C/A/B/F/D 均已实现、通过解析检查并单独提交。
> 提交：E=`9d670c6`，C=`6c16620`，A=`ab0e179`，B=`58c3cee`，F=`9265519`，D=`baad64b`。

**Architecture:** 数据层 `PlantTypes.gd`（autoload）；实体行为 `Plant.gd`/`Projectile.gd`/`Zombie.gd`；机制与 UI `Main.gd`/`HUD.tscn`/`PlantBar.gd`/`PlantCard.gd`；新增 `Sound.gd`（autoload）承载运行时合成音效。

**Tech Stack:** Godot 4.7 GDScript（`godot_project/`），无测试框架，手动验证。

**Spec:** `docs/superpowers/specs/2026-09-20-godot-full-sync-design.md`（基线参照：浏览器 `js/`，已冻结）

## 全局约束

- Godot 4.7；Autoloads 现有 `InputManager`/`PlantTypes`/`ZombieTypes`/`Levels`，本计划新增 `Sound`。
- 所有数值以浏览器 `js/config.js` 为唯一基准，严格照搬。
- 浏览器文件零改动；`npm test` 13/13 保持全绿（回归红线）。
- `docs/` 在 .gitignore，提交 spec/plan 用 `git add -f`。
- 中文注释/标识符约定保持。
- 每批完成后：`godot --headless --path godot_project --check-only --quit` 无错误 → 手动试玩 → 单独 commit。

---

### Task E: 一致性（去重卡片 / 数值对齐 / 撑杆僵尸）

**Files:**
- Modify: `godot_project/PlantTypes.gd`（删除 `wall-nut` 键；向日葵 `sun_interval` 8.0→9.0）
- Modify: `godot_project/Main.gd`（阳光拾取半径 40→35）
- Modify: `godot_project/Zombie.gd`（撑杆僵尸改为瞬间跳过不啃食）

- [ ] **Step 1:** 删除 `PlantTypes.gd` 中重复的 `"wall-nut"` 键，保留 `"wallnut"`。
- [ ] **Step 2:** `PlantTypes.gd` 向日葵 `sun_interval` 改为 `9.0`。
- [ ] **Step 3:** `Main.gd` `_try_collect_sun` 拾取半径 40 → 35。
- [ ] **Step 4:** `Zombie.gd` 撑杆僵尸遇植物：一帧内越过第一排（`position.x` 直接跳过植物），不进入啃食状态。
- [ ] **Step 5:** 解析检查 + 试玩。Commit：`fix(godot): 一致性对齐（去重wallnut/向日葵9s/拾取半径35/撑杆跳过）`

---

### Task C: HUD 波次进度条

**Files:**
- Modify: `godot_project/HUD.tscn`（新增 `ProgressBar` 节点）
- Modify: `godot_project/Main.gd`（`_update_wave_label` 同步进度条）

- [ ] **Step 1:** `HUD.tscn` 在 `WaveLabel` 下方新增 `ProgressBar`（宽 300、高 16，`max_value=100`）。
- [ ] **Step 2:** `Main.gd` 缓存引用，`_update_wave_label` 中设 `value = current/total*100`。
- [ ] **Step 3:** 解析检查 + 试玩。Commit：`feat(godot): HUD 波次进度条`

---

### Task A: 弹道机制（寒冰减速 / 猫尾穿透 / 双发两弹）

**Files:**
- Modify: `godot_project/Projectile.gd`（携带 `slow_factor`/`slow_duration`/`penetrate`）
- Modify: `godot_project/Plant.gd`（`shots_per_fire` 多发；传递弹道属性）
- Modify: `godot_project/Zombie.gd`（新增 `apply_slow`）
- Modify: `godot_project/Main.gd`（`shoot_projectile` 签名扩展）

- [ ] **Step 1:** `Zombie.gd` 新增 `apply_slow(factor, duration)`，`_process` 中按 `slow_factor` 缩放移动速度，计时结束恢复。
- [ ] **Step 2:** `Projectile.gd` 新增 `slow_factor`/`slow_duration`/`penetrate` 字段；命中后若 `penetrate` 不销毁，否则销毁；命中调用 `zombie.apply_slow(...)`。
- [ ] **Step 3:** `Plant.gd` 射手分支按 `shots_per_fire` 循环发射（repeater=2）。
- [ ] **Step 4:** `Main.gd` `shoot_projectile` 扩展参数并透传。
- [ ] **Step 5:** 解析检查 + 试玩（寒冰减速可见、猫尾一弹多杀、双发两弹）。Commit：`feat(godot): 弹道机制（寒冰减速/猫尾穿透/双发两弹）`

---

### Task B: 卡片冷却系统

**Files:**
- Modify: `godot_project/PlantTypes.gd`（每植物新增 `cooldown` 毫秒值）
- Modify: `godot_project/PlantCard.gd`（冷却遮罩 + 倒计时文本）
- Modify: `godot_project/PlantBar.gd`（冷却状态管理/更新）
- Modify: `godot_project/Main.gd`（放置后触发冷却；每帧驱动；暂停冻结）

- [ ] **Step 1:** `PlantTypes.gd` 加 `cooldown`（向日葵5000/豌豆5000/寒冰7000/坚果10000/樱桃15000/双发7000/猫尾3000/魅惑5000/蘑菇3000/爆炸20000/双射8000）。
- [ ] **Step 2:** `PlantCard.gd` 新增 `start_cooldown(ms)` / `_process` 倒计时 / 显示剩余秒数 + 变暗。
- [ ] **Step 3:** `PlantBar.gd` 暴露 `start_cooldown(type)`、`is_on_cooldown(type)`。
- [ ] **Step 4:** `Main.gd` `_try_place_plant` 成功后调用；卡片点击前检查冷却。
- [ ] **Step 5:** 解析检查 + 试玩。Commit：`feat(godot): 植物卡片冷却系统`

---

### Task F: 小推车可见精灵

**Files:**
- Modify: `godot_project/Main.gd`（为每行小推车创建程序化 Sprite，使用后隐藏）

- [ ] **Step 1:** 程序化绘制小推车纹理（复用像素绘制手法），每行左侧放置 Sprite。
- [ ] **Step 2:** `zombie_reached` 触发后隐藏该行小推车 Sprite。
- [ ] **Step 3:** 解析检查 + 试玩。Commit：`feat(godot): 小推车可见精灵`

---

### Task D: 音效系统 + 静音开关

**Files:**
- Create: `godot_project/Sound.gd`（autoload，运行时合成）
- Modify: `godot_project/project.godot`（注册 `Sound` autoload）
- Modify: `godot_project/Main.gd`/`Plant.gd`/`Zombie.gd`/`Projectile.gd`（触发点）
- Modify: `godot_project/HUD.tscn`（静音按钮）

- [ ] **Step 1:** 新建 `Sound.gd`：`AudioStreamGenerator` 播放合成波形；实现 11 个音效方法，照搬 `js/sound.js` 的频率/时长/波形/音量。
- [ ] **Step 2:** 注册 autoload。
- [ ] **Step 3:** 在对应位置插入调用（click/placePlant/collectSun/shoot/zombieHit/zombieEat/zombieDie/explosion/waveStart/win/lose）。
- [ ] **Step 4:** HUD 加静音切换按钮，绑定 `Sound.set_enabled`。
- [ ] **Step 5:** 解析检查 + 试玩。Commit：`feat(godot): 运行时合成音效系统 + 静音开关`

---

## 执行顺序

E → C → A → B → F → D（先易后难，音效最复杂放最后）。

全部完成后：浏览器回归 `npm test` 13/13 全绿。
