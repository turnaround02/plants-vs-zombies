# 植物大战僵尸游戏扩展实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 扩展浏览器版游戏（新增3种僵尸、3种植物、关卡扩至8关、得分系统、存档系统、视觉反馈打磨），然后将全部功能同步到 Godot 版本。

**Architecture:** 浏览器版为全局 JS 类 + config 数据驱动，新实体/行为通过 `PLANT_TYPES`/`ZOMBIE_TYPES` 字典扩展，`Game` 类管理实体数组，`LevelManager` 管理波次状态机。存档使用 localStorage，得分在 `Game` 中累计并暴露给 UI。Godot 版通过扩展 `PlantTypes` 字典 + 新建 `ZombieTypes` 单例 + 修复截断函数来对齐。

**Tech Stack:** 浏览器版：原生 JS + Canvas 2D + Web Audio API + localStorage（无构建工具）；Godot 版：Godot 4.7 GDScript。

**Spec:** 本计划本身即 spec（brainstorming 阶段已就所有设计决策达成共识）。

## 全局约束

- 浏览器版所有 JS 为全局作用域，通过 `index.html` 中 `<script>` 标签按严格顺序加载：`config.js → sound.js → plants.js → zombies.js → level.js → game.js → ui.js → main.js`。
- 所有游戏数值（HP、速度、成本、波次时间线）必须放在 `js/config.js`，不得硬编码在实体类中。
- 浏览器版代码注释和标识符使用中文，保持该约定。
- 测试使用 `test/headless-test.js`（Puppeteer E2E，无测试框架），启动 `python -m http.server` 或 `npm test`。
- `dt` 单位为毫秒；每秒速率用 `dt/1000`。
- Godot 版 Autoload 只有 `Input`（`InputManager.gd`），`PlantTypes` 未在 `project.godot` 注册——同步时需注册。
- Godot 版存在截断函数 bug（`Plant.gd` 的 `_get_target_zombie`、`Projectile.gd` 的碰撞循环），同步前必须修复。

## 文件结构映射

### 浏览器版

| 文件 | 职责 | 本计划修改 |
|------|------|-----------|
| `js/config.js` | CONFIG/PLANT_TYPES/ZOMBIE_TYPES/LEVELS 全局数据 | 新增3僵尸+3植物+2关卡+存档配置常量 |
| `js/plants.js` | Plant 类，按 `type.behavior` 分发 | 新增 mushroom/explosiveShroom/dualPea 渲染+行为 |
| `js/zombies.js` | Zombie 类 | 新增 bucket/poleVault/newspaper 行为+渲染 |
| `js/level.js` | LevelManager 状态机 | 支持关卡解锁+检查点 |
| `js/game.js` | Game 类，实体数组+碰撞查询 | 得分累计+存档快照+新僵尸碰撞处理 |
| `js/ui.js` | UI 类 | 得分显示+关卡解锁置灰+结果页统计 |
| `index.html` | DOM 结构+script 顺序 | 新增得分 HUD+结果统计元素 |
| `css/style.css` | 样式 | 得分样式+锁定关卡样式 |

### Godot 版

| 文件 | 职责 | 本计划修改 |
|------|------|-----------|
| `godot_project/PlantTypes.gd` | 植物字典 | 扩至11种+注册 autoload |
| `godot_project/Plant.gd` | 植物行为分发 | 修复截断+新增 bomb/charm/shooter 分支 |
| `godot_project/Zombie.gd` | 僵尸 | 新增类型字段+行为 |
| `godot_project/Main.gd` | 主控 | 关卡系统+得分+胜利状态+存档 |
| `godot_project/ZombieTypes.gd`（新建） | 僵尸字典 | 6种僵尸 |
| `godot_project/Levels.gd`（新建） | 关卡数据 | 8关 LEVELS |

---

## 阶段一：浏览器版扩展

### Task 1: 新增僵尸配置（铁桶/撑杆/读报）

**Files:**
- Modify: `js/config.js`（`ZOMBIE_TYPES` 字典，约第 162-195 行）

**Interfaces:**
- Produces: `ZOMBIE_TYPES.bucket`（铁桶僵尸）、`ZOMBIE_TYPES.poleVault`（撑杆僵尸）、`ZOMBIE_TYPES.newspaper`（读报僵尸）。各含 `id/name/icon/hp/speed/damage/attackInterval/color/score`，另加 `jumpOverPlant`（撑杆）、`newspaperBehavior`（读报）标志。
- Consumes: 无（纯数据，依赖已有 `ZOMBIE_TYPES` 结构）

- [ ] **Step 1: 在 `ZOMBIE_TYPES` 末尾追加 3 种僵尸**

在 `js/config.js` 中 `runner` 定义之后、字典闭合 `};` 之前插入：

```js
  bucket: {
    id: 'bucket',
    name: '铁桶僵尸',
    icon: '🪣',
    hp: 400,
    speed: 16,
    damage: 12,
    attackInterval: 1000,
    color: '#9e9e9e',
    score: 30,
  },
  poleVault: {
    id: 'poleVault',
    name: '撑杆僵尸',
    icon: '🤸',
    hp: 80,
    speed: 45,
    damage: 8,
    attackInterval: 800,
    color: '#ff9800',
    score: 25,
    jumpOverPlant: true, // 冲刺到植物前跳跃越过第一排
  },
  newspaper: {
    id: 'newspaper',
    name: '读报僵尸',
    icon: '📰',
    hp: 130,
    speed: 18,
    damage: 10,
    attackInterval: 800,
    color: '#ffb74d',
    score: 20,
    newspaperBehavior: true, // 被击后丢报纸加速
    speedAfterHit: 30,       // 被首次命中后的加速值
  },
```

- [ ] **Step 2: 验证 config.js 可被加载**

Run: `node -e "require('./js/config.js')"` （若失败改用浏览器控制台）

Expected: 无语法错误。`ZOMBIE_TYPES` 含 6 种僵尸。

- [ ] **Step 3: Commit**

```bash
git add js/config.js
git commit -m "feat(config): 新增铁桶/撑杆/读报僵尸配置"
```

---

### Task 2: 僵尸新行为实现（跳跃/读报加速）

**Files:**
- Modify: `js/zombies.js`（`Zombie` 类 `update` 方法约第 30-75 行；`renderBody` 约第 150-230 行）

