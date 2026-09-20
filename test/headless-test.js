// ============================================================
// 无头浏览器测试脚本
// 使用 Puppeteer 自动测试游戏并截图
// ============================================================

const puppeteer = require('puppeteer');
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SHOT_DIR = path.join(__dirname, 'screenshots');
const PORT = 8899;

// 确保截图目录存在
if (!fs.existsSync(SHOT_DIR)) {
  fs.mkdirSync(SHOT_DIR, { recursive: true });
}

// 简单静态文件服务器
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
    // 仅绑定 IPv4 回环地址，避免与系统代理(如 Clash Verge)在 IPv6 :: 上的端口占用冲突
    server.listen(PORT, '127.0.0.1', () => resolve(server));
  });
}

// 等待指定时间
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// 收集页面控制台错误
const consoleErrors = [];

async function runTests() {
  console.log('🚀 启动无头浏览器测试...');
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

    // ==========================================
    // 测试 1: 加载主菜单
    // ==========================================
    console.log('\n📋 测试 1: 加载主菜单');
    await page.goto(`http://localhost:${PORT}`, { waitUntil: 'networkidle0', timeout: 15000 });
    await sleep(1000);

    // 检查游戏是否初始化
    const initState = await page.evaluate(() => {
      const game = window.__game;
      return {
        hasGame: !!game,
        state: game ? game.state : null,
        menuVisible: !document.getElementById('menu-overlay').classList.contains('hidden'),
        plantCards: document.querySelectorAll('.plant-card').length,
        canvasSize: {
          w: document.getElementById('game-canvas').width,
          h: document.getElementById('game-canvas').height,
        },
      };
    });

    console.log('  游戏状态:', JSON.stringify(initState));
    if (!initState.hasGame) throw new Error('游戏未初始化!');
    if (initState.state !== 'menu') throw new Error(`初始状态应为 menu, 实际为 ${initState.state}`);
    if (!initState.menuVisible) throw new Error('主菜单未显示!');
    if (initState.plantCards !== 11) throw new Error(`应有 11 张植物卡片, 实际 ${initState.plantCards}`);
    if (initState.canvasSize.w !== 960 || initState.canvasSize.h !== 600) {
      throw new Error(`画布尺寸错误: ${JSON.stringify(initState.canvasSize)}`);
    }

    await page.screenshot({ path: path.join(SHOT_DIR, '01-main-menu.png') });
    console.log('  ✅ 主菜单截图已保存: test/screenshots/01-main-menu.png');

    // ==========================================
    // 测试 2: 开始游戏
    // ==========================================
    console.log('\n📋 测试 2: 开始游戏');
    await page.click('#start-btn');
    await sleep(500);

    const playState = await page.evaluate(() => {
      const game = window.__game;
      return {
        state: game.state,
        sun: game.sun,
        menuHidden: document.getElementById('menu-overlay').classList.contains('hidden'),
        waveText: document.getElementById('wave-text').textContent,
      };
    });

    console.log('  游戏状态:', JSON.stringify(playState));
    if (playState.state !== 'playing') throw new Error(`开始后状态应为 playing, 实际为 ${playState.state}`);
    if (playState.sun !== 150) throw new Error(`初始阳光应为 150, 实际为 ${playState.sun}`);
    if (!playState.menuHidden) throw new Error('主菜单未隐藏!');

    await page.screenshot({ path: path.join(SHOT_DIR, '02-game-start.png') });
    console.log('  ✅ 游戏开始截图已保存: test/screenshots/02-game-start.png');

    // ==========================================
    // 测试 3: 放置植物
    // ==========================================
    console.log('\n📋 测试 3: 放置植物');

    // 选择向日葵卡片(第1张)
    const cards = await page.$$('.plant-card');
    if (cards.length < 1) throw new Error('植物卡片不存在!');
    await cards[0].click(); // 向日葵
    await sleep(200);

    // 点击画布放置(第2行第3列)
    const canvasRect = await page.evaluate(() => {
      const rect = document.getElementById('game-canvas').getBoundingClientRect();
      return { x: rect.left, y: rect.top };
    });
    // 第2行(row=1) 第3列(col=2) 中心点 (加上网格偏移60)
    const cellX = canvasRect.x + 60 + 2 * 100 + 50;
    const cellY = canvasRect.y + 1 * 120 + 60;
    await page.mouse.click(cellX, cellY);
    await sleep(300);

    // 放置豌豆射手(第2张卡片)
    await cards[1].click(); // 豌豆射手
    await sleep(200);
    const cellX2 = canvasRect.x + 60 + 3 * 100 + 50;
    const cellY2 = canvasRect.y + 1 * 120 + 60;
    await page.mouse.click(cellX2, cellY2);
    await sleep(300);

    const plantState = await page.evaluate(() => {
      const game = window.__game;
      return {
        plantCount: game.plants.length,
        sun: game.sun,
        gridOccupied: game.grid.flat().filter(c => c !== null).length,
        selectedPlant: game.selectedPlant ? game.selectedPlant.id : null,
      };
    });

    console.log('  植物状态:', JSON.stringify(plantState));
    if (plantState.plantCount !== 2) throw new Error(`应放置 2 个植物, 实际 ${plantState.plantCount}`);
    if (plantState.gridOccupied !== 2) throw new Error(`网格占用应为 2, 实际 ${plantState.gridOccupied}`);
    if (plantState.sun !== 0) throw new Error(`放置后阳光应为 0 (150-50-100), 实际 ${plantState.sun}`);

    await page.screenshot({ path: path.join(SHOT_DIR, '03-plants-placed.png') });
    console.log('  ✅ 植物放置截图已保存: test/screenshots/03-plants-placed.png');

    // ==========================================
    // 测试 4: 游戏循环运行
    // ==========================================
    console.log('\n📋 测试 4: 游戏循环运行');
    await sleep(3000);

    const loopState = await page.evaluate(() => {
      const game = window.__game;
      return {
        state: game.state,
        gameTime: game.gameTime,
        zombieCount: game.zombies.length,
        sunCount: game.suns.length,
        projectiles: game.projectiles.length,
      };
    });

    console.log('  循环状态:', JSON.stringify(loopState));
    if (loopState.state !== 'playing') throw new Error(`游戏应仍在进行, 实际为 ${loopState.state}`);
    if (loopState.gameTime < 2000) throw new Error(`游戏时间未正常推进: ${loopState.gameTime}`);

    await page.screenshot({ path: path.join(SHOT_DIR, '04-gameplay-loop.png') });
    console.log('  ✅ 游戏循环截图已保存: test/screenshots/04-gameplay-loop.png');

    // ==========================================
    // 测试 5: 僵尸生成
    // ==========================================
    console.log('\n📋 测试 5: 僵尸生成');
    // 等待僵尸生成(第一波第一个僵尸 delay=0)
    await sleep(2000);

    const zombieState = await page.evaluate(() => {
      const game = window.__game;
      return {
        zombieCount: game.zombies.length,
        waveInfo: game.levelManager.getWaveInfo(),
        aliveZombies: game.getAliveZombieCount(),
      };
    });

    console.log('  僵尸状态:', JSON.stringify(zombieState));
    if (zombieState.zombieCount < 1) throw new Error('应有僵尸生成!');

    await page.screenshot({ path: path.join(SHOT_DIR, '05-zombies-spawned.png') });
    console.log('  ✅ 僵尸生成截图已保存: test/screenshots/05-zombies-spawned.png');

    // ==========================================
    // 测试 6: 逻辑检查 - 僵尸移动
    // ==========================================
    console.log('\n📋 测试 6: 僵尸移动逻辑');
    const moveState1 = await page.evaluate(() => {
      const game = window.__game;
      const z = game.zombies[0];
      return z ? { x: z.x, row: z.row, hp: z.hp } : null;
    });

    await sleep(1500);

    const moveState2 = await page.evaluate(() => {
      const game = window.__game;
      const z = game.zombies[0];
      return z ? { x: z.x, row: z.row, hp: z.hp } : null;
    });

    console.log('  移动前:', JSON.stringify(moveState1));
    console.log('  移动后:', JSON.stringify(moveState2));

    if (moveState1 && moveState2) {
      if (moveState2.x >= moveState1.x) {
        throw new Error(`僵尸应向左移动, 移动前 x=${moveState1.x}, 移动后 x=${moveState2.x}`);
      }
    }

    // ==========================================
    // 测试 7: 阳光收集
    // ==========================================
    console.log('\n📋 测试 7: 阳光收集');
    // 手动添加一个阳光并收集
    const sunTest = await page.evaluate(() => {
      const game = window.__game;
      const before = game.sun;
      game.spawnSun(400, 300, 25, 'test');
      const sun = game.suns[game.suns.length - 1];
      game.collectSun(sun);
      return { before, after: game.sun };
    });

    console.log('  阳光变化:', JSON.stringify(sunTest));
    if (sunTest.after !== sunTest.before + 25) {
      throw new Error(`阳光收集逻辑错误: ${sunTest.before} -> ${sunTest.after}`);
    }

    // ==========================================
    // 测试 8: 冷却系统
    // ==========================================
    console.log('\n📋 测试 8: 冷却系统');
    // 先给玩家一些阳光，然后放置一个新植物以触发冷却
    await page.evaluate(() => {
      const game = window.__game;
      game.sun = 200;
      game.emitSunChange();
    });
    await sleep(100);
    // 选择并放置坚果墙(便宜且冷却长)
    const cards2 = await page.$$('.plant-card');
    await cards2[3].click(); // 坚果墙
    await sleep(200);
    const canvasRect2 = await page.evaluate(() => {
      const rect = document.getElementById('game-canvas').getBoundingClientRect();
      return { x: rect.left, y: rect.top };
    });
    await page.mouse.click(canvasRect2.x + 60 + 4 * 100 + 50, canvasRect2.y + 2 * 120 + 60);
    await sleep(300);

    const cooldownState = await page.evaluate(() => {
      const ui = window.__ui;
      const cd = ui.cardCooldowns['wallnut'];
      return {
        hasCooldown: !!cd,
        remaining: cd ? cd.remaining : null,
        total: cd ? cd.total : null,
      };
    });

    console.log('  冷却状态:', JSON.stringify(cooldownState));
    if (!cooldownState.hasCooldown || cooldownState.remaining <= 0) {
      throw new Error('坚果墙应处于冷却状态!');
    }

    // ==========================================
    // 测试 9: 游戏结束状态
    // ==========================================
    console.log('\n📋 测试 9: 游戏结束状态');
    // 强制设置失败状态
    await page.evaluate(() => {
      const game = window.__game;
      game.state = 'lose';
      game.emitStateChange();
    });
    await sleep(300);

    const loseState = await page.evaluate(() => {
      return {
        resultVisible: !document.getElementById('result-overlay').classList.contains('hidden'),
        resultTitle: document.getElementById('result-title').textContent,
      };
    });

    console.log('  失败状态:', JSON.stringify(loseState));
    if (!loseState.resultVisible) throw new Error('失败覆盖层未显示!');

    await page.screenshot({ path: path.join(SHOT_DIR, '06-game-over.png') });
    console.log('  ✅ 游戏结束截图已保存: test/screenshots/06-game-over.png');

    // 重新开始
    await page.click('#restart-btn');
    await sleep(300);
    const restartState = await page.evaluate(() => {
      const game = window.__game;
      return { state: game.state, sun: game.sun };
    });
    console.log('  重新开始状态:', JSON.stringify(restartState));
    if (restartState.state !== 'playing') throw new Error('重新开始后应为 playing!');

    // ==========================================
    // 测试 10: 割草机机制
    // ==========================================
    console.log('\n📋 测试 10: 割草机机制');
    const mowerState = await page.evaluate(() => {
      const game = window.__game;
      // 1. 每关开局应为每行准备 1 台割草机
      if (!Array.isArray(game.mowers) || game.mowers.length !== CONFIG.ROWS) {
        return { ok: false, reason: `割草机数量错误: ${game.mowers ? game.mowers.length : 'undefined'}` };
      }
      // 2. 强制触发某行割草机并验证清整行（含后方僵尸）
      const row = 0;
      game.zombies = [];
      game.spawnZombie('normal', row); game.zombies[0].x = 50;   // 越过触发线
      game.spawnZombie('normal', row); game.zombies[1].x = 150;  // 后方未越线
      game.spawnZombie('normal', row); game.zombies[2].x = 300;  // 更后方
      game.updateMowers(100);
      const mower = game.mowers[row];
      const remainingRowZombies = game.zombies.filter(z => z.row === row && !z.dead).length;
      // 3. 割草机触发后应清整行且保持 playing 状态
      return { ok: mower.spent === true && remainingRowZombies === 0 && game.state === 'playing', remainingRowZombies, state: game.state };
    });
    console.log('  割草机状态:', JSON.stringify(mowerState));
    if (!mowerState.ok) throw new Error(`割草机机制异常: ${mowerState.reason || JSON.stringify(mowerState)}`);

    // ==========================================
    // 测试 10b: 割草机清除后不应触发失败
    // ==========================================
    const mowerNoLose = await page.evaluate(() => {
      const game = window.__game;
      game.startLevel(1);
      game.zombies = [];
      game.spawnZombie('normal', 1); game.zombies[0].x = 55; // 越过触发线 80 但 > HOUSE_X 60
      game.mowers[1].spent = false;
      game.updateMowers(100);
      return { ok: game.state === 'playing' && !game.zombies.some(z => z.row === 1 && !z.dead), state: game.state };
    });
    console.log('  割草机清整行后不触发失败:', JSON.stringify(mowerNoLose));
    if (!mowerNoLose.ok) throw new Error('割草机清整行后游戏不应失败!');

    // ==========================================
    // 测试 11: 铲子机制
    // ==========================================
    console.log('\n📋 测试 11: 铲子机制');
    const shovelState = await page.evaluate(() => {
      const game = window.__game;
      // 1. 放置一个坚果墙
      game.sun = 200;
      game.placePlant('wallnut', 2, 3);
      if (!game.grid[2][3]) return { ok: false, reason: '放置坚果墙失败' };
      // 2. 铲除应回收 50% 阳光（50 * 0.5 = 25）
      const sunBefore = game.sun;
      const refund = game.removePlant(2, 3);
      const cleared = game.grid[2][3] === null;
      const sunAfter = game.sun;
      // 3. 铲空格子返回 0 且阳光不变
      const emptyRefund = game.removePlant(2, 3);
      return { ok: refund === 25 && cleared && sunAfter === sunBefore + 25 && emptyRefund === 0, refund, cleared, sunDelta: sunAfter - sunBefore, emptyRefund };
    });
    console.log('  铲子状态:', JSON.stringify(shovelState));
    if (!shovelState.ok) throw new Error(`铲子机制异常: ${shovelState.reason || JSON.stringify(shovelState)}`);
    // 4. 铲子按钮存在且可切换
    const shovelBtnOk = await page.evaluate(() => {
      const btn = document.getElementById('shovel-btn');
      if (!btn) return false;
      const game = window.__game;
      game.shovelMode = true;
      return !game.selectedPlant;
    });
    if (!shovelBtnOk) throw new Error('铲子按钮不存在或切换异常!');

    // ==========================================
    // 测试 12: 检查点恢复
    // ==========================================
    console.log('\n📋 测试 12: 检查点恢复');
    const cpResult = await page.evaluate(() => {
      const game = window.__game;
      // 1. 保存一个检查点
      SaveStore.saveCheckpoint(1, 1, 200,
        [{ typeId: 'wallnut', row: 1, col: 3, hp: 400, maxHp: 400 }],
        [{ typeId: 'normal', row: 1, x: 500, hp: 100, maxHp: 100 }]
      );
      const hadCp = !!SaveStore.loadCheckpoint(1);
      // 2. 模拟失败后恢复
      game.state = 'lose';
      game.emitStateChange();
      const restored = game.restoreCheckpoint(1);
      const overlayHidden = document.getElementById('result-overlay').classList.contains('hidden');
      const state = game.state;
      const plantCount = game.plants.length;
      const zombieCount = game.zombies.length;
      return {
        ok: hadCp && restored && overlayHidden && state === 'playing' && plantCount === 1 && zombieCount === 1,
        hadCp, restored, overlayHidden, state, plantCount, zombieCount,
      };
    });
    console.log('  检查点恢复:', JSON.stringify(cpResult));
    if (!cpResult.ok) throw new Error(`检查点恢复异常: ${JSON.stringify(cpResult)}`);

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
      // 分小步推进，避免单帧大 dt 触发完整模拟副作用
      for (let i = 0; i < Math.ceil((CONFIG.SUN_FALL_INTERVAL + 100) / 16); i++) {
        game.update(16);
      }
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

    // ==========================================
    // 汇总
    // ==========================================
    console.log('\n========================================');
    console.log('📊 测试结果汇总');
    console.log('========================================');

    if (consoleErrors.length > 0) {
      console.log(`⚠️  发现 ${consoleErrors.length} 个控制台错误:`);
      consoleErrors.forEach(e => console.log(`  - ${e}`));
    } else {
      console.log('✅ 无控制台错误');
    }

    console.log('✅ 所有测试通过!');
    console.log(`📸 截图已保存至: ${SHOT_DIR}`);

  } finally {
    await browser.close();
    server.close();
  }
}

runTests().catch(err => {
  console.error('\n❌ 测试失败:', err.message);
  process.exit(1);
});