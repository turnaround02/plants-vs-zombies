# 夜间关卡（第 9 关）实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 新增第 9 关为夜间关卡，整关无自然阳光、开局送 150 阳光、深色背景 + 星空视觉，复用现有系统。

**Architecture:** 在 `js/config.js` 的 `LEVELS` 中新增 `LEVELS[9]`（含 `night:true` 标志与 3 波僵尸）。在 `js/game.js` 的 `update()` 中检测 `level.night` 跳过天空掉阳光逻辑；在 `renderBackground()` 中检测 `night` 绘制深色背景 + 星空。测试在 `test/headless-test.js` 追加测试 13 断言核心逻辑。

**Tech Stack:** 原生 JavaScript（全局作用域，无模块）、HTML5 Canvas 2D、Puppeteer E2E 测试。

**Spec:** `docs/superpowers/specs/2026-09-20-night-level-design.md`

## Global Constraints

- 浏览器版专属，Godot 版冻结，不同步。
- 所有游戏数值（阳光、波次、网格）放在 `js/config.js`，不在实体类硬编码。
- 注释与代码标识符使用中文，保持现有约定。
- 蘑菇植物（蘑菇射手/爆炸菇/魅惑菇）夜间不加成，与白天表现一致。
- 复用现有系统：得分/存档/检查点/割草机/铲子，无额外改动。
- 保持默认卡组，不做选卡界面。
- 交付：master 直改，2 个 commit（实现 + 测试）。
- 验收：`npm test` 全绿 + 手动浏览器验证 + 无控制台错误。

---

### Task 1: 新增夜间关卡定义（`js/config.js`）

**Files:**
- Modify: `js/config.js`（在 `LEVELS` 对象末尾、`8` 之后新增 `9`）

**Interfaces:**
- Consumes: 现有 `LEVELS` 结构（`id`/`name`/`startSun`/`waves`）
- Produces: `LEVELS[9]`，含 `night: true` 标志，供 `game.js` 读取

- [ ] **Step 1: 在 `LEVELS` 末尾新增第 9 关**

在 `js/config.js` 的 `LEVELS` 对象中，`8` 关卡定义之后（`};` 之前）追加：

```js
  9: {
    id: 9,
    name: '第九关：夜幕降临',
    startSun: 150,
    night: true, // 夜间关卡：天空不掉阳光，开局送 150 阳光
    waves: [
      {
        // 第1波: 铁桶 + 撑杆 + 读报混合
        zombies: [
          { type: 'bucket', delay: 0 },
          { type: 'poleVault', delay: 1500 },
          { type: 'newspaper', delay: 3000 },
          { type: 'bucket', delay: 4500 },
          { type: 'runner', delay: 6000 },
          { type: 'poleVault', delay: 7500 },
          { type: 'newspaper', delay: 9000 },
        ],
      },
      {
        // 第2波: 铁桶 + 撑杆 + 读报 + 路障
        zombies: [
          { type: 'bucket', delay: 0 },
          { type: 'poleVault', delay: 1000 },
          { type: 'newspaper', delay: 2000 },
          { type: 'bucket', delay: 3000 },
          { type: 'runner', delay: 4000 },
          { type: 'poleVault', delay: 5000 },
          { type: 'newspaper', delay: 6000 },
          { type: 'cone', delay: 7000 },
          { type: 'bucket', delay: 8000 },
          { type: 'poleVault', delay: 9000 },
          { type: 'newspaper', delay: 10000 },
        ],
      },
      {
        // 第3波: 最终波，混合大军
        zombies: [
          { type: 'bucket', delay: 0 },
          { type: 'poleVault', delay: 700 },
          { type: 'newspaper', delay: 1400 },
          { type: 'bucket', delay: 2100 },
          { type: 'runner', delay: 2800 },
          { type: 'poleVault', delay: 3500 },
          { type: 'newspaper', delay: 4200 },
          { type: 'bucket', delay: 4900 },
          { type: 'runner', delay: 5600 },
          { type: 'poleVault', delay: 6300 },
          { type: 'cone', delay: 7000 },
          { type: 'newspaper', delay: 7700 },
          { type: 'bucket', delay: 8400 },
          { type: 'poleVault', delay: 9100 },
        ],
      },
    ],
  },
```

- [ ] **Step 2: 验证语法**

Run: `node -e "require('./js/config.js')"` 或 `node --check js/config.js`
Expected: 无语法错误（`node --check` 通过）

- [ ] **Step 3: 提交**

```bash
git add js/config.js
git commit -m "feat: 新增第9关夜间关卡定义"
```

---

### Task 2: 夜间资源规则 + 视觉（`js/game.js`）

