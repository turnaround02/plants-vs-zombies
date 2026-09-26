// ============================================================
// 验证：暂停菜单"选关卡"后，旧关卡保持暂停，僵尸冻结不动
// 复用 headless-test.js 的 静态服务器 + 无头 Chrome 模式
// 运行: node test/verify-pause-picker.js
// ============================================================

const puppeteer = require('puppeteer');
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const PORT = 8899;

// 简单静态文件服务器（同 headless-test.js）
function startServer() {
  const mimeTypes = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.svg': 'image/svg+xml',
    '.png': 'image/png',
    '.json': 'application/json',
  };

  const server = http.createServer((req, res) => {
    let urlPath = decodeURIComponent(req.url.split('?')[0]);
    if (urlPath === '/') urlPath = '/index.html';

    const filePath = path.join(ROOT, urlPath);
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
    server.listen(PORT, '127.0.0.1', () => resolve(server));
  });
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// PASS/FAIL 结果收集
const results = [];
function assert(name, actual, expected, extra) {
  const ok = extra !== undefined ? extra : JSON.stringify(actual) === JSON.stringify(expected);
  results.push({ name, ok, actual, expected });
  const mark = ok ? '✅ PASS' : '❌ FAIL';
  console.log(`${mark}  ${name}`);
  if (!ok) {
    console.log(`        期望: ${JSON.stringify(expected)}`);
    console.log(`        实际: ${JSON.stringify(actual)}`);
  }
}