**Interfaces:**
- Consumes: `ZOMBIE_TYPES.poleVault.jumpOverPlant`、`ZOMBIE_TYPES.newspaper.newspaperBehavior`、`speedAfterHit`。`game.getPlantAt(row, x)` 返回前方植物。
- Produces: 撑杆僵尸在冲刺到植物前跳跃越过；读报僵尸被首次命中后 `speed = speedAfterHit` 且丢报纸。

- [ ] **Step 1: 在 Zombie 构造函数中添加新状态字段**

在 `js/zombies.js` 的 `constructor` 中，`this.isAlly = false;` 行之后追加：

```js
    this.hasTakenHit = false;   // 读报僵尸是否已被首次命中
    this.isVaulting = false;    // 撑杆僵尸跳跃标志
```

- [ ] **Step 2: 在 takeDamage 中处理读报僵尸首次命中加速**

在 `takeDamage(dmg)` 方法中，`this.hp -= dmg;` 之后、`if (this.hp <= 0...)` 之前插入：

```js
    // 读报僵尸：首次被命中后丢报纸加速
    if (this.type.newspaperBehavior && !this.hasTakenHit) {
      this.hasTakenHit = true;
      this.speed = this.type.speedAfterHit;
    }
```

- [ ] **Step 3: 实现撑杆僵尸跳跃逻辑**

在 `update(dt, game)` 方法中，原本"前方有植物则啃食"的分支（`const plant = game.getPlantAt(this.row, this.x);` 之后）改为：若为撑杆僵尸且植物存在，则跳跃越过：

```js
      const plant = game.getPlantAt(this.row, this.x);
      if (plant) {
        // 撑杆僵尸：跳跃越过第一排植物（不啃食）
        if (this.type.jumpOverPlant && !this.isVaulting) {
          this.isVaulting = true;
          // 跳跃：快速越过该植物位置
          this.x -= (plant.x - this.x + 40) + 60; // 越过并继续前进
          this.isVaulting = false;
          this.walkPhase += dt / 50; // 跳跃动画加速
          return;
        }
        if (plant.type.behavior === 'charm') {
          plant.alive = false;
          this.isAlly = true;
          Sound.zombieDie();
          return;
        }
        if (!this.isAlly) {
          this.eating = true;
          this.attackTimer += dt;
          if (this.attackTimer >= this.type.attackInterval) {
            this.attackTimer = 0;
            plant.takeDamage(this.type.damage);
            Sound.zombieEat();
          }
        }
      }
```

- [ ] **Step 4: 在 renderBody 中添加新僵尸外观**

在 `renderBody` 方法中，`if (isRunner)` 头发块之后追加：

```js
    // 铁桶僵尸（灰色铁桶罩头）
    if (this.typeId === 'bucket') {
      ctx.fillStyle = '#9e9e9e';
      ctx.beginPath();
      ctx.ellipse(x, y - 28, 13, 16, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#757575';
      ctx.fillRect(x - 13, y - 30, 26, 4);
      ctx.fillStyle = '#bdbdbd';
      ctx.fillRect(x - 2, y - 34, 4, 12); // 桶上铆钉高光
    }

    // 撑杆僵尸（橙色运动装+撑杆）
    if (this.typeId === 'poleVault') {
      ctx.fillStyle = '#ff9800';
      ctx.beginPath();
      ctx.ellipse(x, y + 4, 13, 12, 0, 0, Math.PI * 2);
      ctx.fill();
      // 撑杆
      ctx.strokeStyle = '#616161';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(x + 10, y - 30);
      ctx.lineTo(x + 22, y + 28);
      ctx.stroke();
    }

    // 读报僵尸（报纸遮脸）
    if (this.typeId === 'newspaper') {
      if (!this.hasTakenHit) {
        // 拿着报纸遮脸
        ctx.fillStyle = '#fff8e1';
        ctx.fillRect(x + 2, y - 30, 14, 18);
        ctx.strokeStyle = '#9e9e9e';
        ctx.lineWidth = 1;
        ctx.strokeRect(x + 2, y - 30, 14, 18);
        // 报纸文字线
        ctx.strokeStyle = '#616161';
        ctx.beginPath();
        ctx.moveTo(x + 4, y - 26); ctx.lineTo(x + 14, y - 26);
        ctx.moveTo(x + 4, y - 22); ctx.lineTo(x + 14, y - 22);
        ctx.moveTo(x + 4, y - 18); ctx.lineTo(x + 14, y - 18);
        ctx.stroke();
      }
    }
```

- [ ] **Step 5: 运行 headless 测试验证无报错**

Run: `npm test`

Expected: 所有断言通过，无 `页面异常` 报错。

- [ ] **Step 6: Commit**

```bash
git add js/zombies.js
git commit -m "feat(zombies): 实现铁桶/撑杆跳跃/读报加速行为"
```

---

### Task 3: 新增植物配置（蘑菇类/爆炸菇/双射豌豆）

**Files:**
- Modify: `js/config.js`（`PLANT_TYPES` 字典，约第 35-155 行）

**Interfaces:**
- Produces: `PLANT_TYPES.mushroomShooter`（蘑菇类快射，behavior='shooter'）、`PLANT_TYPES.explosiveShroom`（爆炸菇，behavior='bomb'）、`PLANT_TYPES.dualPea`（双射豌豆，behavior='shooter'，新增 `dualRow: true` 标志覆盖相邻两行）。
- Consumes: 无（纯数据）

- [ ] **Step 1: 在 `PLANT_TYPES` 末尾追加 3 种植物**

在 `chaosShroom` 定义之后、字典闭合 `};` 之前插入：

```js
  mushroomShooter: {
    id: 'mushroomShooter',
    name: '蘑菇射手',
    icon: '🍄‍🟫',
    cost: 30,
    hp: 40,
    cooldown: 3000,
    color: '#8d6e63',
    description: '便宜快射，高频低攻',
    behavior: 'shooter',
    damage: 10,
    fireInterval: 1000,
    range: 350,
    projectileSpeed: 280,
    projectileColor: '#a1887f',
  },
  explosiveShroom: {
    id: 'explosiveShroom',
    name: '爆炸菇',
    icon: '💥',
    cost: 225,
    hp: 60,
    cooldown: 20000,
    color: '#d32f2f',
    description: '大范围一次性爆炸',
    behavior: 'bomb',
    damage: 300,
    blastRadius: 180,
    fuseTime: 1500,
  },
  dualPea: {
    id: 'dualPea',
    name: '双射豌豆',
    icon: '⚡',
    cost: 150,
    hp: 100,
    cooldown: 8000,
    color: '#43a047',
    description: '攻击本行与相邻行',
    behavior: 'shooter',
    damage: 20,
    fireInterval: 1400,
    range: 400,
    projectileSpeed: 300,
    dualRow: true, // 覆盖相邻两行
  },
```

