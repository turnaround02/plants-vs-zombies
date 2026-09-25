// ============================================================
// UI 管理模块 - HUD、植物卡片、覆盖层
// ============================================================

class UI {
  constructor(game) {
    this.game = game;
    this.currentLevel = 1;
    this.totalLevels = Object.keys(LEVELS).length;
    this.isPaused = false;

    // DOM 元素
    this.sunAmountEl = document.getElementById('sun-amount');
    this.plantCardsEl = document.getElementById('plant-cards');
    this.waveTextEl = document.getElementById('wave-text');
    this.progressFillEl = document.getElementById('progress-fill');
    this.menuOverlay = document.getElementById('menu-overlay');
    this.resultOverlay = document.getElementById('result-overlay');
    this.pauseOverlay = document.getElementById('pause-overlay');
    this.resultTitle = document.getElementById('result-title');
    this.resultText = document.getElementById('result-text');
    this.startBtn = document.getElementById('start-btn');
    this.restartBtn = document.getElementById('restart-btn');
    this.checkpointBtn = document.getElementById('checkpoint-btn');
    this.pauseBtn = document.getElementById('pause-btn');
    this.levelInfoEl = document.getElementById('level-info');
    this.resumeBtn = document.getElementById('resume-btn');
    this.restartPauseBtn = document.getElementById('restart-pause-btn');
    this.levelSelectBtn = document.getElementById('level-select-btn');
    this.mainMenuBtn = document.getElementById('main-menu-btn');
    this.levelGrid = document.getElementById('level-grid');
    this.backBtn = document.getElementById('back-btn');
    this.shovelBtn = document.getElementById('shovel-btn');

    // 卡片冷却状态
    this.cardCooldowns = {};
    this.lastFrameTime = performance.now();

    // 绑定游戏回调
    game.onStateChange = (data) => this.handleStateChange(data);
    game.onSunChange = (sun) => this.updateSun(sun);
    game.onWaveChange = (info) => this.updateWave(info);
    game.onPlantPlaced = (typeId) => this.startCooldown(typeId);
    game.onScoreChange = (score, kills) => this.updateScore(score, kills);

    // 绑定 UI 事件
    this.bindEvents();
    this.bindShovel();

    // 初始化卡片
    this.buildPlantCards();

    // 初始化关卡选择
    this.buildLevelGrid();

    // 初始渲染
    this.updateSun(game.sun);
    this.updateWave({ current: 1, total: LEVELS[1].waves.length, state: 'idle' });
    this.updateScore(game.score, game.kills);
    this.updateLevelInfo();
    this.updateMenuStats();
  }

  bindEvents() {
    this.startBtn.addEventListener('click', () => {
      Sound.init();
      Sound.click();
      this.currentLevel = 1;
      this.updateLevelInfo();
      this.game.startLevel(this.currentLevel);
    });

    this.restartBtn.addEventListener('click', () => {
      Sound.click();
      this.updateLevelInfo();
      this.game.startLevel(this.currentLevel);
    });

    this.checkpointBtn.addEventListener('click', () => {
      Sound.click();
      if (this.game.restoreCheckpoint(this.currentLevel)) {
        // 恢复成功：隐藏结果覆盖层与检查点按钮，让玩家继续游玩
        this.resultOverlay.classList.add('hidden');
        this.checkpointBtn.classList.add('hidden');
      }
    });

    this.pauseBtn.addEventListener('click', () => {
      Sound.click();
      this.togglePause();
    });

    this.resumeBtn.addEventListener('click', () => {
      Sound.click();
      this.togglePause();
    });

    this.restartPauseBtn.addEventListener('click', () => {
      Sound.click();
      this.closeLevelSelect();
      this.togglePause();
      this.game.startLevel(this.currentLevel);
    });

    this.levelSelectBtn.addEventListener('click', () => {
      Sound.click();
      this.openLevelSelect();
    });

    this.mainMenuBtn.addEventListener('click', () => {
      Sound.click();
      this.closeLevelSelect();
      this.togglePause();
      this.currentLevel = 1;
      this.game.state = 'menu';
      this.game.emitStateChange();
      this.updateLevelInfo();
      this.updateMenuStats();
    });

    this.backBtn.addEventListener('click', () => {
      Sound.click();
      this.closeLevelSelect();
    });
  }

