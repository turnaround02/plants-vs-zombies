// ============================================================
// 入口点与游戏主循环
// ============================================================

(function () {
  'use strict';

  // 等待 DOM 加载完成
  function init() {
    const canvas = document.getElementById('game-canvas');
    if (!canvas) {
      console.error('Canvas not found!');
      return;
    }

    // 创建游戏实例
    const game = new Game(canvas);
    const ui = new UI(game);

    // 游戏主循环
    let lastTime = performance.now();

    function gameLoop(now) {
      const dt = Math.min(now - lastTime, 50); // 限制最大帧间隔 50ms
      lastTime = now;

      // 更新游戏
      game.update(dt);

      // 更新 UI(冷却等)
      ui.update(dt);

      // 渲染
      game.render();

      // 更新波次信息
      if (game.levelManager) {
        const info = game.levelManager.getWaveInfo();
        ui.updateWave(info);
      }

      requestAnimationFrame(gameLoop);
    }

    // 启动主循环
    requestAnimationFrame(gameLoop);

    // 暴露调试接口(供自动化测试使用)
    window.__game = game;
    window.__ui = ui;
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();