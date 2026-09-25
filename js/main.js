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

    // 响应式缩放：将 960×660 的 #game-container 等比缩放到适配视口
    // （桌面端不超过 1.0，窄屏/手机按比例缩小）；canvas 内坐标换算在
    // game.bindEvents 的 toCanvasPoint 里用 getBoundingClientRect 动态感知。
    // 关键：绝对定位 + transform 缩放不会改变布局，不影响坐标换算；
    // 桌面端 scale=1 时行为与原先的 flex 居中一致。
    function fitContainer() {
      const container = document.getElementById('game-container');
      if (!container) return;
      const W = 960, H = 660; // 与 CSS 中 #game-container 固定尺寸一致
      const margin = 8;
      const scale = Math.min(
        (window.innerWidth - margin * 2) / W,
        (window.innerHeight - margin * 2) / H,
        1,
      );
      const s = Math.max(scale, 0.25);
      container.style.position = 'absolute';
      container.style.left = '50%';
      container.style.top = '50%';
      container.style.transform = `translate(-50%, -50%) scale(${s})`;
      container.style.transformOrigin = 'center center';
    }
    window.addEventListener('resize', fitContainer);
    window.addEventListener('orientationchange', fitContainer);
    fitContainer();

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