# Godot 全功能同步实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把浏览器版全部功能同步到 Godot 版（夜间第 9 关、魅惑修复、撑杆跳跃、读报加速、小推车、铲子、暂停、检查点、夜间视觉、关卡选择 UI + 胜利结算流程）。

**Architecture:** 数据层在 `Levels.gd`/`ZombieTypes.gd`（autoload 单例）；实体行为在 `Zombie.gd`/`Plant.gd`；机制与 UI 在 `Main.gd`/`HUD.tscn`。每个任务独立可验证（手动运行 Godot），独立 commit。

**Tech Stack:** Godot 4.7 GDScript（`godot_project/`），无测试框架，手动验证。

**Spec:** `docs/superpowers/specs/2026-09-20-godot-full-sync-design.md`

## 全局约束

- Godot 4.7；Autoloads：`Input`/`PlantTypes`/`ZombieTypes`/`Levels`（均已注册，无需改 `project.godot`）。
- 所有数值（HP/速度/延迟/波次）必须来自 `Levels.gd`/`ZombieTypes.gd` 单例，不硬编码在实体脚本。
- 关卡延迟单位：浏览器为毫秒、Godot 为秒，换算 `delay_s = delay_ms / 1000`。
- 网格 5 行 × 9 列（`Grid.gd` rows=5），僵尸随机行 `randi() % 5`。
- 浏览器文件零改动；`npm test` 13/13 必须保持全绿（回归红线）。
- `docs/` 在 .gitignore，提交 spec/plan 用 `git add -f`。
- PowerShell：命令用 `;` 分隔，不用 `&&`。
- 中文注释/标识符约定（Godot 版现有代码已是中文注释，保持）。

---

### Task 1: Levels.gd 新增第 9 关（夜间）

**Files:**
- Modify: `godot_project/Levels.gd`

**Interfaces:**
- Consumes: 浏览器 `js/config.js` `LEVELS[9]`（3 波：7/11/14 僵尸，delay 毫秒）
- Produces: `Levels.get_level(9)` → `{id:9, name:'第九关：夜幕降临', start_sun:150, night:true, waves:[...]}`；`Levels.all_ids()` 返回 1..9

- [ ] **Step 1: 在第 8 关之后插入第 9 关**

在 `Levels.gd` 的 levels 字典 8 关定义之后追加（delay 已换算为秒，四舍五入保留 2 位）：

```gdscript
    9: {
        "id": 9,
        "name": "第九关：夜幕降临",
        "start_sun": 150,
        "night": true,
        "waves": [
            [
                {"type": "bucket", "delay": 0.0},
                {"type": "pole_vault", "delay": 1.5},
                {"type": "newspaper", "delay": 3.0},
                {"type": "bucket", "delay": 4.5},
                {"type": "runner", "delay": 6.0},
                {"type": "pole_vault", "delay": 7.5},
                {"type": "newspaper", "delay": 9.0},
            ],
            [
                {"type": "bucket", "delay": 0.0},
                {"type": "pole_vault", "delay": 1.0},
                {"type": "newspaper", "delay": 2.0},
                {"type": "bucket", "delay": 3.0},
                {"type": "runner", "delay": 4.0},
                {"type": "pole_vault", "delay": 5.0},
                {"type": "newspaper", "delay": 6.0},
                {"type": "cone", "delay": 7.0},
                {"type": "bucket", "delay": 8.0},
                {"type": "pole_vault", "delay": 9.0},
                {"type": "newspaper", "delay": 10.0},
            ],
            [
                {"type": "bucket", "delay": 0.0},
                {"type": "pole_vault", "delay": 0.7},
                {"type": "newspaper", "delay": 1.4},
                {"type": "bucket", "delay": 2.1},
                {"type": "runner", "delay": 2.8},
                {"type": "pole_vault", "delay": 3.5},
                {"type": "newspaper", "delay": 4.2},
                {"type": "bucket", "delay": 4.9},
                {"type": "runner", "delay": 5.6},
                {"type": "pole_vault", "delay": 6.3},
                {"type": "cone", "delay": 7.0},
                {"type": "newspaper", "delay": 7.7},
                {"type": "bucket", "delay": 8.4},
                {"type": "pole_vault", "delay": 9.1},
            ],
        ],
    },
```