- [ ] **Step 2: 验证 config.js 可被加载**

Run: 浏览器控制台检查 `Object.keys(PLANT_TYPES).length === 11`

Expected: 11 种植物。

- [ ] **Step 3: Commit**

```bash
git add js/config.js
git commit -m "feat(config): 新增蘑菇射手/爆炸菇/双射豌豆配置"
```

---

### Task 4: 植物新行为实现（快射/爆炸/双行）

**Files:**
- Modify: `js/plants.js`（`Plant.updateShooter` 约第 57-78 行；`render` 方法约第 108-140 行；`renderBody` 系方法）

**Interfaces:**
- Consumes: `type.projectileColor`（蘑菇射手）、`type.dualRow`（双射豌豆）、`type.blastRadius`（爆炸菇，复用已有 bomb 行为）。
- Produces: 双射豌豆发射两发子弹（本行+相邻行）；蘑菇射手用 `projectileColor` 渲染弹；爆炸菇复用 `updateBomb`/`explode`。

- [ ] **Step 1: 修改 updateShooter 支持双行与自定义弹色**

在 `js/plants.js` 的 `updateShooter` 方法中，将发射子弹的 `for` 循环改为支持 `dualRow`：

```js
    this.fireTimer += dt;
    if (this.fireTimer >= this.type.fireInterval) {
      this.fireTimer = 0;
      const shots = this.type.shotsPerFire || 1;
      // 双射豌豆：同时覆盖本行与相邻行
      const targetRows = this.type.dualRow
        ? [this.row, this.row + 1]
        : [this.row];
      for (const tRow of targetRows) {
        if (tRow >= CONFIG.ROWS) continue;
        for (let i = 0; i < shots; i++) {
          const bulletColor = this.type.projectileColor
            || (this.type.slowFactor ? '#b3e5fc' : (this.type.charm ? '#ce93d8' : '#66bb6a'));
          game.spawnProjectile({
            x: this.x + 20,
            y: this.y - 5,
            row: tRow,
            damage: this.type.damage,
            speed: this.type.projectileSpeed,
            slowFactor: this.type.slowFactor || 0,
            slowDuration: this.type.slowDuration || 0,
            color: bulletColor,
            penetrate: this.type.penetrate || false,
            charm: this.type.charm || false,
          });
        }
      }
      Sound.shoot();
    }
```

- [ ] **Step 2: 在 render 方法中为新植物添加渲染分支**

在 `render` 的 `switch (this.type.behavior)` 的 `case 'shooter':` 块中，`renderShooter` 调用前增加蘑菇/双射判断：

```js
      case 'shooter':
        if (this.typeId === 'mushroomShooter') {
          this.renderMushroom(ctx, x, y + bob);
        } else if (this.typeId === 'dualPea') {
          this.renderDualPea(ctx, x, y + bob);
        } else if (this.type.penetrate) {
          this.renderCatTail(ctx, x, y + bob);
        } else if (this.type.charm) {
          this.renderChaosShroom(ctx, x, y + bob);
        } else {
          this.renderShooter(ctx, x, y + bob);
        }
        break;
```

- [ ] **Step 3: 添加 renderMushroom 和 renderDualPea 方法**

在 `plants.js` 中 `renderShooter` 方法之后追加：

```js
  renderMushroom(ctx, x, y) {
    // 蘑菇主体
    ctx.fillStyle = '#8d6e63';
    ctx.beginPath();
    ctx.ellipse(x, y + 10, 16, 8, 0, 0, Math.PI * 2);
    ctx.fill();
    // 蘑菇帽
    ctx.fillStyle = '#d7ccc8';
    ctx.beginPath();
    ctx.arc(x, y, 14, Math.PI, 0);
    ctx.fill();
    // 帽点
    ctx.fillStyle = '#a1887f';
    ctx.beginPath();
    ctx.arc(x - 6, y - 4, 3, 0, Math.PI * 2);
    ctx.arc(x + 5, y - 6, 3, 0, Math.PI * 2);
    ctx.fill();
    // 眼睛
    ctx.fillStyle = '#000';
    ctx.beginPath();
    ctx.arc(x - 4, y + 2, 2, 0, Math.PI * 2);
    ctx.arc(x + 4, y + 2, 2, 0, Math.PI * 2);
    ctx.fill();
  }

  renderDualPea(ctx, x, y) {
    // 双管豌豆：两个并列炮管
    ctx.strokeStyle = '#2e7d32';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(x, y + 15);
    ctx.lineTo(x, y + 30);
    ctx.stroke();
    const isDual = true;
    ctx.fillStyle = '#43a047';
    ctx.beginPath();
    ctx.arc(x, y, 15, 0, Math.PI * 2);
    ctx.fill();
    // 双炮管
    ctx.fillStyle = '#388e3c';
    ctx.fillRect(x + 6, y - 10, 18, 8);
    ctx.fillRect(x + 6, y + 2, 18, 8);
    ctx.beginPath();
    ctx.arc(x + 24, y - 6, 5, 0, Math.PI * 2);
    ctx.arc(x + 24, y + 6, 5, 0, Math.PI * 2);
    ctx.fill();
    // 闪电标记
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 10px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('⚡', x, y + 24);
  }
```

- [ ] **Step 4: 运行 headless 测试验证**

Run: `npm test`

Expected: 通过。新增 3 张卡片（总数 11）。

- [ ] **Step 5: 更新测试中植物卡片数量断言**

在 `test/headless-test.js` 中，将 `if (initState.plantCards !== 8)` 改为 `if (initState.plantCards !== 11)`。

- [ ] **Step 6: Commit**

```bash
git add js/plants.js test/headless-test.js
git commit -m "feat(plants): 实现蘑菇快射/爆炸菇/双射豌豆行为"
```

---

### Task 5: 关卡扩展至 8 关（引入新僵尸）

**Files:**
- Modify: `js/config.js`（`LEVELS` 字典，约第 200-590 行）

**Interfaces:**
- Produces: `LEVELS[7]`（第七关：铁桶与撑杆）、`LEVELS[8]`（第八关：最终铁桶防线）。现有 1-6 关保留。
- Consumes: 新僵尸类型 `bucket`/`poleVault`/`newspaper`。

- [ ] **Step 1: 在第 6 关之后追加第 7、8 关**