  togglePause() {
    if (this.game.state !== 'playing') return;
    this.isPaused = !this.isPaused;
    this.game.isPaused = this.isPaused;
    if (this.isPaused) {
      this.pauseOverlay.classList.remove('hidden');
    } else {
      this.pauseOverlay.classList.add('hidden');
      this.closeLevelSelect();
    }
  }

  bindShovel() {
    this.shovelBtn.addEventListener('click', () => {
      Sound.click();
      if (this.game.state !== 'playing') return;
      // 与植物选择互斥
      this.game.shovelMode = !this.game.shovelMode;
      if (this.game.shovelMode) this.game.selectedPlant = null;
      this.game.emitStateChange();
    });
  }

  openLevelSelect() {
    this.pauseOverlay.classList.remove('hidden');
    document.getElementById('pause-menu').classList.add('hidden');
    document.getElementById('level-select').classList.remove('hidden');
    this.buildLevelGrid(); // 每次打开时读取最新存档，刷新解锁状态
  }

  closeLevelSelect() {
    document.getElementById('pause-menu').classList.remove('hidden');
    document.getElementById('level-select').classList.add('hidden');
  }

  buildLevelGrid() {
    this.levelGrid.innerHTML = '';
    for (let id in LEVELS) {
      const level = LEVELS[id];
      const btn = document.createElement('button');
      btn.className = 'level-btn';
      const unlocked = SaveStore.isLevelUnlocked(id);
      const best = SaveStore.bestScore(id);
      // 已通关 ✅ + 星级 + 最佳分（数据存于存档 bestScores，此处为读取展示）
      const starText = best ? '★'.repeat(best.stars || 0) + '☆'.repeat(3 - (best.stars || 0)) : '';
      const clearedBadge = best
        ? `<span class="level-best">${starText ? starText + ' ' : ''}✅ 最佳 ${best.score}</span>`
        : '';
      btn.innerHTML = unlocked
        ? `<span>第 ${id} 关</span><span class="level-name">${level.name}</span>${clearedBadge}`
        : `<span>🔒 第 ${id} 关</span><span class="level-name">${level.name}</span>`;
      if (!unlocked) {
        btn.disabled = true;
        btn.classList.add('locked');
      }
      btn.addEventListener('click', () => {
        Sound.click();
        this.currentLevel = parseInt(id);
        this.updateLevelInfo();
        this.closeLevelSelect();
        this.game.startLevel(this.currentLevel);
      });
      this.levelGrid.appendChild(btn);
    }
  }

  buildPlantCards() {
    this.plantCardsEl.innerHTML = '';
    for (const typeId in PLANT_TYPES) {
      const type = PLANT_TYPES[typeId];
      const card = document.createElement('div');
      card.className = 'plant-card';
      card.dataset.plantId = typeId;
      card.innerHTML = `
        <span class="card-icon">${type.icon}</span>
        <span class="card-cost">${type.cost}</span>
      `;
      card.title = `${type.name} - ${type.description} (${type.cost}阳光)`;
      card.addEventListener('click', () => this.selectPlant(typeId));
      this.plantCardsEl.appendChild(card);
    }
  }

  selectPlant(typeId) {
    const type = PLANT_TYPES[typeId];
    if (this.game.state !== 'playing') return;
    if (this.game.sun < type.cost) return;
    if (this.isOnCooldown(typeId)) return;

    Sound.click();
    if (this.game.selectedPlant && this.game.selectedPlant.id === typeId) {
      this.game.selectedPlant = null;
    } else {
      this.game.selectedPlant = type;
      this.game.shovelMode = false; // 选植物时退出铲子模式
    }
    this.game.emitStateChange();
  }