- [ ] **Step 2: 验证数据**

Run: `godot --headless --script res://godot_test/scenes/verify_level9.gd`（或临时 script）断言 `Levels.get_level(9)["night"] == true`、3 波僵尸数 7/11/14、`all_ids()` 最大为 9。
Expected: 全部通过。

- [ ] **Step 3: Commit**

```powershell
git add godot_project/Levels.gd
git commit -m "feat(godot): 新增第 9 关夜间关卡数据（delay 秒制）"
```

---

### Task 2: Zombie.gd 行为缺口（魅惑/撑杆/读报）

**Files:**
- Modify: `godot_project/Zombie.gd`

**Interfaces:**
- Consumes: `ZombieTypes.get_type(type_id)` 中的 `jump_over_plant`/`newspaper_behavior`/`speed_after_hit`
- Produces: `zombie.is_ally: bool`、`zombie.set_charmed(ally: bool)`、`zombie.is_killed() -> bool`（已存在）

- [ ] **Step 1: 新增字段与 set_charmed**

```gdscript
var is_ally: bool = false
var _jumped: bool = false          # 撑杆是否已跳跃
var _newspaper_hit: bool = false  # 读报是否已首次被击
var _news_speed: float = 0.0      # 读报加速后的速度

func set_charmed(ally: bool) -> void:
    is_ally = ally
    eating = false
    target_plant = null
```

- [ ] **Step 2: _process 按 is_ally 分支**

- 非 ally：现有左移逻辑；`position.x <= 0` 触发 `main.zombie_reached()`（小推车机制在 Task 6 接管）。
- ally：`position.x += speed * delta` 右移；不找植物目标；到达 `size.x + 50` 则 `queue_free()`（不计分，`is_killed()` 保持 false）。

- [ ] **Step 3: 撑杆跳跃**

在 `_find_target_plant` 命中目标时：若 `jump_over_plant` 且 `_jumped == false` → `_jumped = true`，`speed += 20.0`（短暂冲刺越过，持续约 1 秒后回落原速；用 `var _jump_timer` 计时）。

- [ ] **Step 4: 读报加速**

`take_damage()` 中：若 `newspaper_behavior` 且 `_newspaper_hit == false` → `_newspaper_hit = true`，`speed = _news_speed`（取自 `ZombieTypes.get_type(type_id)["speed_after_hit"]`，默认 30）。

- [ ] **Step 5: 验证**

手动运行 Godot：魅惑菇附近生成僵尸 → 变蓝/反转右行；撑杆近植物时加速越过；读报中一豌豆后明显加速。
Expected: 三项行为可见。

- [ ] **Step 6: Commit**

```powershell
git add godot_project/Zombie.gd
git commit -m "feat(godot): 僵尸行为——魅惑反转/撑杆跳跃/读报加速"
```

---

### Task 3: Plant.gd 目标选择截断修复

**Files:**
- Modify: `godot_project/Plant.gd`（`_get_target_zombie`，约 178 行起）

**Interfaces:**
- Consumes: `main.get_zombies()`、僵尸 `row_index`/`position`/`_dead`
- Produces: 本行射程内**最近**的活僵尸（浏览器 `getFirstZombieInRow` 语义）

- [ ] **Step 1: 改为取最近**

```gdscript
func _get_target_zombie() -> Node:
    var main = get_tree().get_first_node_in_group("main")
    if main == null:
        return null
    var best: Node = null
    var best_dist: float = 1e9
    for z in main.get_zombies():
        if z.get("row_index") != row:
            continue
        if z.get("_dead", false):
            continue
        var dist: float = z.position.distance_to(position)
        if dist < best_dist:
            best_dist = dist
            best = z
    return best
```

（若浏览器版有射程限制，追加 `if dist > shot_range: continue`；shot_range 取豌豆射程 400 或 `type.get("shot_range", 400)`。）

- [ ] **Step 2: 验证**

手动：同行放 2 只僵尸（一远一近），豌豆命中近者。
Expected: 近者被击中。

- [ ] **Step 3: Commit**

```powershell
git add godot_project/Plant.gd
git commit -m "fix(godot): 植物目标选择取本行最近僵尸（修复截断）"
```

---