async function run() {
  const server = await startServer();
  console.log(`✅ 本地服务器已启动: http://localhost:${PORT}`);

  const browser = await puppeteer.launch({
    headless: 'new',
    executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--window-size=1000,800'],
    defaultViewport: { width: 1000, height: 800 },
  });

  const consoleErrors = [];

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

    // ========== 1. 加载页面，清空 localStorage ==========
    await page.goto(`http://localhost:${PORT}`, { waitUntil: 'networkidle0', timeout: 15000 });
    await sleep(500);
    await page.evaluate(() => {
      localStorage.clear();
      location.reload();
    });
    await page.waitForFunction(() => window.__game && window.__ui, { timeout: 15000 });
    await sleep(500);
    console.log('📋 页面已加载，localStorage 已清空');

    // ========== 2. 开局：startLevel(1) + skipCountdown + 刷一只僵尸 ==========
    const z0 = await page.evaluate(() => {
      const g = window.__game;
      g.startLevel(1, false, false);
      g.skipCountdown();
      g.spawnZombie('normal', 0);
      // 用最后一只为基准（避免开局波次额外刷出的僵尸干扰断言）
      const z = g.zombies[g.zombies.length - 1];
      return {
        state: g.state,
        zombieCount: g.zombies.length,
        zombieIndex: g.zombies.length - 1,
        zombieX: z ? z.x : null,
      };
    });
    assert('开局后 game.state === "playing"', z0.state, 'playing');
    assert('场上有僵尸（≥1）', z0.zombieCount, 1, z0.zombieCount >= 1);
    console.log(`  僵尸数量 = ${z0.zombieCount}，基准僵尸 = 最后一只（index ${z0.zombieIndex}）`);
    const zombieX0 = z0.zombieX;
    console.log(`  僵尸初始 x = ${zombieX0}`);

    // ========== 3. 模拟暂停，前进 5 帧，僵尸应冻结 ==========
    const afterPause = await page.evaluate(() => {
      const g = window.__game;
      const ui = window.__ui;
      ui.isPaused = true;
      g.isPaused = true;
      for (let i = 0; i < 5; i++) g.update(1000);
      const z = g.zombies[g.zombies.length - 1];
      return { isPausedGame: g.isPaused, isPausedUi: ui.isPaused, zombieX: z ? z.x : null };
    });
    assert('暂停标志已设置 (game.isPaused && ui.isPaused)',
      afterPause.isPausedGame && afterPause.isPausedUi, true);
    assert('暂停后前进 5 帧，僵尸 x 不变', afterPause.zombieX, zombieX0,
      afterPause.zombieX === zombieX0);

    // ========== 4. 模拟"从暂停菜单选关卡"：设置 _pickerFromPause 并打开选植物面板 ==========
    const pickerOpen = await page.evaluate(() => {
      const g = window.__game;
      const ui = window.__ui;
      ui._pickerFromPause = true;
      ui.isPaused = true;
      g.isPaused = true;
      ui.openPlantPicker({ endless: false, sandbox: false, levelId: 2 });
      const z = g.zombies[g.zombies.length - 1];
      return {
        pickerHidden: ui.plantPickOverlay.classList.contains('hidden'),
        pendingLevel: ui._pendingStart ? ui._pendingStart.levelId : null,
        zombieX: z ? z.x : null,
      };
    });
    assert('选植物面板已打开 (plantPickOverlay 未隐藏)', pickerOpen.pickerHidden, false);
    assert('pendingStart 指向第 2 关', pickerOpen.pendingLevel, 2);
    assert('打开面板瞬间僵尸 x 不变（面板逻辑不触发模拟）', pickerOpen.zombieX, zombieX0,
      pickerOpen.zombieX === zombieX0);

    // ========== 5. 面板打开时再前进若干帧，旧关卡僵尸仍冻结（核心断言） ==========
    const frozenBehindPicker = await page.evaluate(() => {
      const g = window.__game;
      for (let i = 0; i < 5; i++) g.update(1000);
      const z = g.zombies[g.zombies.length - 1];
      return {
        zombieX: z ? z.x : null,
        isPaused: g.isPaused,
        pickerHidden: window.__ui.plantPickOverlay.classList.contains('hidden'),
      };
    });
    assert('【核心】面板打开时旧关卡保持暂停，僵尸 x 不变',
      frozenBehindPicker.zombieX, zombieX0,
      frozenBehindPicker.isPaused === true && frozenBehindPicker.zombieX === zombieX0);
    assert('面板打开期间 game.isPaused 仍为 true', frozenBehindPicker.isPaused, true);
    assert('面板仍然显示', frozenBehindPicker.pickerHidden, false);

    // ========== 6. 点"返回"：应恢复暂停菜单，暂停保持 ==========
    await page.click('#plant-pick-back');
    const afterBack = await page.evaluate(() => {
      const g = window.__game;
      const ui = window.__ui;
      const z = g.zombies[g.zombies.length - 1];
      return {
        gamePaused: g.isPaused,
        uiPaused: ui.isPaused,
        pauseOverlayHidden: ui.pauseOverlay.classList.contains('hidden'),
        levelSelectHidden: document.getElementById('level-select').classList.contains('hidden'),
        pickerFromPause: ui._pickerFromPause,
        pickerHidden: ui.plantPickOverlay.classList.contains('hidden'),
        zombieX: z ? z.x : null,
      };
    });
    assert('返回后 game.isPaused === true', afterBack.gamePaused, true);
    assert('返回后 ui.isPaused === true', afterBack.uiPaused, true);
    assert('返回后暂停菜单可见 (pauseOverlay 未隐藏)', afterBack.pauseOverlayHidden, false);
    assert('返回后关卡选择网格可见 (level-select 未隐藏)', afterBack.levelSelectHidden, false);
    assert('返回后 _pickerFromPause 已重置为 false', afterBack.pickerFromPause, false);
    assert('返回后选植物面板已隐藏', afterBack.pickerHidden, true);
    assert('返回后僵尸 x 仍不变', afterBack.zombieX, zombieX0,
      afterBack.zombieX === zombieX0);

    // ========== 7. 点关卡按钮重新打开面板，再"开始战斗"：确认开局并解除暂停 ==========
    const commitPre = await page.evaluate(() => {
      const ui = window.__ui;
      const g = window.__game;
      if (ui.chosenPlantIds.length === 0) {
        ui.chosenPlantIds.push('sunflower', 'peashooter');
      }
      // 走真实的"暂停菜单→选关卡"路径：点关卡网格里的"第 2 关"按钮
      const btn = Array.from(document.querySelectorAll('#level-grid .level-btn'))
        .find(b => b.querySelector('span') && b.querySelector('span').textContent === '第 2 关');
      if (!btn) throw new Error('找不到"第 2 关"按钮');
      btn.click();
      const z = g.zombies[g.zombies.length - 1];
      return {
        pickerFromPause: ui._pickerFromPause,
        pendingLevel: ui._pendingStart ? ui._pendingStart.levelId : null,
        pickerHidden: ui.plantPickOverlay.classList.contains('hidden'),
        gamePaused: g.isPaused,
        levelSelectHidden: document.getElementById('level-select').classList.contains('hidden'),
        zombieX: z ? z.x : null,
      };
    });
    assert('点关卡按钮后 _pickerFromPause === true（走真实选关卡路径）', commitPre.pickerFromPause, true);
    assert('点关卡按钮后面板已打开且 pendingLevel === 2', commitPre.pendingLevel, 2,
      commitPre.pendingLevel === 2 && !commitPre.pickerHidden);
    assert('点关卡按钮后旧关卡保持暂停（game.isPaused === true）', commitPre.gamePaused, true);
    assert('点关卡按钮后关卡网格已收起（level-select 隐藏）', commitPre.levelSelectHidden, true);
    assert('点关卡按钮后僵尸 x 不变', commitPre.zombieX, zombieX0,
      commitPre.zombieX === zombieX0);
    await page.click('#plant-pick-start');
    const afterCommit = await page.evaluate(() => {
      const g = window.__game;
      const ui = window.__ui;
      return {
        gamePaused: g.isPaused,
        uiPaused: ui.isPaused,
        state: g.state,
        currentLevel: ui.currentLevel,
        pickerFromPause: ui._pickerFromPause,
        pickerHidden: ui.plantPickOverlay.classList.contains('hidden'),
        zombieCount: g.zombies.length,
      };
    });
    assert('开战后 game.isPaused === false', afterCommit.gamePaused, false);
    assert('开战后 ui.isPaused === false', afterCommit.uiPaused, false);
    assert('开战后 game.state === "countdown"（新关卡开始倒数）', afterCommit.state, 'countdown');
    assert('开战后 currentLevel === 2', afterCommit.currentLevel, 2);
    assert('开战后 _pickerFromPause === false', afterCommit.pickerFromPause, false);
    assert('开战后选植物面板已隐藏', afterCommit.pickerHidden, true);
    assert('开新关卡后旧僵尸已清场（zombies.length === 0）', afterCommit.zombieCount, 0);

    // ========== 8. 控制台错误检查 ==========
    assert('页面无未捕获的 console error / pageerror', consoleErrors.length, 0,
      consoleErrors.length === 0);
    if (consoleErrors.length > 0) {
      console.log('  控制台错误列表:');
      consoleErrors.forEach(e => console.log(`    - ${e}`));
    }

    // ========== 汇总 ==========
    const passed = results.filter(r => r.ok).length;
    const failed = results.length - passed;
    console.log('\n==================== 结果汇总 ====================');
    results.forEach(r => {
      console.log(`${r.ok ? '✅' : '❌'} ${r.name}`);
    });
    console.log(`\n共 ${results.length} 项断言: ${passed} 通过, ${failed} 失败`);
    console.log('---------------------------------------------------');
    if (failed > 0) process.exitCode = 1;
  } finally {
    await browser.close();
    server.close();
  }
}

run().catch((err) => {
  console.error('❌ 测试脚本异常:', err);
  process.exit(1);
});