第 6 关定义以 `  },` 结尾（第 572 行），其后是 `};`（第 573 行）闭合 `LEVELS`。在第 6 关的 `  },` 之后、`};` 之前插入第 7、8 关（注意第 8 关末尾不加逗号，因为是最后一个键）：

```js
  7: {
    id: 7,
    name: '第七关：铁桶来袭',
    startSun: 300,
    waves: [
      {
        zombies: [
          { type: 'bucket', delay: 0 },
          { type: 'normal', delay: 2000 },
          { type: 'bucket', delay: 4000 },
          { type: 'newspaper', delay: 6000 },
          { type: 'cone', delay: 8000 },
          { type: 'bucket', delay: 10000 },
          { type: 'runner', delay: 12000 },
        ],
      },
      {
        zombies: [
          { type: 'poleVault', delay: 0 },
          { type: 'bucket', delay: 2000 },
          { type: 'newspaper', delay: 4000 },
          { type: 'poleVault', delay: 6000 },
          { type: 'bucket', delay: 8000 },
          { type: 'runner', delay: 10000 },
          { type: 'poleVault', delay: 12000 },
          { type: 'newspaper', delay: 14000 },
        ],
      },
      {
        zombies: [
          { type: 'bucket', delay: 0 },
          { type: 'poleVault', delay: 1000 },
          { type: 'newspaper', delay: 2000 },
          { type: 'bucket', delay: 3000 },
          { type: 'runner', delay: 4000 },
          { type: 'poleVault', delay: 5000 },
          { type: 'bucket', delay: 6000 },
          { type: 'newspaper', delay: 7000 },
          { type: 'cone', delay: 8000 },
          { type: 'poleVault', delay: 9000 },
          { type: 'runner', delay: 10000 },
        ],
      },
    ],
  },
  8: {
    id: 8,
    name: '第八关：最终铁桶防线',
    startSun: 325,
    waves: [
      {
        zombies: [
          { type: 'bucket', delay: 0 },
          { type: 'poleVault', delay: 1000 },
          { type: 'bucket', delay: 2000 },
          { type: 'newspaper', delay: 3000 },
          { type: 'bucket', delay: 4000 },
          { type: 'runner', delay: 5000 },
          { type: 'poleVault', delay: 6000 },
          { type: 'bucket', delay: 7000 },
          { type: 'newspaper', delay: 8000 },
        ],
      },
      {
        zombies: [
          { type: 'bucket', delay: 0 },
          { type: 'poleVault', delay: 800 },
          { type: 'bucket', delay: 1600 },
          { type: 'runner', delay: 2400 },
          { type: 'poleVault', delay: 3200 },
          { type: 'newspaper', delay: 4000 },
          { type: 'bucket', delay: 4800 },
          { type: 'poleVault', delay: 5600 },
          { type: 'newspaper', delay: 6400 },
          { type: 'bucket', delay: 7200 },
          { type: 'runner', delay: 8000 },
          { type: 'cone', delay: 8800 },
        ],
      },
      {
        zombies: [
          { type: 'bucket', delay: 0 },
          { type: 'poleVault', delay: 600 },
          { type: 'bucket', delay: 1200 },
          { type: 'newspaper', delay: 1800 },
          { type: 'poleVault', delay: 2400 },
          { type: 'runner', delay: 3000 },
          { type: 'bucket', delay: 3600 },
          { type: 'poleVault', delay: 4200 },
          { type: 'newspaper', delay: 4800 },
          { type: 'bucket', delay: 5400 },
          { type: 'runner', delay: 6000 },
          { type: 'poleVault', delay: 6600 },
          { type: 'cone', delay: 7200 },
          { type: 'newspaper', delay: 7800 },
        ],
      },
    ],
  },
```

（注意：第 8 关是 `LEVELS` 的最后一个键，其末尾的 `  },` 后面不加逗号，直接接 `};` 闭合。）

- [ ] **Step 2: 验证 LEVELS 含 8 关**

Run: 浏览器控制台 `Object.keys(LEVELS).length === 8`

Expected: 8 关。

- [ ] **Step 3: Commit**

```bash
git add js/config.js
git commit -m "feat(config): 扩展关卡至8关并引入新僵尸"
```

---

### Task 6: 得分系统（击杀+过关奖励+localStorage）

**Files:**
- Modify: `js/game.js`（`Game` 类：新增 `score`/`kills` 字段；`zombieReachedHouse`/`onAllWavesComplete`；子弹命中处）
- Modify: `js/ui.js`（`UI` 类：新增得分显示）
- Modify: `index.html`（HUD 新增得分元素）
- Modify: `css/style.css`（得分样式）

**Interfaces:**
- Produces: `game.score`（当前关累计得分）、`game.kills`（当前关击杀数）。`game.onAllWavesComplete()` 计算过关奖励并持久化。`game.recordKill(typeId)` 增加得分。
- Consumes: `ZOMBIE_TYPES[typeId].score`。

- [ ] **Step 1: 在 Game 构造函数中初始化得分字段**

在 `js/game.js` 的 `constructor` 中，`this.levelManager = null;` 之后追加：

```js
    // 得分统计
    this.score = 0;
    this.kills = 0;
```

在 `startLevel(levelId)` 中重置：在 `this.gameTime = 0;` 之后追加 `this.score = 0; this.kills = 0;`

- [ ] **Step 2: 在子弹命中僵尸处记录击杀得分**

在 `js/game.js` 的 `update` 方法中，`target.takeDamage(proj.damage);` 之后追加：

```js
            if (target.dead) {
              this.recordKill(target.typeId);
            }
```

- [ ] **Step 3: 添加 recordKill 方法**

在 `Game` 类的 `collectSun` 方法之后追加：

```js
  recordKill(typeId) {
    const type = ZOMBIE_TYPES[typeId];
    this.kills++;
    this.score += (type && type.score) || 10;
    this.emitScoreChange();
  }

  // 过关奖励：基础500 + 剩余阳光折算
  computeClearBonus() {
    const base = 500;
    const sunBonus = Math.floor(this.sun / 10); // 每10阳光=1分
    return base + sunBonus;
  }
```

- [ ] **Step 4: 在 onAllWavesComplete 中结算过关奖励并持久化**

修改 `onAllWavesComplete()`:

```js
  onAllWavesComplete() {
    const bonus = this.computeClearBonus();
    this.score += bonus;
    this.lastBonus = bonus;
    this.state = 'win';
    Sound.win();
    SaveStore.addClearScore(this.levelManager.level.id, this.score);
    SaveStore.recordWin();
    this.emitStateChange();
    this.emitScoreChange();
  }
```

