// ============================================================
// 开局选植物面板 (plant picker) 专项验证脚本
// 用真实浏览器验证"最多 8 种"选取面板的行为
// 运行: node test/verify-picker.js
// ============================================================

const puppeteer = require('puppeteer');
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const PORT = 8899;

// 简单静态文件服务器（复用 headless-test.js 的模式）
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
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const results = [];

function check(name, ok, detail) {
  const status = ok ? 'PASS' : 'FAIL';
  results.push({ name, ok, detail });
  console.log(`  ${ok ? '✅' : '❌'} [${status}] ${name}`);
  if (!ok && detail) {
    console.log(`     ↳ ${detail}`);
  }
}

async function run() {
  console.log('🧪 启动选植物面板验证...\n');
  const server = await startServer();
  console.log(`✅ 本地服务器已启动: http://localhost:${PORT}\n`);

  const browser = await puppeteer.launch({
    headless: 'new',
    executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--window-size=1000,800'],
    defaultViewport: { width: 1000, height: 800 },
  });

  const page = await browser.newPage();

  // 收集控制台错误
  const consoleErrors = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      consoleErrors.push(msg.text());
    }
  });

  await page.goto(`http://127.0.0.1:${PORT}/index.html`, {
    waitUntil: 'networkidle0',
  });
  await sleep(500);

  // ---------------------------------------------------------
  // 3. 先清空 localStorage，让默认 8 种植物预设生效
  // ---------------------------------------------------------
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: 'networkidle0' });
  await sleep(500);

  // ---------------------------------------------------------
  // (a) 首页 menu 态：HUD 应全部隐藏
  // ---------------------------------------------------------
  console.log('(a) 首页 menu 态 HUD 隐藏检查:');
  const menuVisibility = await page.evaluate(() => {
    const game = window.__game;
    const cs = document.defaultView.getComputedStyle;
    return {
      state: game.state,
      menuVisible: !document.getElementById('menu-overlay').classList.contains('hidden'),
      plantCardsDisplay: cs(document.getElementById('plant-cards')).display,
      pauseBtnDisplay: cs(document.getElementById('pause-btn')).display,
      shovelBtnDisplay: cs(document.getElementById('shovel-btn')).display,
      waveInfoDisplay: cs(document.getElementById('wave-info')).display,
    };
  });

  check(
    'menu 态: #plant-cards display === none',
    menuVisibility.plantCardsDisplay === 'none',
    `实际: display=${menuVisibility.plantCardsDisplay}, state=${menuVisibility.state}`
  );
  check(
    'menu 态: #pause-btn display === none',
    menuVisibility.pauseBtnDisplay === 'none',
    `实际: display=${menuVisibility.pauseBtnDisplay}`
  );
  check(
    'menu 态: #shovel-btn display === none',
    menuVisibility.shovelBtnDisplay === 'none',
    `实际: display=${menuVisibility.shovelBtnDisplay}`
  );
  check(
    'menu 态: #wave-info display === none',
    menuVisibility.waveInfoDisplay === 'none',
    `实际: display=${menuVisibility.waveInfoDisplay}`
  );

  // ---------------------------------------------------------
  // (b) 点开始按钮，应弹出植物选取面板
  // ---------------------------------------------------------
  console.log('\n(b) 开始按钮 → 打开选取面板:');
  await page.click('#start-btn');
  await sleep(300);

  const pickerState = await page.evaluate(() => {
    const overlay = document.getElementById('plant-pick-overlay');
    const grid = document.getElementById('plant-pick-grid');
    const count = document.getElementById('plant-pick-count');
    return {
      pickerVisible: !overlay.classList.contains('hidden'),
      cardCount: grid.querySelectorAll('.plant-pick-card').length,
      countText: count.textContent,
    };
  });

  check(
    '选取面板已显示（无 hidden class）',
    pickerState.pickerVisible === true,
    `实际: pickerVisible=${pickerState.pickerVisible}`
  );
  check(
    '选取面板包含 11 张植物卡',
    pickerState.cardCount === 11,
    `实际: cardCount=${pickerState.cardCount}`
  );
  check(
    '计数文本显示"已选 8 / 8"（默认预设 8 种）',
    pickerState.countText.includes('已选 8 / 8'),
    `实际: "${pickerState.countText}"`
  );

  // ---------------------------------------------------------
  // (c) 选取上限检查：点第 9 张卡应被拒绝
  // ---------------------------------------------------------
  console.log('\n(c) 选取上限检查:');

  // 先找出一张未选中的植物卡（第 9 张）
  const unselectedCard = await page.evaluate(() => {
    const cards = document.querySelectorAll('.plant-pick-card');
    for (const card of cards) {
      if (!card.classList.contains('selected')) {
        return card.dataset.plantId;
      }
    }
    return null;
  });

  check(
    '找到一张未选中的植物卡',
    unselectedCard !== null,
    '未找到任何未选中的卡'
  );

  // 点击该卡，模拟第 9 次选择
  if (unselectedCard) {
    await page.evaluate((plantId) => {
      const card = document.querySelector(`.plant-pick-card[data-plant-id="${plantId}"]`);
      card.click();
    }, unselectedCard);
    await sleep(200);

    const capState = await page.evaluate(() => {
      const count = document.getElementById('plant-pick-count');
      return {
        countText: count.textContent,
        isRed: count.style.color === 'rgb(244, 67, 54)' || count.style.color.includes('244, 67, 54'),
        hasCapMsg: count.textContent.includes('已达上限'),
      };
    });

    check(
      '点第 9 张卡后"已达上限"提示出现',
      capState.hasCapMsg === true,
      `实际 countText="${capState.countText}"`
    );
    check(
      '所选植物数量仍为 8（未被添加）',
      await page.evaluate(() => window.__ui.chosenPlantIds.length) === 8,
      `实际: chosenPlantIds.length=${await page.evaluate(() => window.__ui.chosenPlantIds.length)}`
    );

    // 取消一张已选中的卡，再点另一张未选中的，应成功
    const selectedCard = await page.evaluate(() => {
      const cards = document.querySelectorAll('.plant-pick-card');
      for (const card of cards) {
        if (card.classList.contains('selected')) {
          return card.dataset.plantId;
        }
      }
      return null;
    });

    if (selectedCard) {
      // 取消该卡
      await page.evaluate((plantId) => {
        const card = document.querySelector(`.plant-pick-card[data-plant-id="${plantId}"]`);
        card.click();
      }, selectedCard);
      await sleep(200);

      // 现在只有 7 种，可以加回
      const addBack = await page.evaluate(() => {
        const cards = document.querySelectorAll('.plant-pick-card');
        for (const card of cards) {
          if (!card.classList.contains('selected')) {
            const id = card.dataset.plantId;
            card.click();
            return id;
          }
        }
        return null;
      });
      await sleep(200);

      const addBackState = await page.evaluate(() => {
        const count = document.getElementById('plant-pick-count');
        return {
          countText: count.textContent,
          hasCapMsg: count.textContent.includes('已达上限'),
          selectedCount: document.querySelectorAll('.plant-pick-card.selected').length,
        };
      });

      check(
        '取消一张后可成功添加另一张（回到 8 种）',
        addBackState.selectedCount === 8,
        `实际 selectedCount=${addBackState.selectedCount}, countText="${addBackState.countText}"`
      );
      check(
        '添加后"已达上限"提示消失',
        addBackState.hasCapMsg === false,
        `实际 countText="${addBackState.countText}"`
      );
    }
  }

  // ---------------------------------------------------------
  // (d) 确认选择 → 卡片条仅显示所选 8 种
  // ---------------------------------------------------------
  console.log('\n(d) 确认选择 → 卡片条限 8 种:');
  await page.click('#plant-pick-start');
  await sleep(300);

  // 跳过倒数，进入 playing 态
  await page.evaluate(() => {
    window.__game.skipCountdown();
  });
  await sleep(200);

  const commitState = await page.evaluate(() => {
    const cs = document.defaultView.getComputedStyle;
    return {
      pickerHidden: document.getElementById('plant-pick-overlay').classList.contains('hidden'),
      plantCardsDisplay: cs(document.getElementById('plant-cards')).display,
      plantCardCount: document.querySelectorAll('.plant-card').length,
      gameState: window.__game.state,
    };
  });

  check(
    '选取面板已隐藏',
    commitState.pickerHidden === true,
    `实际: pickerHidden=${commitState.pickerHidden}`
  );
  check(
    'playing 态: #plant-cards display !== none（HUD 恢复）',
    commitState.plantCardsDisplay !== 'none',
    `实际: display=${commitState.plantCardsDisplay}`
  );
  check(
    '卡片条仅显示 8 张卡（非 11 张）',
    commitState.plantCardCount === 8,
    `实际: plantCardCount=${commitState.plantCardCount}`
  );

  // ---------------------------------------------------------
  // (e) 沙盒模式：跳过选取面板，显示全部 11 种植物
  // ---------------------------------------------------------
  console.log('\n(e) 沙盒模式检查:');

  // 返回主页并清空 localStorage
  await page.evaluate(() => {
    window.__game.startLevel(1); // 回到 menu 态
  });
  await sleep(200);
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: 'networkidle0' });
  await sleep(500);

  // 点沙盒按钮
  await page.click('#sandbox-btn');
  await sleep(300);

  const sandboxState = await page.evaluate(() => {
    return {
      pickerHidden: document.getElementById('plant-pick-overlay').classList.contains('hidden'),
      gameState: window.__game.state,
      sandboxMode: window.__game.sandboxMode,
    };
  });

  check(
    '沙盒模式跳过选取面板（面板保持隐藏）',
    sandboxState.pickerHidden === true,
    `实际: pickerHidden=${sandboxState.pickerHidden}`
  );
  check(
    '沙盒模式已激活',
    sandboxState.sandboxMode === true,
    `实际: sandboxMode=${sandboxState.sandboxMode}`
  );

  // 跳过倒数，进入 playing 态
  await page.evaluate(() => {
    window.__game.skipCountdown();
  });
  await sleep(200);

  const sandboxCards = await page.evaluate(() => {
    return {
      plantCardCount: document.querySelectorAll('.plant-card').length,
      plantCardsDisplay: document.defaultView.getComputedStyle(document.getElementById('plant-cards')).display,
    };
  });

  check(
    '沙盒模式卡片条显示 11 张卡（全部植物）',
    sandboxCards.plantCardCount === 11,
    `实际: plantCardCount=${sandboxCards.plantCardCount}`
  );

  // ---------------------------------------------------------
  // 收集控制台错误检查
  // ---------------------------------------------------------
  const hasUncaughtErrors = consoleErrors.some((err) => !err.startsWith('Warning:'));
  check(
    '无未捕获的控制台错误',
    !hasUncaughtErrors,
    consoleErrors.length > 0 ? `控制台错误: ${consoleErrors.join('; ')}` : ''
  );

  // ---------------------------------------------------------
  // 汇总
  // ---------------------------------------------------------
  const failed = results.filter((r) => !r.ok);
  console.log('\n==========================================');
  if (failed.length === 0) {
    console.log('ALL PICKER CHECKS PASSED');
  } else {
    console.log(`${failed.length} CHECK(S) FAILED:  `);
    failed.forEach((f) => {
      console.log(`  ❌ ${f.name}${f.detail ? ` — ${f.detail}` : ''}`);
    });
  }
  console.log('==========================================');

  await browser.close();
  server.close();

  process.exit(failed.length > 0 ? 1 : 0);
}

run().catch((err) => {
  console.error('脚本执行失败:', err);
  process.exit(1);
});