**Files:**
- Modify: `js/game.js`（`update()` 方法、`renderBackground()` 方法）

**Interfaces:**
- Consumes: `LEVELS[9].night`（Task 1 产出）
- Produces: 夜间关卡不掉天空阳光；夜间深色背景 + 星空渲染

- [ ] **Step 1: 修改 `update()` 跳过夜间天空掉阳光**

在 `js/game.js` 的 `update(dt)` 方法中，找到天空掉阳光逻辑：

```js
    // 天空掉阳光
    this.sunFallTimer += dt;
    if (this.sunFallTimer >= CONFIG.SUN_FALL_INTERVAL) {
      this.sunFallTimer = 0;
      const x = CONFIG.GRID_OFFSET_X + 50 + Math.random() * (CONFIG.CANVAS_WIDTH - CONFIG.GRID_OFFSET_X - 100);
      const y = -20;
      this.spawnSun(x, y, CONFIG.SUN_FALL_AMOUNT, 'sky');
    }
```

替换为（夜间关卡跳过天空掉阳光）：

```js
    // 天空掉阳光（夜间关卡不掉自然阳光，仅靠植物生产）
    const isNight = this.levelManager && this.levelManager.level && this.levelManager.level.night;
    if (!isNight) {
      this.sunFallTimer += dt;
      if (this.sunFallTimer >= CONFIG.SUN_FALL_INTERVAL) {
        this.sunFallTimer = 0;
        const x = CONFIG.GRID_OFFSET_X + 50 + Math.random() * (CONFIG.CANVAS_WIDTH - CONFIG.GRID_OFFSET_X - 100);
        const y = -20;
        this.spawnSun(x, y, CONFIG.SUN_FALL_AMOUNT, 'sky');
      }
    }
```

- [ ] **Step 2: 修改 `renderBackground()` 支持夜间深色背景 + 星空**

在 `js/game.js` 的 `renderBackground(ctx)` 方法中，找到方法开头：

```js
  renderBackground(ctx) {
    // 草地背景
    const grad = ctx.createLinearGradient(0, 0, 0, CONFIG.CANVAS_HEIGHT);
    grad.addColorStop(0, '#7cb342');
    grad.addColorStop(1, '#558b2f');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, CONFIG.CANVAS_WIDTH, CONFIG.CANVAS_HEIGHT);

    // 天空区域(左侧房屋上方)
    ctx.fillStyle = '#87ceeb';
    ctx.fillRect(0, 0, CONFIG.GRID_OFFSET_X, CONFIG.CANVAS_HEIGHT);

    // 草地纹理(小点)
    ctx.fillStyle = 'rgba(255,255,255,0.08)';
    for (let i = 0; i < 60; i++) {
      const x = (i * 137.5) % CONFIG.CANVAS_WIDTH;
      const y = (i * 89.3) % CONFIG.CANVAS_HEIGHT;
      ctx.beginPath();
      ctx.arc(x, y, 2, 0, Math.PI * 2);
      ctx.fill();
    }
  }
```

替换为（夜间深色背景 + 星空）：

```js
  renderBackground(ctx) {
    const isNight = this.levelManager && this.levelManager.level && this.levelManager.level.night;

    if (isNight) {
      // 夜间草地背景（深色）
      const grad = ctx.createLinearGradient(0, 0, 0, CONFIG.CANVAS_HEIGHT);
      grad.addColorStop(0, '#1a237e');
      grad.addColorStop(1, '#0d1b2a');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, CONFIG.CANVAS_WIDTH, CONFIG.CANVAS_HEIGHT);

      // 夜间天空区域(左侧房屋上方)
      ctx.fillStyle = '#0b1026';
      ctx.fillRect(0, 0, CONFIG.GRID_OFFSET_X, CONFIG.CANVAS_HEIGHT);

      // 星空（随机小点 + 闪烁）
      for (let i = 0; i < 80; i++) {
        const x = (i * 137.5) % CONFIG.CANVAS_WIDTH;
        const y = (i * 89.3) % CONFIG.CANVAS_HEIGHT;
        const twinkle = 0.4 + 0.6 * Math.abs(Math.sin(this.gameTime / 500 + i));
        ctx.fillStyle = `rgba(255,255,255,${twinkle})`;
        ctx.beginPath();
        ctx.arc(x, y, 1.5, 0, Math.PI * 2);
        ctx.fill();
      }
      return;
    }

    // 白天草地背景
    const grad = ctx.createLinearGradient(0, 0, 0, CONFIG.CANVAS_HEIGHT);
    grad.addColorStop(0, '#7cb342');
    grad.addColorStop(1, '#558b2f');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, CONFIG.CANVAS_WIDTH, CONFIG.CANVAS_HEIGHT);

    // 天空区域(左侧房屋上方)
    ctx.fillStyle = '#87ceeb';
    ctx.fillRect(0, 0, CONFIG.GRID_OFFSET_X, CONFIG.CANVAS_HEIGHT);

    // 草地纹理(小点)
    ctx.fillStyle = 'rgba(255,255,255,0.08)';
    for (let i = 0; i < 60; i++) {
      const x = (i * 137.5) % CONFIG.CANVAS_WIDTH;
      const y = (i * 89.3) % CONFIG.CANVAS_HEIGHT;
      ctx.beginPath();
      ctx.arc(x, y, 2, 0, Math.PI * 2);
      ctx.fill();
    }
  }
```

