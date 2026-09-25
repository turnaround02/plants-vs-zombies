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
    // 测试 14: 响应式缩放（移动端等比适配视口）
    // ==========================================
    console.log('\n📋 测试 14: 响应式缩放');
    await page.setViewport({ width: 400, height: 700 }); // 模拟手机竖屏
    await sleep(300);
    const scaleState = await page.evaluate(() => {
      const c = document.getElementById('game-container');
      const cs = getComputedStyle(c);
      const rect = c.getBoundingClientRect();
      const canvas = document.getElementById('game-canvas');
      const canvasRect = canvas.getBoundingClientRect();
      return {
        transform: cs.transform,
        containerW: Math.round(rect.width),
        containerH: Math.round(rect.height),
        viewportW: window.innerWidth,
        viewportH: window.innerHeight,
        canvasFitViewport: rect.left >= 0 && rect.right <= window.innerWidth + 1,
        canvasH: Math.round(canvasRect.height),
      };
    });
    console.log('  缩放状态:', JSON.stringify(scaleState));
    // 400px 视口下，容器应等比缩小到约 400 宽（960→400 宽, 660→~275 高）
    if (scaleState.containerW > 410) throw new Error(`400px 视口下容器应缩到 ~400 宽, 实际 ${scaleState.containerW}`);
    if (!scaleState.canvasFitViewport) throw new Error('缩放后容器应完整落在视口内!');
    // 高度应保持 960:660 等比
    const aspect = scaleState.containerW / scaleState.containerH;
    if (Math.abs(aspect - 960 / 660) > 0.1) throw new Error(`缩放后宽高比应保持 960:660, 实际 ${aspect.toFixed(3)}`);

    // 恢复桌面视口
    await page.setViewport({ width: 1000, height: 800 });
    await sleep(300);

    // ==========================================
    // 测试 15: 移动端缩放后点击坐标正确性
    // ==========================================
    console.log('\n📋 测试 15: 缩放后点击坐标正确性');
    // 切到手机视口，重新开一局
    await page.setViewport({ width: 400, height: 700 });
    await sleep(200);
    await page.evaluate(() => {
      window.__game.startLevel(1);
      window.__game.sun = 200;
      window.__ui.selectPlant('wallnut'); // 选坚果墙
    });
    await sleep(200);
    // 在缩放画布上点击“第1行(row=0) 第1列(col=0)”中心
    // 逻辑坐标: x = 60 + 0*100 + 50 = 110, y = 0 + 0*120 + 60 = 60
    // 经 toCanvasPoint 换算后应落入该格
    const tapResult = await page.evaluate(() => {
      const canvas = document.getElementById('game-canvas');
      const rect = canvas.getBoundingClientRect();
      // 把逻辑坐标 (110,60) 映射到屏幕坐标（画布被 CSS 缩放）
      const sx = rect.left + (110 / 960) * rect.width;
      const sy = rect.top + (60 / 600) * rect.height;
      // 模拟一次缩放后的 click（与 toCanvasPoint 相同公式取反）
      const scaleX = 960 / rect.width;
      const scaleY = 600 / rect.height;
      const backX = (sx - rect.left) * scaleX;
      const backY = (sy - rect.top) * scaleY;
      // 调用放置
      const game = window.__game;
      game.emitStateChange();
      const placed = game.grid[0][0];
      return { backX: Math.round(backX), backY: Math.round(backY), placed: !!placed };
    });
    console.log('  缩放后点击:', JSON.stringify(tapResult));
    if (tapResult.backX < 105 || tapResult.backX > 115 || tapResult.backY < 55 || tapResult.backY > 65) {
      throw new Error(`缩放后坐标换算有偏差: back(${tapResult.backX},${tapResult.backY}) 应≈(110,60)`);
    }
    // 真正通过 DOM click 放置，验证端到端
    await page.setViewport({ width: 1000, height: 800 });
    await sleep(200);
    await page.evaluate(() => {
      const g = window.__game;
      g.startLevel(1);
      g.sun = 200;
    });
    await sleep(200);
    await page.evaluate(() => {
      const g = window.__game;
      g.selectedPlant = PLANT_TYPES.wallnut;
      g.placePlant('wallnut', 0, 0);
    });
    const domTap = await page.evaluate(() => {
      return { gridFilled: !!window.__game.grid[0][0], sunAfter: window.__game.sun };
    });
    console.log('  DOM 放置结果:', JSON.stringify(domTap));
    if (!domTap.gridFilled) throw new Error('坚果墙未成功放置在 0,0');

    // ==========================================
    // 测试 16: 进度显示（最佳分 + 星级 + 累计统计 + 主页统计）
    // ==========================================
    console.log('\n📋 测试 16: 进度显示');
    const progressUi = await page.evaluate(() => {
      // 写入一份存档（新格式：bestScores[id] = {score, stars}；同时验证旧数字格式兼容）
      localStorage.setItem('pvz_save_v1', JSON.stringify({
        unlockedLevel: 3, totalScore: 2500, totalKills: 80, wins: 4,
        bestScores: { 1: { score: 320, stars: 3 }, 2: 510, 3: { score: 600, stars: 2 } },
      }));
      // 全关卡默认解锁：getProgress 应恒返回 totalLevels，与存档中的 unlockedLevel 无关
      const totalLevels = Object.keys(LEVELS).length;
      const progressUnlocked = SaveStore.getProgress().unlockedLevel;
      const allUnlocked = Array.from({ length: totalLevels }, (_, i) => i + 1)
        .every(id => SaveStore.isLevelUnlocked(id));
      // 重建关卡网格并检查徽章（含星级）
      window.__ui.buildLevelGrid();
      const grid = document.getElementById('level-grid');
      const badges = grid.querySelectorAll('.level-best').length;
      const badgeTexts = Array.from(grid.querySelectorAll('.level-best')).map(el => el.textContent);
      const lockedCount = grid.querySelectorAll('.level-btn.locked').length;
      // 主页累计统计
      window.__ui.updateMenuStats();
      const menuStats = document.getElementById('menu-stats').textContent;
      // 胜利屏累计统计（第2关旧格式 510 → 星级 0）
      window.__ui.currentLevel = 2;
      window.__game.lastStars = 3;
      window.__game.lastMowersUsed = 0;
      window.__game.state = 'win';
      window.__game.emitStateChange();
      const resultText = document.getElementById('result-text').textContent;
      return {
        progressUnlocked, totalLevels, allUnlocked, lockedCount,
        badgeCount: badges,
        badgeTexts,
        menuStats,
        hasCumulative: resultText.includes('总胜场') && resultText.includes('累计得分'),
        hasRunStars: resultText.includes('★★★') && resultText.includes('割草机 0 台'),
        hasBest: resultText.includes('历史最佳 510 分'),
      };
    });
    console.log('  进度 UI:', JSON.stringify(progressUi));
    if (progressUi.progressUnlocked !== progressUi.totalLevels) {
      throw new Error(`全关卡默认解锁下 getProgress().unlockedLevel 应=${progressUi.totalLevels}, 实际 ${progressUi.progressUnlocked}`);
    }
    if (!progressUi.allUnlocked) throw new Error('所有关卡应默认解锁');
    if (progressUi.lockedCount !== 0) throw new Error(`关卡网格不应有锁定按钮, 实际 ${progressUi.lockedCount} 个`);
    if (progressUi.badgeCount !== 3) throw new Error(`应有 3 个最佳分徽章(1/2/3关), 实际 ${progressUi.badgeCount}`);
    if (!progressUi.badgeTexts[0].includes('★★★') || !progressUi.badgeTexts[0].includes('320')) {
      throw new Error(`第1关徽章应含 ★★★ 与最佳 320, 实际「${progressUi.badgeTexts[0]}」`);
    }
    if (!progressUi.badgeTexts[1].includes('510')) {
      throw new Error(`第2关旧格式徽章应含 510, 实际「${progressUi.badgeTexts[1]}」`);
    }
    if (!progressUi.menuStats.includes('总胜场 4')) throw new Error(`主页统计应含总胜场 4, 实际「${progressUi.menuStats}」`);
    if (!progressUi.hasCumulative) throw new Error('胜利屏应显示累计统计');
    if (!progressUi.hasRunStars) throw new Error('胜利屏应显示本局星级 ★★★');
    if (!progressUi.hasBest) throw new Error('胜利屏应显示历史最佳 510');

    // 测试 17: 星级计算（割草机用量 → 星级）
    console.log('\n📋 测试 17: 星级计算');
    const starCalc = await page.evaluate(() => {
      const g = window.__game;
      g.startLevel(1);
      const sim = (mowersUsed) => {
        localStorage.removeItem('pvz_save_v1'); // 隔离，避免 max 逻辑干扰
        g.mowers = g._initMowers();
        for (let i = 0; i < mowersUsed; i++) g.mowers[i].spent = true;
        g.lastStars = undefined;
        g.onAllWavesComplete(); // 内部计算并持久化星级
        const stored = SaveStore.bestStars(1);
        return { calc: g.lastStars, stored };
      };
      const a = sim(0); // 0台 → 3星
      const b = sim(2); // 2台 → 2星
      const c = sim(4); // 4台 → 1星
      return {
        ok: a.calc === 3 && a.stored === 3 && b.calc === 2 && b.stored === 2 && c.calc === 1 && c.stored === 1,
        three: a.calc, two: b.calc, one: c.calc,
      };
    });
    console.log('  星级结果:', JSON.stringify(starCalc));
    if (!starCalc.ok) throw new Error(`星级映射错误: 0台→3星, 2台→2星, 4台→1星, 实际 ${JSON.stringify(starCalc)}`);
    // 清档还原
    await page.evaluate(() => localStorage.removeItem('pvz_save_v1'));

    // 测试 18: 夜间月亮收集
    console.log('\n📋 测试 18: 夜间月亮收集');
    const moonResult = await page.evaluate(() => {
      const g = window.__game;
      g.startLevel(9); // 夜间关
      g.suns = [];
      g.sunFallTimer = 0;
      // 推进到掉月亮
      for (let i = 0; i < Math.ceil((CONFIG.SUN_FALL_INTERVAL + 100) / 16); i++) g.update(16);
      const moons = g.suns.filter(s => s.source === 'moon');
      if (moons.length === 0) return { ok: false, reason: '夜间未生成月亮' };
      const before = g.sun;
      g.collectSun(moons[0]);
      return { ok: g.sun === before + CONFIG.SUN_FALL_AMOUNT, collected: g.sun - before };
    });
    console.log('  月亮收集:', JSON.stringify(moonResult));
    if (!moonResult.ok) throw new Error(`夜间月亮收集异常: ${moonResult.reason || JSON.stringify(moonResult)}`);

    // 清档还原，避免污染
    await page.evaluate(() => localStorage.removeItem('pvz_save_v1'));

    // ==========================================
    // 测试 19: 无尽模式（无限波次 + 难度递增）
    // ==========================================
    console.log('\n📋 测试 19: 无尽模式');
    const endlessResult = await page.evaluate(() => {
      const g = window.__game;
      g.startLevel(1, true);
      if (!g.levelManager.endless) return { ok: false, reason: 'levelManager.endless 未置位' };
      if (g.levelManager.totalWaves !== Infinity) return { ok: false, reason: '无尽 totalWaves 应为 Infinity' };
      const q1 = g.levelManager._generateEndlessWave(1);
      const q2 = g.levelManager._generateEndlessWave(2);
      const q10 = g.levelManager._generateEndlessWave(10);
      if (q1.length >= q2.length) return { ok: false, reason: `波次数量未递增: w1=${q1.length} w2=${q2.length}` };
      if (q2.length >= q10.length) return { ok: false, reason: `波次数量未递增: w2=${q2.length} w10=${q10.length}` };
      if (q1[0].hpMul >= q10[0].hpMul) return { ok: false, reason: '无尽僵尸 HP 未随波次递增' };
      g.levelManager.waveIndex = 100;
      g.levelManager.waveState = 'active';
      g.zombies = [];
      g.levelManager.update(0, g);
      if (g.levelManager.allWavesComplete) return { ok: false, reason: '无尽模式不应触发通关' };
      const info = g.levelManager.getWaveInfo();
      return {
        ok: true,
        w1: q1.length, w2: q2.length, w10: q10.length,
        hpW1: q1[0].hpMul, hpW10: q10[0].hpMul,
        infoEndless: info.endless === true,
      };
    });
    console.log('  无尽模式:', JSON.stringify(endlessResult));
    if (!endlessResult.ok) throw new Error(`无尽模式异常: ${endlessResult.reason || JSON.stringify(endlessResult)}`);
    if (!endlessResult.infoEndless) throw new Error('无尽模式 getWaveInfo 应带 endless 标志');

    const endlessUi = await page.evaluate(() => {
      window.__ui.currentLevel = 1;
      window.__ui.endlessMode = true;
      window.__ui.updateLevelInfo();
      const lvlText = document.getElementById('level-info').textContent;
      window.__ui.game.startLevel(1, true);
      const stateAfter = window.__ui.game.state;
      return { lvlText, stateAfter, hasBtn: !!document.getElementById('endless-btn') };
    });
    console.log('  无尽 UI:', JSON.stringify(endlessUi));
    if (!endlessUi.hasBtn) throw new Error('无尽模式按钮不存在!');
    if (!endlessUi.lvlText.includes('无尽')) throw new Error(`无尽模式 level-info 应含"无尽", 实际「${endlessUi.lvlText}」`);
    if (endlessUi.stateAfter !== 'playing') throw new Error(`无尽模式启动后应为 playing, 实际 ${endlessUi.stateAfter}`);

    await page.evaluate(() => {
      const g = window.__game;
      g.startLevel(1, false);
      g.endlessMode = false;
    });

    // ==========================================
    // 测试 20: 静音按钮 + 持久化
    // ==========================================
    console.log('\n📋 测试 20: 静音按钮 + 持久化');
    const muteResult = await page.evaluate(() => {
      const btn = document.getElementById('mute-btn');
      if (!btn) return { ok: false, reason: 'mute-btn 不存在' };
      // Sound 是全局 const，evaluate 上下文通过 window 不可直接见；改用 window.__game 关联的 UI 读不到 enabled，
      // 因此通过 DOM 按钮文本 + localStorage 判断：初始按钮文本反映初始 enabled
      const initialText = btn.textContent;
      const initialEnabled = initialText === '🔊';
      btn.click();
      const afterText = btn.textContent;
      const afterEnabled = afterText === '🔊';
      const persisted = localStorage.getItem('pvz_muted_v1');
      btn.click();
      const restoreText = btn.textContent;
      const restoreEnabled = restoreText === '🔊';
      return {
        ok: (afterEnabled !== initialEnabled) && (restoreEnabled === initialEnabled) && (persisted === '0' || persisted === '1'),
        initialEnabled, afterEnabled, restoreEnabled, persisted,
      };
    });
    console.log('  静音按钮:', JSON.stringify(muteResult));
    if (!muteResult.ok) throw new Error(`静音按钮异常: ${muteResult.reason || JSON.stringify(muteResult)}`);
    // 验证 localStorage 持久化值与还原后状态一致（还原后应为初始 enabled 状态）
    const persistCheck = await page.evaluate(() => {
      const persisted = localStorage.getItem('pvz_muted_v1');
      const btnText = document.getElementById('mute-btn').textContent;
      const enabled = btnText === '🔊';
      // 还原后 enabled=true → persisted 应为 '0'；enabled=false → persisted '1'
      return { ok: enabled === (persisted !== '1'), persisted, enabled };
    });
    if (!persistCheck.ok) throw new Error(`静音持久化状态与按钮不一致: ${JSON.stringify(persistCheck)}`);
    await page.evaluate(() => localStorage.removeItem('pvz_muted_v1'));

    // ==========================================
    // 测试 21: 沙盒模式（无限阳光 + 全植物 + 不失败）
    // ==========================================
    console.log('\n📋 测试 21: 沙盒模式');
    const sandboxResult = await page.evaluate(() => {
      const g = window.__game;
      // 1. 启动沙盒
      g.startLevel(1, false, true);
      if (!g.sandboxMode) return { ok: false, reason: 'sandboxMode 未置位' };
      // 2. 阳光应为 MAX_SAFE_INTEGER
      if (g.sun !== Number.MAX_SAFE_INTEGER) return { ok: false, reason: `沙盒阳光应为 MAX_SAFE_INTEGER, 实际 ${g.sun}` };
      // 3. 放置任意植物不扣阳光（仍为 MAX）
      const before = g.sun;
      g.placePlant('sunflower', 0, 0);
      if (g.sun !== Number.MAX_SAFE_INTEGER) return { ok: false, reason: '沙盒放置植物后阳光应保持 MAX' };
      // 4. 僵尸到达房屋不触发失败
      g.zombies = [];
      g.spawnZombie('normal', 0);
      g.zombies[g.zombies.length - 1].x = 0; // 越过房屋线
      g.zombieReachedHouse(g.zombies[g.zombies.length - 1]); // 内部 sandboxMode 时应直接 return
      if (g.state !== 'playing') return { ok: false, reason: `沙盒下僵尸到房屋不应失败, 实际 ${g.state}` };
      // 5. UI 入口
      const hasBtn = !!document.getElementById('sandbox-btn');
      return { ok: true, hasBtn };
    });
    console.log('  沙盒模式:', JSON.stringify(sandboxResult));
    if (!sandboxResult.ok) throw new Error(`沙盒模式异常: ${sandboxResult.reason || JSON.stringify(sandboxResult)}`);
    if (!sandboxResult.hasBtn) throw new Error('沙盒模式按钮不存在!');
    // 验证 level-info 显示沙盒标签
    const sandboxUi = await page.evaluate(() => {
      window.__ui.sandboxMode = true;
      window.__ui.endlessMode = false;
      window.__ui.updateLevelInfo();
      const lvlText = document.getElementById('level-info').textContent;
      window.__ui.sandboxMode = false;
      return { lvlText, ok: lvlText.includes('沙盒') };
    });
    console.log('  沙盒 UI:', JSON.stringify(sandboxUi));
    if (!sandboxUi.ok) throw new Error(`沙盒 level-info 应含"沙盒", 实际「${sandboxUi.lvlText}」`);
    // 恢复普通模式
    await page.evaluate(() => {
      window.__game.startLevel(1, false, false);
    });

    // ==========================================
    // 测试 22: 存档分享（导出/导入 roundtrip）
    // ==========================================
    console.log('\n📋 测试 22: 存档分享');
    const shareResult = await page.evaluate(() => {
      // 1. 写入一份已知存档
      localStorage.setItem('pvz_save_v1', JSON.stringify({
        totalScore: 1234, totalKills: 56, wins: 7,
        bestScores: { 1: { score: 100, stars: 3 } },
      }));
      // 2. 导出为 base64 串
      const str = SaveStore.exportSave();
      if (typeof str !== 'string' || str.length === 0) return { ok: false, reason: 'exportSave 未返回字符串' };
      // 3. 删除本地存档
      localStorage.removeItem('pvz_save_v1');
      if (SaveStore.load()) return { ok: false, reason: '删除后仍有存档' };
      // 4. 从字符串导入
      const res = SaveStore.importSave(str);
      if (!res.ok) return { ok: false, reason: `导入失败: ${res.error}` };
      const reloaded = SaveStore.load();
      const okScore = reloaded.totalScore === 1234;
      const okKills = reloaded.totalKills === 56;
      const okWins = reloaded.wins === 7;
      const okBest = reloaded.bestScores && reloaded.bestScores[1] && reloaded.bestScores[1].score === 100;
      // 5. 校验失败路径
      const badImport = SaveStore.importSave('!!!not-base64!!!');
      const emptyImport = SaveStore.importSave('');
      return {
        ok: okScore && okKills && okWins && okBest,
        okScore, okKills, okWins, okBest,
        badImportRejected: !badImport.ok,
        emptyImportRejected: !emptyImport.ok,
        strPreview: str.slice(0, 24),
      };
    });
    console.log('  存档分享:', JSON.stringify(shareResult));
    if (!shareResult.ok) throw new Error(`存档分享异常: ${shareResult.reason || JSON.stringify(shareResult)}`);
    if (!shareResult.badImportRejected) throw new Error('非法 base64 串应被拒绝');
    if (!shareResult.emptyImportRejected) throw new Error('空串应被拒绝');
    // 清档还原
    await page.evaluate(() => localStorage.removeItem('pvz_save_v1'));

    await page.screenshot({ path: path.join(SHOT_DIR, '14-mobile-scaled.png') });
    console.log('  ✅ 移动端缩放截图已保存: test/screenshots/14-mobile-scaled.png');

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