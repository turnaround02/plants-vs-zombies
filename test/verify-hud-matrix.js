// ============================================================
// HUD 按钮交互矩阵验证脚本（一次性验证，保留在此目录）
// 验证目标（来自报告的 bug）：
//   "从暂停菜单选关卡 → 进入选植物面板，点右上角铲子会弹出暂停菜单；
//    再点右上角暂停键会让背景僵尸移动"
// 期望行为：
//   - 选植物面板（plant-pick-overlay）下：顶栏 #shovel-btn / #pause-btn /
//     #plant-cards 全部隐藏（display:none）且不可交互；#mute-btn 保持可见
//   - 暂停菜单（pause-overlay）保持隐藏，不会被铲子/暂停键重新顶出
//   - 旧关卡僵尸保持冻结（isPaused 阻止 game.update 推进）
//
// 复用 test/headless-test.js 的模式：
//   - 内建静态服务器，127.0.0.1:8899
//   - 无头 Chrome: C:\Program Files\Google\Chrome\Application\chrome.exe
//   - 通过 window.__game / window.__ui 驱动
//
// 用法: node test/verify-hud-matrix.js
// 说明: 本脚本只读游戏运行时状态并驱动 UI，不修改任何源码文件。
// ============================================================

const puppeteer = require('puppeteer');
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const PORT = 8899;

// 简单静态文件服务器（与 headless-test.js 一致）
function startServer() {
  const mimeTypes = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.svg': 'image/svg+xml',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.json': 'application/json',
  };

  const server = http.createServer((req, res) => {
    let urlPath = decodeURIComponent(req.url.split('?')[0]);
    if (urlPath === '/') urlPath = '/index.html';

    const filePath = path.join(ROOT, urlPath);
    // 安全检查
    if (!filePath.startsWith(ROOT)) {
      res.writeHead(403);
      res.end('Forbidden');
      return;
    }

    fs.readFile(filePath, (err, data) => {
      if (err) {
        res.writeHead(404);
        res.end('Not Found');
        return;
      }
      const ext = path.extname(filePath).toLowerCase();
      res.writeHead(200, { 'Content-Type': mimeTypes[ext] || 'application/octet-stream' });
      res.end(data);
    });
  });

  return new Promise((resolve) => {
    // 仅绑定 IPv4 回环地址，避免与系统代理在 IPv6 :: 上的端口冲突
    server.listen(PORT, '127.0.0.1', () => resolve(server));
  });
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// 收集页面控制台错误
const consoleErrors = [];

// 结果记录
const results = [];
function record(label, ok, actual, expected) {
  results.push({ label, ok, actual, expected });
  const line = `[${ok ? 'PASS' : 'FAIL'}] ${label}`;
  console.log(
    ok
      ? '  ✅ ' + line + '  (实际: ' + actual + ')'
      : '  ❌ ' + line + '  (实际: ' + actual + ' | 期望: ' + expected + ')'
  );
}