### Task 4: 夜间视觉（深色背景 + 静态星空）

**Files:**
- Modify: `godot_project/Main.gd`（`_reset_level_state` 及新 `_apply_night_visuals()`）
- Modify: `godot_project/Main.tscn`（新增 `NightSky` 节点：深色 ColorRect + 若干星点 Sprite2D/Label，默认隐藏）

**Interfaces:**
- Consumes: `current_level.get("night", false)`
- Produces: 夜间战场深色视觉；白天不变

- [ ] **Step 1: 在 Main.tscn 添加 NightSky 节点**

- `NightSky/BackRect`：ColorRect，size (960,600)，color `#1a237e→#0d1b2a` 近似用单色 `Color(0.08,0.09,0.16)`，默认 `visible=false`。
- `NightSky/Stars`：Container 内 8–12 个白色小点（Label "*" 或 Sprite2D），随机散布，默认隐藏。

- [ ] **Step 2: Main.gd 切换**

```gdscript
func _apply_night_visuals() -> void:
    var night: bool = current_level.get("night", false)
    $NightSky/BackRect.visible = night
    for star in $NightSky/Stars.get_children():
        star.visible = night
    $Background.color = Color(0.05, 0.06, 0.13) if night else Color(0.1, 0.3, 0.1)
```

在 `_reset_level_state()` 末尾调用。

- [ ] **Step 3: 夜间跳过天空掉阳光**

`_process` 中：`if not current_level.get("night", false): sun_fall_timer += delta ...`（对齐浏览器 `isNightLevel` 逻辑）。

- [ ] **Step 4: 验证**

进第 9 关：深色背景 + 星点，无天空阳光；回第 1 关恢复正常。
Expected: 视觉差异可感知。

- [ ] **Step 5: Commit**

```powershell
git add godot_project/Main.gd godot_project/Main.tscn
git commit -m "feat(godot): 夜间关卡视觉（深色背景+星空）与天空阳光禁用"
```

---

### Task 5: 小推车（mower）机制

**Files:**
- Modify: `godot_project/Main.gd`
- Create: `godot_project/Mower.gd` + 对应节点（或 Main 内管理 5 个小推车 Node2D）

**Interfaces:**
- Consumes: 僵尸 `row_index`/`position.x`
- Produces: `mowers_available: Array[bool]`（5 行各一次）；`main.zombie_reached(row)` 语义变更：先查小推车

- [ ] **Step 1: Main.gd 增加小推车状态**

```gdscript
var mowers_available: Array = [true, true, true, true, true]
```

关卡开始（`_reset_level_state`）时重置为全 true。

- [ ] **Step 2: 僵尸到达最左时触发清行**

`zombie_reached()` 改为 `zombie_reached(row: int)`：

```gdscript
func zombie_reached(row: int) -> void:
    if mowers_available[row]:
        mowers_available[row] = false
        _clear_row_zombies(row)  # 本行全部僵尸 queue_free，每只计入 score
        print("Mower triggered in row ", row)
        return
    _game_over()  # 原失败流程
```

Zombie.gd 到达 x<=0 时调用 `main.zombie_reached(row_index)`（替换原 `main.zombie_reached()`）。

- [ ] **Step 3: 小推车节点（可选视觉）**

每行最左生成一个小推车 Node2D（占位色块），触发后 `queue_free()`。

- [ ] **Step 4: 验证**

手动：放一只僵尸走到底 → 该行小推车消耗、行内僵尸清空、不失败；5 行小推车耗尽后再放僵尸 → 失败。
Expected: 行为正确。

- [ ] **Step 5: Commit**

```powershell
git add godot_project/Main.gd godot_project/Mower.gd godot_project/Zombie.gd
git commit -m "feat(godot): 小推车每行一次性清行保险"
```

---

### Task 6: 铲子（shovel）HUD 按钮

**Files:**
- Modify: `godot_project/HUD.tscn`（新增 ShovelButton）
- Modify: `godot_project/Main.gd`（`shovel_mode: bool`、`_on_shovel_toggled`、点击逻辑）

**Interfaces:**
- Produces: 铲子模式下点击植物 → 铲除并 `sun += int(cost * 0.5)`

- [ ] **Step 1: HUD 加按钮**

