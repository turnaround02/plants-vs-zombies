// ============================================================
// 关卡与波次管理模块
// ============================================================

class LevelManager {
  constructor(levelId) {
    this.level = LEVELS[levelId];
    this.waveIndex = 0;
    this.waveState = 'idle'; // idle | spawning | active | complete
    this.spawnQueue = [];
    this.spawnTimer = 0;
    this.waveBreakTimer = 0;
    this.totalWaves = this.level.waves.length;
    this.allWavesComplete = false;
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

  startNextWave(game) {
    if (this.waveIndex >= this.totalWaves) {
      this.allWavesComplete = true;
      this.waveState = 'complete';
      return;
    }

    const wave = this.level.waves[this.waveIndex];
    // 关卡中段保存检查点（玩家失败后可从该点继续）
    if (game && this.waveIndex === Math.floor(this.totalWaves / 2)) {
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
        // 生成到期的僵尸
        while (this.spawnQueue.length > 0 && this.spawnQueue[0].delay <= this.spawnTimer) {
          const spawn = this.spawnQueue.shift();
          const row = Math.floor(Math.random() * CONFIG.ROWS);
          game.spawnZombie(spawn.type, row);
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
          if (this.waveIndex >= this.totalWaves) {
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