  isOnCooldown(typeId) {
    const cd = this.cardCooldowns[typeId];
    if (!cd) return false;
    return cd.remaining > 0;
  }

  handleStateChange(data) {
    // 更新卡片选中状态
    const cards = this.plantCardsEl.querySelectorAll('.plant-card');
    cards.forEach(card => {
      const typeId = card.dataset.plantId;
      const type = PLANT_TYPES[typeId];
      card.classList.toggle('selected', this.game.selectedPlant && this.game.selectedPlant.id === typeId);
      card.classList.toggle('disabled', this.game.sun < type.cost || this.isOnCooldown(typeId));
    });

    // 更新铲子按钮状态
    this.shovelBtn.classList.toggle('active', this.game.shovelMode);

    // 更新覆盖层
    this.menuOverlay.classList.toggle('hidden', data.state !== 'menu');
    this.resultOverlay.classList.toggle('hidden', data.state !== 'win' && data.state !== 'lose');
    this.pauseOverlay.classList.toggle('hidden', !this.isPaused);
    this.pauseBtn.style.display = data.state === 'playing' ? '' : 'none';

    if (data.state === 'win') {
      this.pauseBtn.style.display = 'none';
      const levelName = LEVELS[this.currentLevel] ? LEVELS[this.currentLevel].name : '关卡';
      this.resultTitle.textContent = '🎉 胜利！';
      this.resultTitle.className = 'win';
      this.checkpointBtn.classList.add('hidden');
      const progress = SaveStore.getProgress();
      const best = SaveStore.bestScore(this.currentLevel);
      const runStars = this.game.lastStars || 0;
      const runMowers = this.game.lastMowersUsed || 0;
      const stats = `得分 ${this.game.score} · 击杀 ${this.game.kills} · 过关奖励 +${this.game.lastBonus || 0}`;
      // 本局星级（按割草机使用量）+ 累计统计 + 历史最佳
      const starBlock = runStars > 0
        ? `${'★'.repeat(runStars)}${'☆'.repeat(3 - runStars)}（用割草机 ${runMowers} 台）`
        : '';
      const cumulative = `总胜场 ${progress.wins} · 总击杀 ${progress.totalKills} · 累计得分 ${progress.totalScore}` +
        (best ? `\n历史最佳 ${best.score} 分${best.stars ? ' · ' + '★'.repeat(best.stars) : ''}` : '');
      const starsPrefix = starBlock ? starBlock + '\n' : '';
      const nextLevel = this.currentLevel + 1;
      const hasMore = nextLevel <= this.totalLevels;
      if (hasMore) {
        this.resultText.textContent = `成功完成「${levelName}」！\n${stats}\n${starsPrefix}${cumulative}\n点击下方按钮挑战下一关，或重玩本关。`;
        this.restartBtn.textContent = '下一关 ▶';
        this.restartBtn.style.background = 'linear-gradient(to bottom, #ff9800, #f57c00)';
        this.restartBtn.title = `挑战第 ${nextLevel} 关`;
        this.currentLevel = nextLevel;
      } else {
        this.resultText.textContent = `恭喜！你已完成所有「${levelName}」！\n${stats}\n${starsPrefix}${cumulative}\n你是植物大师！🌟`;
        this.restartBtn.textContent = '再来一局';
        this.restartBtn.style.background = 'linear-gradient(to bottom, #4caf50, #2e7d32)';
        this.restartBtn.title = '从头开始';
        this.currentLevel = 1;
      }
    } else if (data.state === 'lose') {
      this.pauseBtn.style.display = 'none';
      this.resultTitle.textContent = '💀 失败！';
      this.resultTitle.className = 'lose';
      const loseBest = SaveStore.bestScore(this.currentLevel);
      this.resultText.textContent = '僵尸攻破了防线，再试一次吧！' +
        (loseBest ? `\n历史最佳 ${loseBest.score} 分` : '');
      this.restartBtn.textContent = '再来一局';
      this.restartBtn.style.background = 'linear-gradient(to bottom, #4caf50, #2e7d32)';
      this.restartBtn.title = '';
      // 若当前关卡存在检查点则显示"从检查点继续"按钮（检查点随关卡中段自动保存）
      if (SaveStore.loadCheckpoint(this.currentLevel)) {
        this.checkpointBtn.classList.remove('hidden');
      } else {
        this.checkpointBtn.classList.add('hidden');
      }
    } else if (data.state === 'playing') {
      // 进入/恢复 playing 时隐藏结果覆盖层与检查点按钮
      this.resultOverlay.classList.add('hidden');
      this.checkpointBtn.classList.add('hidden');
    }

    // 放置植物后开始冷却
    if (data.state === 'playing' && data.selectedPlant === null) {
      // 检查是否有刚放置的植物(通过 sun 变化检测)
    }
  }