- [ ] **Step 3: 验证语法**

Run: `node --check js/game.js`
Expected: 无语法错误

- [ ] **Step 4: 提交**

```bash
git add js/game.js
git commit -m "feat: 夜间关卡不掉天空阳光 + 深色背景星空视觉"
```

---

### Task 3: 新增夜间关卡 E2E 测试（`test/headless-test.js`）

**Files:**
- Modify: `test/headless-test.js`（在测试 12 之后、汇总之前追加测试 13）

**Interfaces:**
- Consumes: `LEVELS[9]`（Task 1）、`game.update()` 夜间逻辑（Task 2）
- Produces: 测试 13 断言夜间关卡核心逻辑

- [ ] **Step 1: 追加测试 13**

在 `test/headless-test.js` 中，测试 12 的 `if (!cpResult.ok) throw ...` 之后、`// ========== 汇总` 之前插入：

```js
    // ==========================================
    // 测试 13: 夜间关卡核心逻辑
    // ==========================================
    console.log('\n📋 测试 13: 夜间关卡核心逻辑');
    const nightResult = await page.evaluate(() => {
      const game = window.__game;
      // 1. 第9关应标记为夜间
      const level9 = LEVELS[9];
      if (!level9 || level9.night !== true) {
        return { ok: false, reason: '第9关未标记为夜间' };
      }
      // 2. 进入第9关，开局阳光应为 150
      game.startLevel(9);
      if (game.sun !== 150) {
        return { ok: false, reason: `第9关开局阳光应为150, 实际 ${game.sun}` };
      }
      // 3. 夜间关卡在 SUN_FALL_INTERVAL 时间内不应生成天空阳光
      game.suns = [];
      game.sunFallTimer = 0;
      game.update(CONFIG.SUN_FALL_INTERVAL + 100);
      const skySuns = game.suns.filter(s => s.source === 'sky').length;
      if (skySuns > 0) {
        return { ok: false, reason: `夜间关卡不应生成天空阳光, 实际 ${skySuns}` };
      }
      // 4. 通关第9关后解锁状态正确
      SaveStore.addClearScore(9, 1000);
      const unlocked = SaveStore.isLevelUnlocked(9);
      return { ok: unlocked, unlocked };
    });
    console.log('  夜间关卡:', JSON.stringify(nightResult));
    if (!nightResult.ok) throw new Error(`夜间关卡异常: ${nightResult.reason || JSON.stringify(nightResult)}`);

    await page.screenshot({ path: path.join(SHOT_DIR, '13-night-level.png') });
    console.log('  ✅ 夜间关卡截图已保存: test/screenshots/13-night-level.png');
```

- [ ] **Step 2: 运行测试验证通过**

Run: `npm test`
Expected: 全部测试通过（含新增测试 13），无控制台错误

- [ ] **Step 3: 提交**

```bash
git add test/headless-test.js
git commit -m "test: 夜间关卡核心逻辑 E2E 测试"
```

---

## Self-Review

**1. Spec coverage:**
- 关卡定义（`LEVELS[9]` + `night:true` + 150 阳光 + 3 波）→ Task 1 ✅
- 夜间不掉天空阳光 → Task 2 Step 1 ✅
- 深色背景 + 星空 → Task 2 Step 2 ✅
- 测试核心逻辑（夜间不掉阳光 + 开局阳光 + 解锁）→ Task 3 ✅
- 复用现有系统 / 蘑菇不加成 / 保持默认卡组 → 无代码改动，符合 spec 非目标 ✅

**2. Placeholder scan:** 无 TBD/TODO，所有步骤含实际代码。✅

**3. Type consistency:** `night` 标志在 Task 1 定义、Task 2 读取，命名一致；`LEVELS[9]`、`game.startLevel(9)`、`SaveStore.addClearScore(9,...)` 一致。✅