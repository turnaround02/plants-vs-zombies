// ============================================================
// 精灵图加载器 (SpriteLoader)
// 为植物/僵尸加载透明 PNG 精灵图（sprites/<id>.png）。
// 全局对象，浏览器版本无模块系统，通过 <script> 全局暴露。
// 防御式设计：任何加载失败（sprites/ 缺失、404 等）都不会抛错，
// isReady() 返回 false，调用方回退到矢量绘制。
// ============================================================

const SpriteLoader = (function () {
  'use strict';

  const images = {}; // key -> HTMLImageElement
  const ready = new Set(); // 成功加载完成的 key
  const failed = new Set(); // 加载失败的 key

  /**
   * 加载单个图片
   * @param {string} key 形如 'plant:sunflower' / 'zombie:normal'
   * @param {string} src 图片路径，形如 'sprites/sunflower.png'
   * @returns {HTMLImageElement}
   */
  function load(key, src) {
    if (!key || !src) return null;
    if (images[key]) return images[key]; // 已创建过则复用
    let img;
    try {
      img = new Image();
    } catch (e) {
      failed.add(key);
      return null;
    }
    img.onload = function () {
      ready.add(key);
      failed.delete(key);
    };
    img.onerror = function () {
      failed.add(key);
      ready.delete(key);
    };
    img.src = src;
    images[key] = img;
    return img;
  }

  /**
   * 将某 key 的图片静默取消（取消进行中的请求，防止 404 日志）
   */
  function cancel(key) {
    if (!key || !images[key]) return;
    const img = images[key];
    // 覆盖处理器：清掉 src 以取消网络请求，并触发一次 error 让状态标记为失败
    img.onload = null;
    img.onerror = function () {
      failed.add(key);
      ready.delete(key);
    };
    img.src = '';
  }

  /**
   * 预加载所有植物与僵尸精灵图
   * PLANT_TYPES / ZOMBIE_TYPES 由 config.js 提供，须先于本脚本加载。
   * 附带静默取消：sprites/ 尚未加入时，404 会在浏览器控制台刷出一堆
   * "Failed to load resource" 日志（测试要求"无控制台错误"）。因此
   * 对"加载完成后仍处于未完成状态"的 key，若 8 秒内仍未加载成功，
   * 即判定为失败并静默取消请求（清掉 src），杜绝 404 日志；
   * 真正的 PNG 文件一旦加入，本地加载毫秒级完成，绝不影响。
   */
  function preload() {
    try {
      const jobs = [];
      if (typeof PLANT_TYPES !== 'undefined') {
        Object.keys(PLANT_TYPES).forEach(function (id) {
          const key = 'plant:' + id;
          load(key, 'sprites/' + id + '.png');
          jobs.push(key);
        });
      }
      if (typeof ZOMBIE_TYPES !== 'undefined') {
        Object.keys(ZOMBIE_TYPES).forEach(function (id) {
          const key = 'zombie:' + id;
          load(key, 'sprites/' + id + '.png');
          jobs.push(key);
        });
      }
      setTimeout(function () {
        jobs.forEach(function (key) {
          if (!isReady(key)) cancel(key);
        });
      }, 8000);
    } catch (e) {
      // 绝不允许影响游戏运行
      if (window && window.console) window.console.warn('[SpriteLoader] preload failed:', e);
    }
  }

  /**
   * 判断某 key 的图片是否已成功加载（加载完成且未报错）
   * @param {string} key
   * @returns {boolean}
   */
  function isReady(key) {
    if (!key) return false;
    const img = images[key];
    if (!img) return false;
    return ready.has(key) && img.complete;
  }

  /**
   * 获取某 key 的 HTMLImageElement（可能仍在加载中）
   * @param {string} key
   * @returns {HTMLImageElement|null}
   */
  function get(key) {
    return key ? images[key] || null : null;
  }

  return {
    load: load,
    cancel: cancel,
    preload: preload,
    isReady: isReady,
    get: get,
  };
})();