async function run() {
  console.log('🚀 启动 HUD 矩阵验证...');
  const server = await startServer();
  console.log(`✅ 本地服务器已启动: http://localhost:${PORT}`);

  const browser = await puppeteer.launch({
    headless: 'new',
    executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--window-size=1000,800'],
    defaultViewport: { width: 1000, height: 800 },
  });

  try {
    const page = await browser.newPage();
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text());
        console.error(`❌ 页面错误: ${msg.text()}`);
      }
    });
    page.on('pageerror', (err) => {
      consoleErrors.push(err.message);
      console.error(`❌ 页面异常: ${err.message}`);
    });

    await page.goto(`http://localhost:${PORT}`, { waitUntil: 'networkidle0', timeout: 15000 });
    // 清掉旧存档/选择，保证可复现
    await page.evaluate(() => localStorage.clear());
    await sleep(300);

    // 页面初始化后，先清一次 localStorage 并在内存里重置保存状态
    await page.evaluate(() => {
      localStorage.clear();
      if (window.SaveStore) SaveStore.resetAll();
    });
    await sleep(200);

    // ============================================================
    // 辅助（在页面内使用）
    // ============================================================
    // 显示 computed display 是否为 'none'
    const displayNone = (id) => getComputedStyle(document.getElementById(id)).display === 'none';
    // 推进 5 次 1000ms 模拟时间（游戏 update）
    const advance5 = () => {
      const g = window.__game;
      for (let i = 0; i < 5; i++) g.update(1000);
    };

    // ============================================================
    // 前置 Setup: 开一局正常关卡，跳过倒数，手动放一只僵尸并记录 x
    // ============================================================
    const setup = await page.evaluate(() => {
      const game = window.__game;
      const ui = window.__ui;
      game.startLevel(1, false, false);
      game.skipCountdown();
      game.spawnZombie('normal', 0);
      const z = game.zombies[0];
      return {
        hasGame: !!game,
        hasUi: !!ui,
        state: game.state,
        zombieCount: game.zombies.length,
        zombieX: z ? z.x : null,
        isPaused: game.isPaused,
      };
    });
    console.log('\n📋 Setup:', JSON.stringify(setup));
    if (!setup.hasGame || !setup.hasUi) throw new Error('window.__game / window.__ui 未暴露!');
    if (setup.state !== 'playing') throw new Error(`前置: state 应为 playing, 实际 ${setup.state}`);
    if (!setup.zombieX) throw new Error('前置: 无法生成僵尸');
    let zombieX0 = setup.zombieX;
    record('setup: 僵尸已生成且记录初始 x', zombieX0 != null, zombieX0, 'number');

    // 读取僵尸 x 的通用取法
    const getZombieX = () => page.evaluate(() => window.__game.zombies[0] ? window.__game.zombies[0].x : null);

    // ============================================================
    // Test 1 — 正常游玩态：顶栏可见且可交互
    // ============================================================
    console.log('\n📋 Test 1 — 正常游玩态：顶栏可见 & 可交互');
    const t1 = await page.evaluate(() => {
      const d = (id) => getComputedStyle(document.getElementById(id)).display;
      return {
        shovel: d('shovel-btn'),
        pause: d('pause-btn'),
        cards: d('plant-cards'),
        mute: d('mute-btn'),
      };
    });
    record('T1: #shovel-btn 可见(display!==none)', t1.shovel !== 'none', t1.shovel, "'none' 之外的值");
    record('T1: #pause-btn 可见(display!==none)', t1.pause !== 'none', t1.pause, "'none' 之外的值");
    record('T1: #plant-cards 可见(display!==none)', t1.cards !== 'none', t1.cards, "'none' 之外的值");
    record('T1: #mute-btn 可见(display!==none)', t1.mute !== 'none', t1.mute, "'none' 之外的值");

    // ============================================================
    // Test 2 — 暂停：顶栏玩法控件隐藏，游戏冻结
    // ============================================================
    console.log('\n📋 Test 2 — 点 #pause-btn 暂停：顶栏隐藏，游戏冻结');
    const t2 = await page.evaluate(() => {
      const ui = window.__ui;
      const game = window.__game;
      // 走真实的暂停按钮路径
      document.getElementById('pause-btn').click();

      const d = (id) => getComputedStyle(document.getElementById(id)).display;
      const pauseOverlayHidden = document.getElementById('pause-overlay').classList.contains('hidden');
      const snapshot = {
        uiPaused: ui.isPaused,
        gamePaused: game.isPaused,
        pauseOverlayHidden,
        shovel: d('shovel-btn'),
        pause: d('pause-btn'),
        cards: d('plant-cards'),
      };

      // 推进 5 × update(1000) 验证冻结
      const xBefore = game.zombies[0] ? game.zombies[0].x : null;
      for (let i = 0; i < 5; i++) game.update(1000);
      const xAfter = game.zombies[0] ? game.zombies[0].x : null;
      snapshot.frozen = xBefore === xAfter;
      snapshot.xBefore = xBefore;
      snapshot.xAfter = xAfter;
      return snapshot;
    });
    zombieX0 = await getZombieX(); // 重新读（暂停中不会动，等价于 xBefore）
    record('T2: 暂停后 #pause-overlay 可见(未隐藏)', t2.pauseOverlayHidden === false, `hidden=${t2.pauseOverlayHidden}`, 'false');
    record('T2: 暂停后 ui.isPaused === true', t2.uiPaused === true, t2.uiPaused, 'true');
    record('T2: 暂停后 game.isPaused === true', t2.gamePaused === true, t2.gamePaused, 'true');
    record('T2: #shovel-btn 隐藏', t2.shovel === 'none', t2.shovel, "'none'");
    record('T2: #pause-btn 隐藏', t2.pause === 'none', t2.pause, "'none'");
    record('T2: #plant-cards 隐藏', t2.cards === 'none', t2.cards, "'none'");
    record('T2: 暂停冻结僵尸(5×update 后 x 不变)', t2.frozen === true, `xBefore=${t2.xBefore}, xAfter=${t2.xAfter}`, 'xBefore===xAfter');
    zombieX0 = t2.xBefore; // 后续冻结基准用暂停时的 x

    // ============================================================
    // Test 3 — 从暂停菜单选关卡 → 进入选植物面板
    //   期望：顶栏仍隐藏、暂停覆盖层仍隐藏、僵尸仍冻结
    //   关键回归：强制铲子/暂停键点击不会重新弹出暂停菜单、不会解冻
    // ============================================================
    console.log('\n📋 Test 3 — 暂停→选关卡→选植物面板：顶栏隐藏/暂停层隐藏/僵尸冻结');
    const t3 = await page.evaluate(() => {
      const ui = window.__ui;
      const game = window.__game;

      // 先打开关卡选择（暂停菜单 → level-select）
      ui.openLevelSelect();

      // 模拟"点击某个关卡按钮"的路径（即 buildLevelGrid 里按钮绑定的逻辑：
      // _pickerFromPause=true、暂停标志置位、closeLevelSelect、隐藏暂停覆盖层、开面板）。
      // 真实路径下"选关卡按钮"在进入面板前会把 #pause-overlay 隐藏，
      // 所以这里同样调用 pauseOverlay.classList.add('hidden') 以复刻真实用户流。
      ui._pickerFromPause = true;
      ui.isPaused = true;
      game.isPaused = true;
      ui.closeLevelSelect();
      document.getElementById('pause-overlay').classList.add('hidden');
      ui.openPlantPicker({ endless: false, sandbox: false, levelId: 2 });

      const d = (id) => getComputedStyle(document.getElementById(id)).display;
      const snapshot = {
        pickerShowing: !document.getElementById('plant-pick-overlay').classList.contains('hidden'),
        pauseOverlayHidden: document.getElementById('pause-overlay').classList.contains('hidden'),
        shovel: d('shovel-btn'),
        pause: d('pause-btn'),
        cards: d('plant-cards'),
        uiPaused: ui.isPaused,
        gamePaused: game.isPaused,
      };

      // 5 × update(1000) 后僵尸应仍冻结
      const xBefore = game.zombies[0] ? game.zombies[0].x : null;
      for (let i = 0; i < 5; i++) game.update(1000);
      const xAfter = game.zombies[0] ? game.zombies[0].x : null;
      snapshot.frozen = xBefore === xAfter;
      snapshot.xBefore = xBefore;
      snapshot.xAfter = xAfter;

      // ---- 关键回归 1：强制铲子点击（真实用户因 display:none 点不到，但 handler 仍会跑）----
      document.getElementById('shovel-btn').click();
      snapshot.afterShovelClick = {
        pauseOverlayHidden: document.getElementById('pause-overlay').classList.contains('hidden'),
        pickerStillShowing: !document.getElementById('plant-pick-overlay').classList.contains('hidden'),
        shovelMode: game.shovelMode,
        uiPaused: ui.isPaused,
      };
      // 铲子 handler 有 isPaused 守卫 → 应早退，shovelMode 保持 false
      const shovelNoOp =
        snapshot.afterShovelClick.pauseOverlayHidden === true &&
        snapshot.afterShovelClick.pickerStillShowing === true &&
        snapshot.afterShovelClick.shovelMode === false &&
        snapshot.afterShovelClick.uiPaused === true;

      // ---- 关键回归 2：强制暂停键点击（顶栏已隐藏，真实用户点不到）----
      // pauseGame 有 state!=='playing' || isPaused 守卫 → 应无副作用
      document.getElementById('pause-btn').click();
      snapshot.afterPauseClick = {
        pauseOverlayHidden: document.getElementById('pause-overlay').classList.contains('hidden'),
        pickerStillShowing: !document.getElementById('plant-pick-overlay').classList.contains('hidden'),
        uiPaused: ui.isPaused,
        gamePaused: game.isPaused,
      };
      // 再推 5 × update(1000)，僵尸仍应冻结
      for (let i = 0; i < 5; i++) game.update(1000);
      const xAfter2 = game.zombies[0] ? game.zombies[0].x : null;
      snapshot.frozenAfterForcedClicks = xBefore === xAfter2;
      snapshot.xAfter2 = xAfter2;

      snapshot.allFrozen = snapshot.frozen && snapshot.frozenAfterForcedClicks;
      snapshot.pauseOverlayNeverReappeared =
        snapshot.afterShovelClick.pauseOverlayHidden === true &&
        snapshot.afterPauseClick.pauseOverlayHidden === true;

      return { ...snapshot, shovelNoOp };
    });

    zombieX0 = t3.xBefore;
    record('T3: 选植物面板已显示', t3.pickerShowing === true, `pickerShowing=${t3.pickerShowing}`, 'true');
    record('T3: #pause-overlay 仍隐藏(未被重新顶出)', t3.pauseOverlayHidden === true, `hidden=${t3.pauseOverlayHidden}`, 'true');
    record('T3: #shovel-btn 隐藏', t3.shovel === 'none', t3.shovel, "'none'");
    record('T3: #pause-btn 隐藏', t3.pause === 'none', t3.pause, "'none'");
    record('T3: #plant-cards 隐藏', t3.cards === 'none', t3.cards, "'none'");
    record('T3: 面板下 5×update 后僵尸仍冻结', t3.frozen === true, `xBefore=${t3.xBefore}, xAfter=${t3.xAfter}`, 'xBefore===xAfter');
    record(
      'T3: 强制铲子点击 → 暂停菜单未重现 & 面板仍在 & shovelMode===false & isPaused 保持',
      t3.shovelNoOp === true,
      `pauseHidden=${t3.afterShovelClick.pauseOverlayHidden}, picker=${t3.afterShovelClick.pickerStillShowing}, shovelMode=${t3.afterShovelClick.shovelMode}, uiPaused=${t3.afterShovelClick.uiPaused}`,
      '全为 true'
    );
    record(
      'T3: 强制暂停键点击 → 暂停菜单未重现 & 面板仍在 & 僵尸未解冻',
      t3.afterPauseClick.pauseOverlayHidden === true &&
        t3.afterPauseClick.pickerStillShowing === true &&
        t3.frozenAfterForcedClicks === true,
      `pauseHidden=${t3.afterPauseClick.pauseOverlayHidden}, picker=${t3.afterPauseClick.pickerStillShowing}, xAfter2=${t3.xAfter2}`,
      '全为 true'
    );

    // ============================================================
    // Test 4 — 从选植物面板"开始战斗"：解冻并开始新关卡
    // ============================================================
    console.log('\n📋 Test 4 — 选植物面板"开始战斗"：解冻并开新局');
    const t4 = await page.evaluate(() => {
      const ui = window.__ui;
      const game = window.__game;
      // 确保至少选了 1 种植物
      if (!Array.isArray(ui.chosenPlantIds) || ui.chosenPlantIds.length === 0) {
        ui.chosenPlantIds = ['sunflower'];
      }
      const chosenCount = ui.chosenPlantIds.length;

      // 点"开始战斗"
      document.getElementById('plant-pick-start').click();

      return {
        pickerHidden: document.getElementById('plant-pick-overlay').classList.contains('hidden'),
        uiPaused: ui.isPaused,
        gamePaused: game.isPaused,
        state: game.state,
        zombieCount: game.zombies.length,
        chosenCount,
      };
    });
    record('T4: 至少选了 1 种植物', t4.chosenCount >= 1, t4.chosenCount, '>=1');
    record('T4: 点击"开始战斗"后选植物面板隐藏', t4.pickerHidden === true, `hidden=${t4.pickerHidden}`, 'true');
    record('T4: ui.isPaused === false (已解冻)', t4.uiPaused === false, t4.uiPaused, 'false');
    record('T4: game.isPaused === false', t4.gamePaused === false, t4.gamePaused, 'false');
    record("T4: game.state === 'countdown' (新关卡开局倒数)", t4.state === 'countdown', t4.state, "'countdown'");
    record('T4: 旧僵尸列表已重置(0 只)', t4.zombieCount === 0, t4.zombieCount, '0');

    // ============================================================
    // Test 5 — 从选植物面板"返回"(来自暂停)：恢复暂停菜单
    // ============================================================
    console.log('\n📋 Test 5 — 选植物面板"返回"(来自暂停)：恢复暂停菜单，旧关卡仍冻结');
    const t5 = await page.evaluate(() => {
      const ui = window.__ui;
      const game = window.__game;

      // 重建完整场景：开新局 → 暂停 → 选关卡 → 选植物面板
      game.startLevel(1, false, false);
      game.skipCountdown();
      game.spawnZombie('normal', 0);

      ui.pauseGame();
      ui.openLevelSelect();

      ui._pickerFromPause = true;
      ui.isPaused = true;
      game.isPaused = true;
      ui.closeLevelSelect();
      document.getElementById('pause-overlay').classList.add('hidden');
      ui.openPlantPicker({ endless: false, sandbox: false, levelId: 2 });

      const xBefore = game.zombies[0] ? game.zombies[0].x : null;

      // 点"返回"
      document.getElementById('plant-pick-back').click();

      const d = (id) => getComputedStyle(document.getElementById(id)).display;
      const snapshot = {
        pickerHidden: document.getElementById('plant-pick-overlay').classList.contains('hidden'),
        pauseOverlayVisible: !document.getElementById('pause-overlay').classList.contains('hidden'),
        levelSelectVisible: !document.getElementById('level-select').classList.contains('hidden'),
        pauseMenuHidden: document.getElementById('pause-menu').classList.contains('hidden'),
        uiPaused: ui.isPaused,
        gamePaused: game.isPaused,
        shovel: d('shovel-btn'),
        xBefore,
      };
      // 冻结验证
      for (let i = 0; i < 5; i++) game.update(1000);
      const xAfter = game.zombies[0] ? game.zombies[0].x : null;
      snapshot.frozen = xBefore === xAfter;
      snapshot.xAfter = xAfter;

      return snapshot;
    });
    record('T5: 点"返回"后选植物面板隐藏', t5.pickerHidden === true, `hidden=${t5.pickerHidden}`, 'true');
    record('T5: #pause-overlay 已恢复显示(暂停菜单重现)', t5.pauseOverlayVisible === true, `visible=${t5.pauseOverlayVisible}`, 'true');
    record('T5: 关卡选择网格仍显示(停留在 level-select)', t5.levelSelectVisible === true, `visible=${t5.levelSelectVisible}`, 'true');
    record('T5: ui.isPaused === true (保持暂停)', t5.uiPaused === true, t5.uiPaused, 'true');
    record('T5: game.isPaused === true', t5.gamePaused === true, t5.gamePaused, 'true');
    record('T5: #shovel-btn 隐藏', t5.shovel === 'none', t5.shovel, "'none'");
    record('T5: 返回后旧关卡仍冻结(5×update 后 x 不变)', t5.frozen === true, `xBefore=${t5.xBefore}, xAfter=${t5.xAfter}`, 'xBefore===xAfter');

    // ============================================================
    // 汇总
    // ============================================================
    console.log('\n========================================');
    console.log('📊 HUD 矩阵验证结果汇总');
    console.log('========================================');

    const failed = results.filter((r) => !r.ok);
    results.forEach((r) => {
      console.log(`  [${r.ok ? 'PASS' : 'FAIL'}] ${r.label}`);
      if (!r.ok) console.log(`         实际: ${r.actual} | 期望: ${r.expected}`);
    });
    console.log('----------------------------------------');
    console.log(`  共 ${results.length} 项断言，${results.length - failed.length} 通过，${failed.length} 失败`);

    if (consoleErrors.length > 0) {
      console.log(`\n⚠️  发现 ${consoleErrors.length} 个控制台错误:`);
      consoleErrors.forEach((e) => console.log('  - ' + e));
    } else {
      console.log('\n✅ 无控制台错误');
    }

    if (failed.length > 0 || consoleErrors.length > 0) {
      console.log('\n❌ 验证未通过，详见上方 FAIL / 控制台错误。');
      process.exitCode = 1;
    } else {
      console.log('\n✅ 全部断言通过，HUD 交互矩阵行为符合预期。');
    }
  } finally {
    await browser.close();
    server.close();
  }
}

run().catch((err) => {
  console.error('\n❌ 验证脚本异常:', err.message);
  process.exit(1);
});