在 `emitWaveChange` 之后追加 `emitScoreChange`:

```js
  emitScoreChange() {
    if (this.onScoreChange) {
      this.onScoreChange(this.score, this.kills);
    }
  }
```

并在 `constructor` 中 `this.onPlantPlaced = null;` 之后追加 `this.onScoreChange = null;`

- [ ] **Step 5: 新建存档模块 SaveStore**

创建 `js/save.js`：

```js
// ============================================================
// 存档系统 - localStorage 持久化玩家进度
// ============================================================
const SaveStore = (() => {
  const KEY = 'pvz_save_v1';

  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return null;
      return JSON.parse(raw);
    } catch (e) {
      return null;
    }
  }

  function getProgress() {
    const s = load();
    if (!s) return { unlockedLevel: 1, totalScore: 0, totalKills: 0, wins: 0 };
    return {
      unlockedLevel: s.unlockedLevel || 1,
      totalScore: s.totalScore || 0,
      totalKills: s.totalKills || 0,
      wins: s.wins || 0,
    };
  }

  function addClearScore(levelId, score) {
    const s = load() || { unlockedLevel: 1, totalScore: 0, totalKills: 0, wins: 0, bestScores: {} };
    s.totalScore += score;
    s.unlockedLevel = Math.max(s.unlockedLevel, Math.min(levelId + 1, Object.keys(LEVELS).length));
    s.bestScores = s.bestScores || {};
    s.bestScores[levelId] = Math.max(s.bestScores[levelId] || 0, score);
    localStorage.setItem(KEY, JSON.stringify(s));
  }

  function recordWin() {
    const s = load() || { unlockedLevel: 1, totalScore: 0, totalKills: 0, wins: 0 };
    s.wins = (s.wins || 0) + 1;
    localStorage.setItem(KEY, JSON.stringify(s));
  }

  function recordKill() {
    const s = load() || { unlockedLevel: 1, totalScore: 0, totalKills: 0, wins: 0 };
    s.totalKills = (s.totalKills || 0) + 1;
    localStorage.setItem(KEY, JSON.stringify(s));
  }

  function isLevelUnlocked(levelId) {
    const p = getProgress();
    return levelId <= p.unlockedLevel;
  }

  return { load, getProgress, addClearScore, recordWin, recordKill, isLevelUnlocked };
})();
```

- [ ] **Step 6: 在子弹命中处调用 recordKill 持久化**

在 Step 2 的 `this.recordKill(target.typeId);` 之后追加 `SaveStore.recordKill();`

- [ ] **Step 7: 在 index.html 中添加得分 HUD**

在 `index.html` 的 `#wave-info` 块之后、`<button id="pause-btn">` 之前追加：

```html
      <div id="score-info">
        <span id="score-text">得分 0</span>
      </div>
```

在 `<script>` 顺序中，`js/config.js` 之后、`js/sound.js` 之前插入：

```html
<script src="js/save.js"></script>
```

- [ ] **Step 8: 在 ui.js 中订阅得分并更新显示**

在 `UI` 构造函数中，`game.onPlantPlaced = ...` 之后追加：

```js
    game.onScoreChange = (score, kills) => this.updateScore(score, kills);
```

在 `bindEvents` 中新增对 `score-text` 的引用。在 `updateSun` 方法之后追加：

```js
  updateScore(score, kills) {
    const el = document.getElementById('score-text');
    if (el) el.textContent = `得分 ${score}`;
  }
```

在构造函数中初始化调用 `this.updateScore(game.score, game.kills);`

- [ ] **Step 9: 添加得分样式**

在 `css/style.css` 中追加：

```css
#score-info {
  margin-left: 12px;
  padding: 4px 10px;
  background: rgba(0,0,0,0.4);
  border-radius: 8px;
  color: #ffd700;
  font-weight: bold;
  font-size: 14px;
}
```

- [ ] **Step 10: 运行 headless 测试**

Run: `npm test`

Expected: 通过。

- [ ] **Step 11: Commit**

```bash
git add js/game.js js/ui.js js/save.js index.html css/style.css
git commit -m "feat(score): 实现得分累计+过关奖励+localStorage存档"
```

---

### Task 7: 关卡解锁+结果页统计

**Files:**
- Modify: `js/ui.js`（`buildLevelGrid`、`handleStateChange` win/lose 分支、新增 `updateLevelLocks`）

**Interfaces:**
- Consumes: `SaveStore.isLevelUnlocked(id)`、`SaveStore.getProgress()`、`game.score`/`game.kills`/`game.lastBonus`。
- Produces: 未解锁关卡置灰+锁定图标；结果页显示得分/击杀/奖励。

- [ ] **Step 1: 修改 buildLevelGrid 支持锁定**

在 `js/ui.js` 的 `buildLevelGrid` 中，`btn.innerHTML` 行改为条件渲染，并在未解锁时禁用：

```js
      const unlocked = SaveStore.isLevelUnlocked(id);
      btn.innerHTML = unlocked
        ? `<span>第 ${id} 关</span><span class="level-name">${level.name}</span>`
        : `<span>🔒 第 ${id} 关</span><span class="level-name">${level.name}</span>`;
      if (!unlocked) {
        btn.disabled = true;
        btn.classList.add('locked');
      }
```

- [ ] **Step 2: 在结果页 win 分支添加统计**

在 `handleStateChange` 的 `if (data.state === 'win')` 块中，`this.resultText.textContent` 赋值改为含统计：

```js
      const stats = `得分 ${this.game.score} · 击杀 ${this.game.kills} · 过关奖励 +${this.game.lastBonus || 0}`;
      this.resultText.textContent = `成功完成「${levelName}」！\n${stats}\n点击下方按钮挑战下一关，或重玩本关。`;
```

- [ ] **Step 3: 添加锁定关卡样式**

在 `css/style.css` 追加：

```css
.level-btn.locked {
  opacity: 0.5;
  cursor: not-allowed;
  filter: grayscale(1);
}
.level-btn.locked:disabled {
  background: #555;
}
```

- [ ] **Step 4: 运行 headless 测试**

Run: `npm test`

Expected: 通过。

- [ ] **Step 5: Commit**

```bash
git add js/ui.js css/style.css
git commit -m "feat(ui): 关卡顺序解锁+结果页得分统计"
```

---

### Task 8: 视觉反馈打磨（血条/魅惑标识/选中提示）

**Files:**
- Modify: `js/zombies.js`（血条始终显示+魅惑标记）
- Modify: `js/plants.js`（血条始终显示）
- Modify: `js/game.js`（放置预览增强）

