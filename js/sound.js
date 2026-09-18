// ============================================================
// 音效模块 - 使用 Web Audio API 生成简单音效
// ============================================================
const Sound = (() => {
  let ctx = null;
  let enabled = true;

  function init() {
    if (!ctx) {
      try {
        ctx = new (window.AudioContext || window.webkitAudioContext)();
      } catch (e) {
        ctx = null;
      }
    }
    if (ctx && ctx.state === 'suspended') {
      ctx.resume();
    }
  }

  function playTone(freq, duration, type = 'sine', volume = 0.15, delay = 0) {
    if (!enabled || !ctx) return;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const t = ctx.currentTime + delay;
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    gain.gain.setValueAtTime(volume, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + duration);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(t);
    osc.stop(t + duration + 0.05);
  }

  return {
    init,
    setEnabled(v) { enabled = v; },
    isEnabled() { return enabled; },

    click() {
      playTone(600, 0.08, 'square', 0.08);
    },

    placePlant() {
      playTone(400, 0.15, 'triangle', 0.15);
      playTone(600, 0.1, 'triangle', 0.1, 0.08);
    },

    collectSun() {
      playTone(880, 0.12, 'sine', 0.12);
      playTone(1320, 0.15, 'sine', 0.1, 0.06);
    },

    shoot() {
      playTone(200, 0.06, 'square', 0.05);
    },

    zombieHit() {
      playTone(150, 0.08, 'sawtooth', 0.06);
    },

    zombieEat() {
      playTone(90, 0.12, 'sawtooth', 0.1);
    },

    explosion() {
      playTone(80, 0.4, 'sawtooth', 0.2);
      playTone(50, 0.5, 'square', 0.15, 0.05);
    },

    zombieDie() {
      playTone(300, 0.2, 'sawtooth', 0.08);
      playTone(150, 0.3, 'sawtooth', 0.08, 0.1);
    },

    waveStart() {
      playTone(440, 0.2, 'triangle', 0.12);
      playTone(660, 0.25, 'triangle', 0.12, 0.15);
    },

    win() {
      [523, 659, 784, 1047].forEach((f, i) => {
        playTone(f, 0.3, 'triangle', 0.15, i * 0.15);
      });
    },

    lose() {
      [400, 350, 300, 200].forEach((f, i) => {
        playTone(f, 0.35, 'sawtooth', 0.12, i * 0.2);
      });
    },
  };
})();