  updateSun(sun) {
    this.sunAmountEl.textContent = sun;

    // 更新卡片可用状态
    const cards = this.plantCardsEl.querySelectorAll('.plant-card');
    cards.forEach(card => {
      const typeId = card.dataset.plantId;
      const type = PLANT_TYPES[typeId];
      card.classList.toggle('disabled', sun < type.cost || this.isOnCooldown(typeId));
    });
  }

  updateScore(score, kills) {
    const el = document.getElementById('score-text');
    if (el) el.textContent = `得分 ${score}`;
  }

  updateWave(info) {
    this.waveTextEl.textContent = `第 ${info.current}/${info.total} 波`;
    this.progressFillEl.style.width = `${(info.current / info.total) * 100}%`;
  }

  updateLevelInfo() {
    if (this.levelInfoEl) {
      const level = LEVELS[this.currentLevel];
      if (level) {
        this.levelInfoEl.textContent = `当前关卡：${level.name}`;
      } else {
        this.levelInfoEl.textContent = '';
      }
    }
  }

  // 主页累计统计（总胜场 / 总击杀 / 累计得分 / 已解锁进度）
  updateMenuStats() {
    const el = document.getElementById('menu-stats');
    if (!el) return;
    const p = SaveStore.getProgress();
    if (p.wins === 0 && p.totalKills === 0 && p.totalScore === 0) {
      el.textContent = '';
      return;
    }
    el.textContent = `🏆 总胜场 ${p.wins} · 总击杀 ${p.totalKills} · 累计得分 ${p.totalScore} · 已解锁 ${p.unlockedLevel}/${this.totalLevels} 关`;
  }

  startCooldown(typeId) {
    const type = PLANT_TYPES[typeId];
    this.cardCooldowns[typeId] = {
      total: type.cooldown,
      remaining: type.cooldown,
    };
  }

  update(dt) {
    // 更新卡片冷却
    let changed = false;
    for (const typeId in this.cardCooldowns) {
      const cd = this.cardCooldowns[typeId];
      if (cd.remaining > 0) {
        if (!this.game.isPaused) {
          cd.remaining -= dt;
        }
        if (cd.remaining <= 0) {
          cd.remaining = 0;
          changed = true;
        }
      }
    }

    // 渲染冷却覆盖层
    const cards = this.plantCardsEl.querySelectorAll('.plant-card');
    cards.forEach(card => {
      const typeId = card.dataset.plantId;
      const cd = this.cardCooldowns[typeId];
      let cdEl = card.querySelector('.card-cooldown');
      if (cd && cd.remaining > 0) {
        if (!cdEl) {
          cdEl = document.createElement('div');
          cdEl.className = 'card-cooldown';
          card.appendChild(cdEl);
        }
        cdEl.textContent = Math.ceil(cd.remaining / 1000);
      } else if (cdEl) {
        cdEl.remove();
      }
    });

    if (changed) {
      this.updateSun(this.game.sun);
    }
  }
}