**Interfaces:**
- Produces: 僵尸血条常驻（非仅受伤时）、魅惑僵尸头顶 🌀 标识、植物血条常驻。

- [ ] **Step 1: 僵尸血条改为常驻**

在 `js/zombies.js` 的 `render` 方法中，将 `if (this.hp < this.maxHp) {` 血条块改为无条件绘制（保留颜色渐变逻辑），并在血条下方为魅惑僵尸添加标识：

```js
    // 血条(常驻)
    {
      const barW = 36;
      const barH = 4;
      const barX = x - barW / 2;
      const barY = y - 44;
      ctx.fillStyle = 'rgba(0,0,0,0.5)';
      ctx.fillRect(barX, barY, barW, barH);
      ctx.fillStyle = this.hp / this.maxHp > 0.5 ? '#4caf50' : '#f44336';
      ctx.fillRect(barX, barY, barW * (this.hp / this.maxHp), barH);
    }

    // 魅惑标识
    if (this.isAlly) {
      ctx.font = '14px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('🌀', x, y - 52);
    }
```

（注意：删除原 `if (this.hp < this.maxHp)` 包裹块，改为常驻；魅惑光环块保留）

- [ ] **Step 2: 植物血条改为常驻**

在 `js/plants.js` 的 `render` 中，将 `if (this.hp < this.maxHp) {` 血条块改为无条件绘制：

```js
    // 血条(常驻)
    {
      const barW = 40;
      const barH = 5;
      const barX = x - barW / 2;
      const barY = y - 38;
      ctx.fillStyle = 'rgba(0,0,0,0.5)';
      ctx.fillRect(barX, barY, barW, barH);
      ctx.fillStyle = this.hp / this.maxHp > 0.5 ? '#4caf50' : '#f44336';
      ctx.fillRect(barX, barY, barW * (this.hp / this.maxHp), barH);
    }
```

- [ ] **Step 3: 运行 headless 测试并截图**

Run: `npm test`

Expected: 通过。检查 `test/screenshots/` 生成新截图无渲染异常。

- [ ] **Step 4: Commit**

```bash
git add js/zombies.js js/plants.js
git commit -m "feat(visual): 常驻血条+魅惑僵尸标识"
```

---

### Task 9: 浏览器版检查点存档/读档

**Files:**
- Modify: `js/save.js`（新增 checkpoint 存读方法）
- Modify: `js/level.js`（`LevelManager` 在中段保存检查点）
- Modify: `js/game.js`（`zombieReachedHouse` 时从检查点恢复选项）
- Modify: `js/ui.js`（结果页添加"从检查点继续"按钮）

**Interfaces:**
- Produces: `SaveStore.saveCheckpoint(levelId, waveIndex, sun, plants, zombies)`、`SaveStore.loadCheckpoint(levelId)`、`game.restoreCheckpoint()`。
- Consumes: `LevelManager.waveIndex`、`game.plants`/`game.zombies` 序列化。

- [ ] **Step 1: 在 save.js 中新增检查点方法**

在 `SaveStore` IIFE 中追加（返回对象前）：

```js
  function saveCheckpoint(levelId, waveIndex, sun, plants, zombies) {
    const s = load() || { checkpoints: {} };
    s.checkpoints = s.checkpoints || {};
    s.checkpoints[levelId] = {
      waveIndex, sun, plants, zombies, ts: Date.now(),
    };
    localStorage.setItem(KEY, JSON.stringify(s));
  }

  function loadCheckpoint(levelId) {
    const s = load();
    if (!s || !s.checkpoints || !s.checkpoints[levelId]) return null;
    return s.checkpoints[levelId];
  }

  function clearCheckpoint(levelId) {
    const s = load();
    if (s && s.checkpoints && s.checkpoints[levelId]) {
      delete s.checkpoints[levelId];
      localStorage.setItem(KEY, JSON.stringify(s));
    }
  }
```

并在 `return { ... }` 中加入 `saveCheckpoint, loadCheckpoint, clearCheckpoint`。

- [ ] **Step 2: 在 LevelManager 中保存检查点**

在 `js/level.js` 的 `startNextWave` 中，当 `waveIndex` 到达关卡中段（`Math.floor(totalWaves / 2)`）时保存检查点。在 `startNextWave` 方法开头、`const wave = ...` 之后追加：

```js
    // 关卡中段保存检查点
    if (this.waveIndex === Math.floor(this.totalWaves / 2)) {
      SaveStore.saveCheckpoint(
        this.level.id,
        this.waveIndex,
        game.sun,
        game.plants.map(p => ({ typeId: p.typeId, row: p.row, col: p.col, hp: p.hp, maxHp: p.maxHp })),
        game.zombies.map(z => ({ typeId: z.typeId, row: z.row, x: z.x, hp: z.hp, maxHp: z.maxHp }))
      );
    }
```

注意：`startNextWave` 需接收 `game` 参数。在调用处 `startNextWave()` 改为 `startNextWave(game)`，并修改 `start()` 与 `update` 中对 `startNextWave` 的调用传 `game`。

- [ ] **Step 3: 在 game.js 中添加 restoreCheckpoint**

在 `Game` 类中追加：

```js
  restoreCheckpoint(levelId) {
    const cp = SaveStore.loadCheckpoint(levelId);
    if (!cp) return false;
    this.startLevel(levelId);
    this.levelManager.waveIndex = cp.waveIndex;
    this.levelManager.waveState = 'idle';
    this.levelManager.waveBreakTimer = 0;
    this.sun = cp.sun;
    this.plants = cp.plants.map(p => {
      const pl = new Plant(p.typeId, p.row, p.col);
      pl.hp = p.hp; pl.maxHp = p.maxHp;
      this.grid[p.row][p.col] = pl;
      return pl;
    });
    this.zombies = cp.zombies.map(z => {
      const zombie = new Zombie(z.typeId, z.row);
      zombie.x = z.x; zombie.hp = z.hp; zombie.maxHp = z.maxHp;
      return zombie;
    });
    this.state = 'playing';
    this.emitStateChange();
    this.emitSunChange();
    return true;
  }
```

- [ ] **Step 4: 在 ui.js 结果页 lose 分支添加"从检查点继续"按钮**

在 `handleStateChange` 的 `lose` 分支中，`this.restartBtn` 配置之后追加第二个按钮。需要在 `index.html` 的 `#result-overlay` 中新增一个 `#checkpoint-btn`：

在 `index.html` `#result-overlay` 中 `restart-btn` 之后追加：

