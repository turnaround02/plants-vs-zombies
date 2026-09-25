// ============================================================
// 关卡与波次管理模块
// ============================================================

class LevelManager {
  constructor(levelId, endless = false) {
    this.endless = !!endless;
    this.level = LEVELS[levelId];
    this.waveIndex = 0;
    this.waveState = 'idle'; // idle | spawning | active | complete
    this.spawnQueue = [];
    this.spawnTimer = 0;
    this.waveBreakTimer = 0;
    this.allWavesComplete = false;
    // 无尽模式：总波次无限，随波次递增难度
    this.totalWaves = this.endless ? Infinity : this.level.waves.length;
    // 无尽模式下每波基于的僵尸类型池（取关卡波次中出现的种类循环复用）
    this.endlessTypes = this.endless
      ? Array.from(new Set(this.level.waves.flatMap(w => w.zombies.map(z => z.type))))
      : [];
  }

  start(game) {
    this.waveIndex = 0;
    this.waveState = 'idle';
    this.spawnQueue = [];
    this.spawnTimer = 0;
    this.waveBreakTimer = 0;
    this.allWavesComplete = false;
    this.startNextWave(game);
  }

  // 生成无尽模式第 n 波的僵尸队列：数量与 HP 随波次严格递增
  _generateEndlessWave(n) {
    // 数量：第 1 波 4 只，之后每波 +1（封顶 24 只），难度持续上升
    const count = Math.min(4 + (n - 1), 24);
    const hpGrowth = Math.pow(1.08, n - 1); // HP 每波 ×1.08
    const queue = [];
    for (let i = 0; i < count; i++) {
      let type;
      if (this.endlessTypes.length > 0) {
        // 按波数 + 序号轮转僵尸池，越往后循环到越靠后的（更强）种类
        const pool = this.endlessTypes;
        const idx = Math.min(Math.floor((n + i) % pool.length), pool.length - 1);
        type = pool[idx];
      } else {
        type = 'normal';
      }
      queue.push({
        type,
        delay: i * CONFIG.ZOMBIE_SPAWN_INTERVAL / 1000,
        hpMul: hpGrowth,
      });
    }
    return queue;
  }

  startNextWave(game) {
    if (this.endless) {
      const waveNum = this.waveIndex + 1;
      this.spawnQueue = this._generateEndlessWave(waveNum);
      this.spawnTimer = 0;
      this.waveState = 'spawning';
      Sound.waveStart();
      return;
    }

    if (this.waveIndex >= this.totalWaves) {
      this.allWavesComplete = true;
      this.waveState = 'complete';
      return;
    }

    const wave = this.level.waves[this.waveIndex];
    // 关卡中段保存检查点（玩家失败后可从该点继续；无尽不存检查点）
    if (!this.endless && game && this.waveIndex === Math.floor(this.totalWaves / 2)) {
      SaveStore.saveCheckpoint(
        this.level.id,
        this.waveIndex,
        game.sun,
        game.plants.map(p => ({ typeId: p.typeId, row: p.row, col: p.col, hp: p.hp, maxHp: p.maxHp })),
        game.zombies.map(z => ({ typeId: z.typeId, row: z.row, x: z.x, hp: z.hp, maxHp: z.maxHp }))
      );
    }
    this.spawnQueue = wave.zombies.map(z => ({ ...z }));
    this.spawnQueue.sort((a, b) => a.delay - b.delay);
    this.spawnTimer = 0;
    this.waveState = 'spawning';
    Sound.waveStart();
  }

  update(dt, game) {
    if (this.allWavesComplete) return;

    switch (this.waveState) {
      case 'idle':
        this.waveBreakTimer += dt;
        if (this.waveBreakTimer >= CONFIG.WAVE_BREAK_INTERVAL) {
          this.waveBreakTimer = 0;
          this.startNextWave(game);
        }
        break;

      case 'spawning':
        this.spawnTimer += dt;
        // 生成到期的僵尸（无尽模式带 hpMul）
        while (this.spawnQueue.length > 0 && this.spawnQueue[0].delay <= this.spawnTimer) {
          const spawn = this.spawnQueue.shift();
          const row = Math.floor(Math.random() * CONFIG.ROWS);
          game.spawnZombie(spawn.type, row, spawn.hpMul || 1);
        }
        // 队列清空后进入 active 状态等待僵尸被消灭
        if (this.spawnQueue.length === 0) {
          this.waveState = 'active';
        }
        break;

      case 'active':
        // 等待所有僵尸死亡或到达房屋
        if (game.getAliveZombieCount() === 0) {
          this.waveIndex++;
          if (this.endless) {
            // 无尽模式：永不结束，直接进入下一波
            this.waveState = 'idle';
            this.waveBreakTimer = 0;
          } else if (this.waveIndex >= this.totalWaves) {
            this.allWavesComplete = true;
            this.waveState = 'complete';
            game.onAllWavesComplete();
          } else {
            this.waveState = 'idle';
            this.waveBreakTimer = 0;
          }
        }
        break;
    }
  }

  getWaveInfo() {
    if (this.endless) {
      // 无尽模式：current 为已完成的波次数，total 为 Infinity（UI 端做特殊处理）
      return {
        current: this.waveIndex + 1,
        total: Infinity,
        state: this.waveState,
        endless: true,
      };
    }
    return {
      current: Math.min(this.waveIndex + 1, this.totalWaves),
      total: this.totalWaves,
      state: this.waveState,
    };
  }

  getProgress() {
    if (this.totalWaves === 0) return 0;
    return Math.min(this.waveIndex / this.totalWaves, 1);
  }
}