`HUD.tscn` 新增 `ShovelButton`（Button，text "🪏"），signal `shovel_pressed`。

- [ ] **Step 2: Main.gd 铲子模式**

```gdscript
var shovel_mode: bool = false

func _on_shovel_pressed() -> void:
    shovel_mode = not shovel_mode
    # 铲子模式下屏蔽种植：_unhandled_input 中若 shovel_mode 则优先执行铲除
```

`_unhandled_input` 左键：若 `shovel_mode` → 用 `occupied_cells`/grid 反查该格植物，`sun += int(PlantTypes.get_type(plant.type_id).get("cost",0) * 0.5)`，植物 `queue_free()`，清除 `occupied_cells` 条目，`shovel_mode = false`（用完一次即退出，或保持模式直到再点按钮——按浏览器语义：浏览器点击植物即铲除后退出模式）。

- [ ] **Step 3: 验证**

手动：点铲子按钮 → 点向日葵 → 向日葵消失、阳光 +50%（向日葵 50 → +25）。
Expected: 正确回收。

- [ ] **Step 4: Commit**

```powershell
git add godot_project/HUD.tscn godot_project/Main.gd
git commit -m "feat(godot): 铲子 HUD 按钮 + 铲除植物回收 50% 阳光"
```

---

### Task 7: 暂停（键盘 + HUD 按钮）

**Files:**
- Modify: `godot_project/Main.gd`（`is_paused`、`_toggle_pause`、输入）
- Modify: `godot_project/HUD.tscn`（新增 PauseButton）

**Interfaces:**
- Produces: `is_paused: bool`；暂停期间 `_process` 各实体不推进，HUD 可操作

- [ ] **Step 1: is_paused + 门控**

```gdscript
var is_paused: bool = false
func _process(delta: float) -> void:
    if not game_started or is_paused:
        return
    ...
```

实体用 `get_tree().paused = is_paused` + 各实体 `process_mode = PROCESS_MODE_WHEN_PAUSED` 按需（僵尸/植物设 `PROCESS_MODE_PAUSABLE` 默认即可，Tree 暂停时自动冻结）。

- [ ] **Step 2: 键盘 + 按钮**

`_unhandled_input` 处理 Esc/P → `_toggle_pause()`；HUD PauseButton signal → 同。暂停时显示 "已暂停" Label（HUD 新增）。

- [ ] **Step 3: 验证**

手动：Esc/按钮 → 画面静止，再按恢复。
Expected: 暂停/恢复正确。

- [ ] **Step 4: Commit**

```powershell
git add godot_project/Main.gd godot_project/HUD.tscn
git commit -m "feat(godot): 暂停机制（键盘 Esc/P + HUD 按钮）"
```

---

### Task 8: 检查点存档扩展

**Files:**
- Modify: `godot_project/Main.gd`（`_save_checkpoint`/`_load_checkpoint`、失败流程加"从检查点恢复"入口）
- 存储：`user://checkpoint.cfg`（JSON 或 ConfigFile）

**Interfaces:**
- Produces: 每关中段（`waveIndex == floor(total_waves/2)`）自动快照 `{level_id, wave_index, sun, plants:[{type,row,col}], zombies:[{type,row,x,hp}]}`；失败面板提供"从检查点恢复"按钮

- [ ] **Step 1: 快照/恢复函数**

在 `_start_wave_prepare()` 处判断 `current_wave_index == int(current_level["waves"].size() / 2)` → `_save_checkpoint()`。

`_load_checkpoint()`：清场 → 恢复 sun/wave/plants/zombies 状态。

- [ ] **Step 2: 失败流程接入**

`_game_over()` 时：若存在本关检查点 → 显示"从检查点恢复 / 重开本关 / 返回菜单"；否则原流程。

- [ ] **Step 3: 验证**

手动：打到中段 → 故意失败 → 从检查点恢复，波次/阳光/植物状态正确。
Expected: 恢复无误。

- [ ] **Step 4: Commit**

```powershell
git add godot_project/Main.gd
git commit -m "feat(godot): 检查点存档（中段自动快照 + 失败恢复入口）"
```

---

### Task 9: 关卡选择 UI + 胜利结算流程