```html
      <button id="checkpoint-btn" class="hidden">从检查点继续</button>
```

在 `ui.js` 构造函数中引用 `this.checkpointBtn = document.getElementById('checkpoint-btn');`，在 `bindEvents` 中绑定：

```js
    this.checkpointBtn.addEventListener('click', () => {
      Sound.click();
      if (this.game.restoreCheckpoint(this.currentLevel)) {
        this.checkpointBtn.classList.add('hidden');
        this.game.emitStateChange();
      }
    });
```

在 `lose` 分支中：

```js
      if (SaveStore.loadCheckpoint(this.currentLevel)) {
        this.checkpointBtn.classList.remove('hidden');
      } else {
        this.checkpointBtn.classList.add('hidden');
      }
```

在 `win` 分支中隐藏该按钮：`this.checkpointBtn.classList.add('hidden');`

- [ ] **Step 5: 添加检查点按钮样式**

在 `css/style.css` 追加：

```css
#checkpoint-btn {
  margin-top: 10px;
  padding: 8px 16px;
  background: linear-gradient(to bottom, #26c6da, #00acc1);
  color: #fff;
  border: none;
  border-radius: 8px;
  cursor: pointer;
  font-size: 14px;
}
```

- [ ] **Step 6: 运行 headless 测试**

Run: `npm test`

Expected: 通过。

- [ ] **Step 7: Commit**

```bash
git add js/save.js js/level.js js/game.js js/ui.js index.html css/style.css
git commit -m "feat(save): 检查点存档/读档+中段自动保存"
```

---

## 阶段二：Godot 版同步

### Task 10: 修复 Godot 截断函数（前置依赖）

**Files:**
- Modify: `godot_project/Plant.gd`（`_get_target_zombie` 约第 116-121 行）
- Modify: `godot_project/Projectile.gd`（碰撞循环约第 26-32 行）

**Interfaces:**
- Produces: 可工作的 `_get_target_zombie` 返回目标僵尸；`Projectile` 碰撞命中正确消除。
- 前置：此任务必须先完成，否则后续 Godot 功能无法验证。

- [ ] **Step 1: 修复 Plant.gd 的 _get_target_zombie**

查看 `godot_project/Plant.gd` 第 100-121 行，将截断的 `_get_target_zombie` 补全为：

```gdscript
func _get_target_zombie() -> Node2D:
    var main = get_tree().get_first_node_in_group("main")
    if main == null:
        return null
    var main_script = main
    for z in main.get_zombies():
        if z.get("row") == row and z.get("alive", true):
            return z
    return null
```

（需先读取该文件确认实际截断形态与 `Main.gd` 暴露的僵尸列表 API 名称，再据此补全）

- [ ] **Step 2: 修复 Projectile.gd 碰撞循环**

查看 `godot_project/Projectile.gd` 第 20-32 行，补全碰撞 for 循环闭合：

```gdscript
func _process(delta: float) -> void:
    position.x -= speed * delta
    var main = get_tree().get_first_node_in_group("main")
    if main != null:
        for z in main.get_zombies():
            if z.get("row") == row and abs(z.position.x - position.x) < 25:
                z.take_damage(damage)
                queue_free()
                return
    if position.x < -50:
        queue_free()
```

- [ ] **Step 3: 确认 Main.gd 暴露 get_zombies()**

若 `Main.gd` 无 `get_zombies()`，添加 `func get_zombies() -> Array: return zombies`。

- [ ] **Step 4: 用 Godot headless 验证**

Run: `godot --headless -e res://godot_project` （若已安装）

Expected: 无脚本解析错误。

- [ ] **Step 5: Commit**

```bash
git add godot_project/Plant.gd godot_project/Projectile.gd godot_project/Main.gd
git commit -m "fix(godot): 修复Plant/Projectile截断函数"
```

---

### Task 11: Godot 僵尸类型系统（ZombieTypes + 6种僵尸）

**Files:**
- Create: `godot_project/ZombieTypes.gd`
- Modify: `godot_project/Zombie.gd`（新增类型字段）
- Modify: `godot_project/project.godot`（注册 ZombieTypes autoload）

**Interfaces:**
- Produces: `ZombieTypes.get_type(id)` 返回僵尸属性字典；`Zombie` 实例按类型实例化 hp/speed/score。
- Consumes: 浏览器版 `ZOMBIE_TYPES` 的 6 种僵尸数据。

- [ ] **Step 1: 创建 ZombieTypes.gd**

```gdscript
extends Node
## 僵尸类型单例（与浏览器版 ZOMBIE_TYPES 对齐）

var types: Dictionary = {
    "normal":    { "hp": 100, "speed": 20.0, "damage": 10, "attack_interval": 0.8, "score": 10 },
    "cone":      { "hp": 200, "speed": 18.0, "damage": 12, "attack_interval": 0.8, "score": 20 },
    "runner":    { "hp": 80,  "speed": 42.0, "damage": 8,  "attack_interval": 0.6, "score": 15 },
    "bucket":    { "hp": 400, "speed": 16.0, "damage": 12, "attack_interval": 1.0, "score": 30 },
    "pole_vault":{ "hp": 80,  "speed": 45.0, "damage": 8,  "attack_interval": 0.8, "score": 25, "jump_over_plant": true },
    "newspaper": { "hp": 130, "speed": 18.0, "damage": 10, "attack_interval": 0.8, "score": 20, "newspaper_behavior": true, "speed_after_hit": 30.0 },
}

func get_type(type_id: String) -> Dictionary:
    return types.get(type_id, types["normal"])

func all_ids() -> Array:
    return types.keys()
```

- [ ] **Step 2: 修改 Zombie.gd 支持类型**

在 `Zombie.gd` 中新增 `type_id: String = "normal"`，并在实例化时从 `ZombieTypes.get_type(type_id)` 读取 hp/speed。

- [ ] **Step 3: 注册 autoload**

在 `godot_project/project.godot` 的 `[autoload]` 段追加 `ZombieTypes="*res://ZombieTypes.gd"`，并确认 `PlantTypes` 也注册。

- [ ] **Step 4: 用 Godot headless 验证**

Run: `godot --headless -e res://godot_project`

Expected: 无解析错误，`ZombieTypes.get_type("bucket")` 返回正确字典。

- [ ] **Step 5: Commit**

```bash
git add godot_project/ZombieTypes.gd godot_project/Zombie.gd godot_project/project.godot
git commit -m "feat(godot): 新增ZombieTypes单例+6种僵尸类型"
```