**Files:**
- Modify: `godot_project/Menu.gd`/`Menu.tscn`（或新建 `LevelSelect` 场景挂到 MenuUI）
- Modify: `godot_project/Main.gd`（`_on_level_won` 改造、`_show_result_screen`、`_select_level(id)`）

**Interfaces:**
- Produces: 关卡选择面板（已解锁可选、未解锁置灰，解锁状态来自 `_load_progress` 的 `unlocked_level`）；胜利后结算画面（得分 + 奖励 + "进入下一关"按钮；最后一关显示通关文案 + "返回菜单"）；`_on_level_won` 不再自动推进

- [ ] **Step 1: _on_level_won 改造**

移除自动 `current_level_id += 1` 推进；改为：

```gdscript
func _on_level_won() -> void:
    game_won = true
    last_bonus = 500 + sun / 10
    score += last_bonus
    _save_progress()  # 解锁下一关
    _show_result_screen()
```

`_show_result_screen()`：显示本关得分/奖励；若非末关 → "进入下一关"按钮调用 `_select_level(current_level_id + 1)`；末关 → 通关文案 + "返回菜单"。

- [ ] **Step 2: 关卡选择面板**

`MenuUI` 下新增 `LevelSelect`（PanelContainer + 9 个按钮）：

```gdscript
func _build_level_select() -> void:
    for i in range(1, Levels.all_ids().size() + 1):
        var btn := Button.new()
        btn.text = str(i)
        var locked: bool = i > _load_unlocked_level()
        btn.disabled = locked
        btn.modulate = Color(0.5, 0.5, 0.5) if locked else Color.WHITE
        btn.pressed.connect(_select_level.bind(i))
        $MenuUI/LevelSelect.add_child(btn)
```

- [ ] **Step 3: 验证**

手动：第 1 关胜利 → 结算画面出现，手动点"下一关"；返回菜单 → 关卡 2 已解锁可选；未通关关卡置灰。
Expected: 流程正确。

- [ ] **Step 4: Commit**

```powershell
git add godot_project/Main.gd godot_project/Menu.gd godot_project/Menu.tscn
git commit -m "feat(godot): 关卡选择面板 + 胜利结算画面（停止自动推进）"
```

---

## 执行与验证顺序

Task 1 → 2 → 3 → 4 → 5 → 6 → 7 → 8 → 9 顺序执行（依赖：Task 2 魅惑依赖 Task 3 无需前置；Task 5 小推车替换 zombie_reached 失败流程；Task 9 依赖 _save_progress 解锁状态）。

每个任务完成后：手动运行 `godot --headless -r res://godot_project`（或编辑器 F5）确认无脚本错误，再 commit。

全部完成后：浏览器回归 `npm test` 13/13 全绿（确认浏览器文件零改动）。

---

## ✅ 完成状态（2026-09-24 复核）

Task 1–9 **全部已在代码中实现**（各复选框见对应任务段落，实际代码位置见下表）。复核证据：

| Task | 内容 | 代码位置 |
|---|---|---|
| 1 | 夜间第 9 关 | `Levels.gd` levels[9] |
| 2 | 僵尸行为（魅惑/撑杆/读报） | `Zombie.gd` is_ally 分支、jump_over_plant、newspaper_behavior |
| 3 | 植物取最近僵尸 | `Plant.gd _get_target_zombie` |
| 4 | 夜间视觉 + 停掉天空阳光 | `Main.gd _apply_night_visuals`、`Main.tscn NightSky` |
| 5 | 小推车（每行一次） | `Main.gd mowers_available`/`zombie_reached` |
| 6 | 铲子按钮 + 50% 退款 | `HUD.tscn ShovelButton`、`Main.gd _remove_plant_with_refund` |
| 7 | 暂停（Esc/P + 按钮） | `Main.gd _toggle_pause`、`HUD.tscn PauseButton` |
| 8 | 检查点存档/恢复 | `Main.gd _save_checkpoint`/`_load_checkpoint` |
| 9 | 关卡选择 + 胜利结算 | `Menu.gd`、`Main.gd _show_result_screen` |

**后续差距补齐**（本计划未覆盖的 Godot 侧缺口）见：`docs/superpowers/plans/2026-09-24-godot-parity-gaps.md`（Task E/C/A/B/F/D 已全部实现并提交）。