---

### Task 12: Godot 植物扩至 11 种 + 行为分支

**Files:**
- Modify: `godot_project/PlantTypes.gd`（扩至 11 种）
- Modify: `godot_project/Plant.gd`（`match behavior` 加 bomb/charm/dualRow 分支）

**Interfaces:**
- Produces: `PlantTypes.get_type(id)` 返回 11 种植物；`Plant` 按 behavior 分发含新行为。
- Consumes: 浏览器版 `PLANT_TYPES` 11 种植物数据。

- [ ] **Step 1: 扩展 PlantTypes.gd 字典至 11 种**

将 `PlantTypes.gd` 的 `types` 字典补充至与浏览器版 `PLANT_TYPES` 对齐的 11 种（含 mushroomShooter/explosiveShroom/dualPea，behavior 字段分别为 shooter/bomb/shooter+dual_row）。

- [ ] **Step 2: 在 Plant.gd 的 match 中加分支**

在 `Plant.gd` 的 `match type.get("behavior", "")` 中确保含 `bomb`/`charm`/`shooter`（带 dual_row 时覆盖两行）分支。

- [ ] **Step 3: 用 Godot headless 验证**

Run: `godot --headless -e res://godot_project`

Expected: 无解析错误。

- [ ] **Step 4: Commit**

```bash
git add godot_project/PlantTypes.gd godot_project/Plant.gd
git commit -m "feat(godot): 植物扩至11种+补全行为分支"
```

---

### Task 13: Godot 关卡系统（Levels + LevelManager + 胜利状态）

**Files:**
- Create: `godot_project/Levels.gd`
- Modify: `godot_project/Main.gd`（替换无限算法波次为关卡波次，新增胜利状态）
- Modify: `godot_project/project.godot`（注册 Levels autoload）

**Interfaces:**
- Produces: `Levels.get_level(id)` 返回波次数据；`Main` 按关卡管理波次并触发胜利。
- Consumes: 浏览器版 `LEVELS` 8 关数据。

- [ ] **Step 1: 创建 Levels.gd**

将浏览器版 `LEVELS` 的 8 关数据（每关 `startSun`+`waves`，每个僵尸 `{type, delay}`）移植为 GDScript 字典。

- [ ] **Step 2: 在 Main.gd 中替换波次逻辑**

将 `Main.gd:193-267` 的无限递增算法替换为按 `Levels.get_level` 读取当前关卡波次，波次结束后进入胜利状态。

- [ ] **Step 3: 注册 autoload 并验证**

Run: `godot --headless -e res://godot_project`

Expected: 无解析错误。

- [ ] **Step 4: Commit**

```bash
git add godot_project/Levels.gd godot_project/Main.gd godot_project/project.godot
git commit -m "feat(godot): 新增关卡系统(8关)+胜利状态"
```

---

### Task 14: Godot 得分+存档系统

**Files:**
- Modify: `godot_project/Main.gd`（得分累计+过关奖励+FileAccess 存档）
- Modify: `godot_project/HUD.tscn` / 相关脚本（得分显示）

**Interfaces:**
- Produces: Godot 版得分累计（按僵尸 score）+过关奖励，存档用 FileAccess 写入 `user://save.cfg`。
- Consumes: `ZombieTypes` score 字段、`Levels`。

- [ ] **Step 1: 在 Main.gd 中实现得分**

新增 `score`/`kills` 变量，击杀时累加 `ZombieTypes.get_type(id).score`，胜利时加过关奖励。

- [ ] **Step 2: 用 FileAccess 实现存档**

写入 `user://save.cfg`（与浏览器版 localStorage 等价），记录 unlockedLevel/totalScore/wins。

- [ ] **Step 3: 在 HUD 显示得分**

Run: `godot --headless -e res://godot_project`

Expected: 无解析错误。

- [ ] **Step 4: Commit**

```bash
git add godot_project/Main.gd godot_project/HUD.tscn
git commit -m "feat(godot): 得分系统+FileAccess存档"
```

---

### Task 15: 最终验证与跨版本一致性检查

**Files:**
- 全部阶段一/二文件

**Interfaces:**
- Produces: 两版功能对齐确认。

- [ ] **Step 1: 浏览器版完整回归**

Run: `npm test`

Expected: 全部断言通过，无页面异常。

- [ ] **Step 2: Godot 版回归**

Run: `godot --headless -e res://godot_project`

Expected: 无解析错误。

- [ ] **Step 3: 手动对照两版功能矩阵**

确认：11 植物、6 僵尸、8 关卡、得分、存档在两侧均存在。

- [ ] **Step 4: 最终 Commit**

```bash
git add -A
git commit -m "chore: 跨版本功能对齐验证通过"
```

---

## 自检（Self-Review）

**1. Spec 覆盖检查：**
- 3 新僵尸（铁桶/撑杆/读报）→ Task 1-2 ✅
- 3 新植物（蘑菇/爆炸菇/双射）→ Task 3-4 ✅
- 关卡扩至 8 关 → Task 5 ✅
- 得分系统（击杀+过关奖励+localStorage）→ Task 6 ✅
- 关卡解锁+结果页统计 → Task 7 ✅
- 视觉反馈（血条常驻/魅惑标识）→ Task 8 ✅
- 检查点存档/读档 → Task 9 ✅
- Godot 全量同步 → Task 10-15 ✅

**2. 占位符扫描：** 无 "TBD"/"TODO"。所有代码块含实际内容。Task 10/11/12/13 中 Godot 代码需读取实际文件确认 API 名称（已在步骤中注明"需先读取该文件确认实际形态"），这是执行时的合理调研步骤而非占位符。

**3. 类型一致性：**
- `recordKill(typeId)` 在 Task 6 Step 3 定义，Step 2 调用 ✅
- `SaveStore` 各方法在 `js/save.js` 统一定义，浏览器版其他文件通过全局 `SaveStore` 访问 ✅
- `LEVELS` 从 6 关扩至 8 关，Task 5 在 `6:` 之后插入 `7:`/`8:` ✅
- Godot `get_zombies()` 在 Task 10 Step 3 确认存在 ✅
- 注：Task 5 假设现有 `LEVELS` 为 6 关（实测 config.js 已有 1-6 关），需在执行时确认 `6:` 定义结尾格式（应为 `},`）以便插入 `7:`/`8:`。

**4. 发现的一个执行注意点：** 浏览器版 `LEVELS` 实际已有 6 关（1-6），而非之前以为的 4 关。Task 5 仅需追加 7/8 两关。
