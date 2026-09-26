// ============================================================
// UI 管理模块 - HUD、植物卡片、覆盖层
// ============================================================

class UI {
  constructor(game) {
    this.game = game;
    this.currentLevel = 1;
    this.endlessMode = false; // 无尽模式标志
    this.sandboxMode = false; // 沙盒模式标志（无限阳光、全植物、不失败）
    this.totalLevels = Object.keys(LEVELS).length;
    this.isPaused = false;
    this._pickerFromPause = false; // 选植物面板是否从"暂停菜单→选关卡"进入（返回时恢复暂停）

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
    this.endlessBtn = document.getElementById('endless-btn');
    this.sandboxBtn = document.getElementById('sandbox-btn');
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
    this.muteBtn = document.getElementById('mute-btn');
    this.copySaveBtn = document.getElementById('copy-save-btn');
    this.importSaveBtn = document.getElementById('import-save-btn');
    this.shareHintEl = document.getElementById('share-hint');
    this.countdownOverlay = document.getElementById('countdown-overlay');
    this.countdownNumberEl = document.getElementById('countdown-number');
    this.waveInfoEl = document.getElementById('wave-info');
    this.scoreInfoEl = document.getElementById('score-info');
    // 开局选植物面板
    this.plantPickOverlay = document.getElementById('plant-pick-overlay');
    this.plantPickGrid = document.getElementById('plant-pick-grid');
    this.plantPickCount = document.getElementById('plant-pick-count');
    this.plantPickStartBtn = document.getElementById('plant-pick-start');
    this.plantPickBackBtn = document.getElementById('plant-pick-back');

    // 开局携带植物（普通/无尽模式上限 MAX_PLANT_CHOICES；沙盒用全部）
    // 默认预设一套合理搭配，玩家可在选植物面板里改
    this.chosenPlantIds = this._loadChosenPlants();
    // 选植物面板打开时记录的是哪个入口（开始/无尽/选关卡），确认后据此 startLevel
    this._pendingStart = null; // { endless, sandbox, levelId }

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
    this.bindMute();
    this.bindShare();
    this.bindPlantPicker();

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

    // 初始可见性同步（顶栏玩法控件只在非暂停游玩态可见；menu 态 showPlay=false → 隐藏）
    this.syncTopBarVisibility();
  }

  bindEvents() {
    this.startBtn.addEventListener('click', () => {
      Sound.init();
      Sound.click();
      this.currentLevel = 1;
      this.endlessMode = false;
      this.sandboxMode = false;
      this.updateLevelInfo();
      // 开局先选植物（最多 8 种）→ 确认后进 3-2-1 倒数
      this.openPlantPicker({ endless: false, sandbox: false, levelId: 1 });
    });

    this.endlessBtn.addEventListener('click', () => {
      Sound.init();
      Sound.click();
      this.currentLevel = 1;
      this.endlessMode = true;
      this.sandboxMode = false;
      this.updateLevelInfo();
      this.openPlantPicker({ endless: true, sandbox: false, levelId: 1 });
    });

    this.sandboxBtn.addEventListener('click', () => {
      Sound.init();
      Sound.click();
      this.currentLevel = 1;
      this.endlessMode = false;
      this.sandboxMode = true;
      this.updateLevelInfo();
      // 沙盒模式豁免选植物（全植物自由），直接进倒数；重建卡片条显示全部 11 种
      this.game.startLevel(this.currentLevel, false, true);
      this.buildPlantCards();
    });

    this.restartBtn.addEventListener('click', () => {
      Sound.click();
      // 防御：确保不残留暂停态（避免 handleStateChange 重新顶出暂停菜单）
      this.isPaused = false;
      this.game.isPaused = false;
      this.pauseOverlay.classList.add('hidden');
      this.updateLevelInfo();
      // 保留当前模式（无尽/沙盒），切换则回到普通；重开同模式需重建卡片条
      this.game.startLevel(this.currentLevel, this.endlessMode, this.sandboxMode);
      this.buildPlantCards();
    });

    this.checkpointBtn.addEventListener('click', () => {
      Sound.click();
      if (this.game.restoreCheckpoint(this.currentLevel)) {
        // 恢复成功：隐藏结果覆盖层与检查点按钮，让玩家继续游玩
        this.resultOverlay.classList.add('hidden');
        this.checkpointBtn.classList.add('hidden');
      }
    });

    // 顶栏暂停按钮：单向"仅暂停"（modal 感知，绝不兼做恢复）
    this.pauseBtn.addEventListener('click', () => {
      Sound.click();
      this.pauseGame();
    });

    // 暂停菜单"继续游戏"：单向"仅恢复"
    this.resumeBtn.addEventListener('click', () => {
      Sound.click();
      this.resumeGame();
    });

    this.restartPauseBtn.addEventListener('click', () => {
      Sound.click();
      this.closeLevelSelect();
      // 先解除暂停离开暂停态，再开新局（startLevel 本身也会重置 isPaused）
      this.resumeGame();
      // 暂停菜单"重新开始"：保留当前模式；重开同模式需重建卡片条
      this.game.startLevel(this.currentLevel, this.endlessMode, this.sandboxMode);
      this.buildPlantCards();
    });

    this.levelSelectBtn.addEventListener('click', () => {
      Sound.click();
      this.openLevelSelect();
    });

    this.mainMenuBtn.addEventListener('click', () => {
      Sound.click();
      this.closeLevelSelect();
      // 先解除暂停离开暂停态，再切回主页
      this.resumeGame();
      this.currentLevel = 1;
      this.endlessMode = false;
      this.sandboxMode = false;
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

  // 单向"仅暂停"：顶栏 #pause-btn 调用。只有游玩且未暂停时生效
  pauseGame() {
    if (this.game.state !== 'playing' || this.isPaused) return;
    this.isPaused = true;
    this.game.isPaused = true;
    this.pauseOverlay.classList.remove('hidden');
    document.getElementById('pause-menu').classList.remove('hidden');
    document.getElementById('level-select').classList.add('hidden');
    this.syncTopBarVisibility();
  }

  // 单向"仅恢复"：暂停菜单 #resume-btn / 重新开始 / 返回主页 调用。只有暂停中才生效
  resumeGame() {
    if (!this.isPaused) return;
    this.isPaused = false;
    this.game.isPaused = false;
    this.pauseOverlay.classList.add('hidden');
    this.closeLevelSelect();
    this.syncTopBarVisibility();
  }

  // ============================================================
  // 顶栏玩法控件可见性（单一事实来源）
  // 设计规则：顶栏玩法控件只在 (state==='playing' 且 未暂停 且
  // 未打开暂停/选植物面板) 时可见可用；其它状态一律隐藏，仅保留静音按钮（全局）
  // ============================================================
  syncTopBarVisibility() {
    const pauseOverlayVisible = !this.pauseOverlay.classList.contains('hidden');
    const plantPickOverlayVisible = !this.plantPickOverlay.classList.contains('hidden');
    const showPlay =
      this.game.state === 'playing' &&
      !this.isPaused &&
      !pauseOverlayVisible &&
      !plantPickOverlayVisible;
    const d = showPlay ? '' : 'none';
    this.plantCardsEl.style.display = d;
    this.shovelBtn.style.display = d;
    this.waveInfoEl.style.display = d;
    this.scoreInfoEl.style.display = d;
    this.pauseBtn.style.display = d;
    // #mute-btn 全局常驻，不在此处处理
  }

  bindShovel() {
    this.shovelBtn.addEventListener('click', () => {
      Sound.click();
      if (this.game.state !== 'playing') return;
      if (this.isPaused) return; // 暂停中铲子无意义（防御：面板/暂停菜单下按钮已隐藏，此处双保险）
      // 与植物选择互斥
      this.game.shovelMode = !this.game.shovelMode;
      if (this.game.shovelMode) this.game.selectedPlant = null;
      this.game.emitStateChange();
    });
  }

  bindMute() {
    this.updateMuteBtn();
    this.muteBtn.addEventListener('click', () => {
      // 切换静音（Sound.setEnabled 会持久化到 localStorage）
      Sound.setEnabled(!Sound.isEnabled());
      this.updateMuteBtn();
      Sound.click();
    });
  }

  bindShare() {
    if (!this.copySaveBtn || !this.importSaveBtn) return;
    this.copySaveBtn.addEventListener('click', () => this.copySave());
    this.importSaveBtn.addEventListener('click', () => this.importSave());
  }

  // 复制存档串：优先 navigator.clipboard，失败则回退到 textarea + execCommand
  async copySave() {
    Sound.click();
    const str = SaveStore.exportSave();
    const hint = (msg, isError) => {
      if (this.shareHintEl) {
        this.shareHintEl.textContent = msg;
        this.shareHintEl.className = isError ? 'error' : '';
        this.shareHintEl.classList.remove('hidden');
      }
    };
    let copied = false;
    try {
      await navigator.clipboard.writeText(str);
      copied = true;
    } catch (e) {
      // 回退方案：http/iframe 下 clipboard API 可能受限
      try {
        const ta = document.createElement('textarea');
        ta.value = str;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        copied = document.execCommand('copy');
        document.body.removeChild(ta);
      } catch (e2) {
        copied = false;
      }
    }
    if (copied) {
      hint('✅ 存档已复制到剪贴板（粘贴分享给朋友）');
    } else {
      hint('📋 复制失败，请手动复制下方存档串：\n' + str, true);
    }
  }

  importSave() {
    Sound.click();
    const str = window.prompt('粘贴存档串：', '');
    if (str === null) return; // 用户取消
    const res = SaveStore.importSave(str);
    const hint = (msg, isError) => {
      if (this.shareHintEl) {
        this.shareHintEl.textContent = msg;
        this.shareHintEl.className = isError ? 'error' : '';
        this.shareHintEl.classList.remove('hidden');
      }
    };
    if (res.ok) {
      hint('✅ 存档导入成功');
      this.updateMenuStats(); // 刷新主页统计（若可见）
    } else {
      hint('❌ 导入失败：存档串格式无效（' + res.error + '）', true);
    }
  }

  updateMuteBtn() {
    if (!this.muteBtn) return;
    const muted = !Sound.isEnabled();
    this.muteBtn.textContent = muted ? '🔇' : '🔊';
    this.muteBtn.classList.toggle('muted', muted);
    this.muteBtn.title = muted ? '音效已关（点击开启）' : '音效开启（点击关闭）';
  }

  openLevelSelect() {
    this.pauseOverlay.classList.remove('hidden');
    document.getElementById('pause-menu').classList.add('hidden');
    document.getElementById('level-select').classList.remove('hidden');
    this.buildLevelGrid(); // 每次打开时读取最新存档，刷新解锁状态
    this.syncTopBarVisibility();
  }

  closeLevelSelect() {
    document.getElementById('pause-menu').classList.remove('hidden');
    document.getElementById('level-select').classList.add('hidden');
    this.syncTopBarVisibility();
  }

  // 读档：从 localStorage 读取上次选择的开局植物（无则用默认搭配）
  _loadChosenPlants() {
    const DEFAULTS = ['sunflower', 'peashooter', 'wallnut', 'snowpea', 'cherrybomb', 'dualPea'];
    try {
      const raw = localStorage.getItem('pvz_plant_choices');
      if (!raw) return DEFAULTS;
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return DEFAULTS;
      const valid = parsed.filter((id) => PLANT_TYPES[id] && typeof id === 'string');
      return valid.length ? valid : DEFAULTS;
    } catch (e) {
      return DEFAULTS;
    }
  }

  buildLevelGrid() {
    this.levelGrid.innerHTML = '';
    for (let id in LEVELS) {
      const level = LEVELS[id];
      const btn = document.createElement('button');
      btn.className = 'level-btn';
      // 全关卡默认解锁（不再需要通关解锁）：isLevelUnlocked 恒为 true
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
        this.endlessMode = false; // 选关卡 = 普通模式
        this.sandboxMode = false;
        this.updateLevelInfo();
        // 选关卡进入选植物面板：旧关卡保持暂停（冻结僵尸），隐藏暂停菜单、显示面板。
        // 只在 _commitStart（点"开始战斗"）时才解除暂停开新局；"返回"则恢复暂停菜单。
        this._pickerFromPause = true;
        this.isPaused = true;
        this.game.isPaused = true;
        this.closeLevelSelect();
        this.pauseOverlay.classList.add('hidden');
        this.openPlantPicker({ endless: false, sandbox: false, levelId: this.currentLevel });
        this.syncTopBarVisibility(); // 面板顶栏同步（防御：emitStateChange 路径也覆盖）
      });
      this.levelGrid.appendChild(btn);
    }
  }

  // 开局携带植物持久化：读 localStorage，缺失/损坏则回落默认预设 8 种
  _loadChosenPlants() {
    const DEFAULT = ['sunflower', 'peashooter', 'snowpea', 'wallnut', 'cherrybomb', 'repeater', 'dualPea', 'catTail'];
    let ids = null;
    try {
      const raw = localStorage.getItem('pvz_chosen_plants_v1');
      if (raw) ids = JSON.parse(raw);
    } catch (e) {
      ids = null;
    }
    if (!Array.isArray(ids)) return DEFAULT.slice();
    // 校验：只保留 PLANT_TYPES 中存在的 id，并去重；普通/无尽模式上限 MAX_PLANT_CHOICES
    const out = [];
    for (const id of ids) {
      if (PLANT_TYPES[id] && !out.includes(id)) out.push(id);
    }
    return out.slice(0, CONFIG.MAX_PLANT_CHOICES);
  }

  // 把当前所选植物写回 localStorage
  _saveChosenPlants() {
    try {
      localStorage.setItem('pvz_chosen_plants_v1', JSON.stringify(this.chosenPlantIds));
    } catch (e) {
      // localStorage 不可用（隐私模式等）时静默忽略
    }
  }

  // 打开开局选植物面板；沙盒模式豁免（全植物），直接确认开打
  openPlantPicker(pending) {
    this._pendingStart = pending; // { endless, sandbox, levelId }
    if (pending && pending.sandbox) {
      // 沙盒本不会走到这里（sandbox-btn 直接 startLevel），防御性兜底
      this._commitStart(pending);
      return;
    }
    // 面板打开期间隐藏主菜单，避免叠层
    this.menuOverlay.classList.add('hidden');
    this.plantPickOverlay.classList.remove('hidden');
    this.buildPlantPickGrid();
    this._refreshPlantPickUi();
    this.syncTopBarVisibility(); // 面板下顶栏玩法控件全部隐藏
  }

  // 渲染 11 张可勾选植物卡
  buildPlantPickGrid() {
    this.plantPickGrid.innerHTML = '';
    for (const key in PLANT_TYPES) {
      const type = PLANT_TYPES[key];
      const card = document.createElement('div');
      card.className = 'plant-pick-card' + (this.chosenPlantIds.includes(key) ? ' selected' : '');
      card.dataset.plantId = key;
      card.innerHTML = `<span class="pp-icon">${type.icon}</span><span class="pp-name">${type.name}</span><span class="pp-cost">${type.cost}</span>`;
      card.addEventListener('click', () => {
        Sound.click();
        const idx = this.chosenPlantIds.indexOf(key);
        if (idx === -1) {
          // 未选中：满 8 种时拒绝并短暂提示
          if (this.chosenPlantIds.length >= CONFIG.MAX_PLANT_CHOICES) {
            this.plantPickCount.textContent = '已达上限 8 种，先取消一个';
            this.plantPickCount.style.color = '#f44336';
            setTimeout(() => { this._refreshPlantPickUi(); }, 1500);
            return;
          }
          this.chosenPlantIds.push(key);
        } else {
          this.chosenPlantIds.splice(idx, 1);
        }
        card.classList.toggle('selected', this.chosenPlantIds.includes(key));
        this._refreshPlantPickUi();
        this._saveChosenPlants();
      });
      this.plantPickGrid.appendChild(card);
    }
  }

  // 刷新已选计数与开始按钮可用态
  _refreshPlantPickUi() {
    this.plantPickCount.textContent = '已选 ' + this.chosenPlantIds.length + ' / ' + CONFIG.MAX_PLANT_CHOICES;
    // 恢复默认绿色（除非正处于"已达上限"红色提示期间，由 setTimeout 回调再覆盖）
    this.plantPickCount.style.color = '#8bc34a';
    this.plantPickStartBtn.disabled = (this.chosenPlantIds.length === 0 || this.chosenPlantIds.length > CONFIG.MAX_PLANT_CHOICES);
  }

  // 确认所选植物并按 pending 入口开打
  _commitStart(pending) {
    this._saveChosenPlants();
    this.plantPickOverlay.classList.add('hidden');
    // 若仍停在菜单（如点过"返回"后重开），恢复主菜单可见性
    if (this.game.state === 'menu') this.menuOverlay.classList.remove('hidden');

    this.currentLevel = pending.levelId;
    this.endlessMode = !!pending.endless;
    this.sandboxMode = !!pending.sandbox;
    this.updateLevelInfo();
    this.game.startLevel(pending.levelId, !!pending.endless, !!pending.sandbox);
    // 确认开新局：解除"选关卡时保留的暂停"，避免 handleStateChange 把暂停菜单顶回来（原"问题5"）
    this.isPaused = false;
    this.game.isPaused = false;
    this._pickerFromPause = false;
    // 游戏内卡片条只渲染所选植物（沙盒显示全部）
    this.buildPlantCards();
    this.syncTopBarVisibility();
  }

  // 绑定开局选植物面板事件
  bindPlantPicker() {
    this.plantPickStartBtn.addEventListener('click', () => {
      Sound.click();
      this._commitStart(this._pendingStart);
    });
    this.plantPickBackBtn.addEventListener('click', () => {
      Sound.click();
      this.plantPickOverlay.classList.add('hidden');
      if (this._pickerFromPause) {
        // 从暂停菜单"选关卡"进入：返回应回到暂停菜单，旧关卡保持暂停
        this.isPaused = true;
        this.game.isPaused = true;
        this.pauseOverlay.classList.remove('hidden');
        this.openLevelSelect(); // 回到关卡选择网格（仍在暂停菜单下）
        this._pickerFromPause = false;
      } else if (this.game.state === 'menu') {
        // 从首页进入：返回回首页菜单
        this.menuOverlay.classList.remove('hidden');
      }
      this._pendingStart = null;
      this.syncTopBarVisibility();
    });
  }

  buildPlantCards() {
    this.plantCardsEl.innerHTML = '';
    // 沙盒模式全植物；普通/无尽模式只渲染所选植物
    const ids = (this.game && this.game.sandboxMode)
      ? Object.keys(PLANT_TYPES)
      : this.chosenPlantIds;
    for (const typeId of ids) {
      const type = PLANT_TYPES[typeId];
      if (!type) continue; // 防御：id 已被移除时跳过
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
    if (this.isPaused) return; // 暂停中卡片条已隐藏（防御双保险）
    if (!this.plantPickOverlay.classList.contains('hidden')) return; // 选植物面板打开时卡片条已隐藏（防御双保险）
    // 沙盒模式：植物免费且无冷却（sun 为 MAX_SAFE_INTEGER，cost 检查恒通过；跳过冷却）
    if (this.game.sun < type.cost) return;
    if (!this.game.sandboxMode && this.isOnCooldown(typeId)) return;

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
    if (this.game.sandboxMode) return false; // 沙盒模式无冷却
    const cd = this.cardCooldowns[typeId];
    if (!cd) return false;
    return cd.remaining > 0;
  }

  handleStateChange(data) {
    // 沙盒模式：body 加/去 sandbox-mode 类（CSS 据此允许卡片条横向滚动）
    document.body.classList.toggle('sandbox-mode', this.game.sandboxMode);

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
    // 开局倒数：显示大号 3-2-1 数字（数字本身在 ui.update 中逐帧刷新）
    this.countdownOverlay.classList.toggle('hidden', data.state !== 'countdown');
    if (data.state === 'countdown') {
      this.countdownNumberEl.textContent = Math.ceil(this.game.countdown) || 'GO';
    }

    // 顶栏玩法控件可见性由 syncTopBarVisibility 统一管理（menu/win/lose/countdown/暂停/面板下隐藏）

    // 暂停菜单仅在"暂停中且游玩"时显示；结算/首页/倒数时隐藏
    const pauseHidden = data.state !== 'playing' || !this.isPaused;
    this.pauseOverlay.classList.toggle('hidden', pauseHidden);
    // 选植物面板优先：面板可见时强制隐藏暂停菜单（防止铲子等 emitStateChange 把暂停菜单重新顶到面板上）
    if (!this.plantPickOverlay.classList.contains('hidden')) {
      this.pauseOverlay.classList.add('hidden');
    }
    // 结算/结束态：两个模态面板都应收起
    if (data.state === 'win' || data.state === 'lose') {
      this.plantPickOverlay.classList.add('hidden');
      this.pauseOverlay.classList.add('hidden');
    }

    if (data.state === 'win') {
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

    // 顶栏玩法控件可见性同步（单一事实来源，须在所有覆盖层/标志更新后调用）
    this.syncTopBarVisibility();
  }

  updateSun(sun) {
    // 沙盒模式：阳光为 MAX_SAFE_INTEGER，显示 ∞
    this.sunAmountEl.textContent = this.game.sandboxMode ? '∞' : sun;

    // 更新卡片可用状态
    const cards = this.plantCardsEl.querySelectorAll('.plant-card');
    cards.forEach(card => {
      const typeId = card.dataset.plantId;
      const type = PLANT_TYPES[typeId];
      // 沙盒模式卡片恒可点（免费无冷却）
      const disabled = this.game.sandboxMode
        ? false
        : (sun < type.cost || this.isOnCooldown(typeId));
      card.classList.toggle('disabled', disabled);
    });
  }

  updateScore(score, kills) {
    const el = document.getElementById('score-text');
    if (el) el.textContent = `得分 ${score}`;
  }

  updateWave(info) {
    if (info.endless || info.total === Infinity) {
      // 沙盒模式同样用无尽波次，标签区分显示
      const label = this.sandboxMode ? '沙盒' : '无尽';
      this.waveTextEl.textContent = `第 ${info.current} 波 · ${label}`;
      // 进度条不显示"总波数"，恒满
      this.progressFillEl.style.width = '100%';
      return;
    }
    this.waveTextEl.textContent = `第 ${info.current}/${info.total} 波`;
    this.progressFillEl.style.width = `${(info.current / info.total) * 100}%`;
  }

  updateLevelInfo() {
    if (this.levelInfoEl) {
      if (this.sandboxMode) {
        this.levelInfoEl.textContent = '模式：🧪 沙盒（无限阳光·全植物·不失败）';
      } else if (this.endlessMode) {
        this.levelInfoEl.textContent = '模式：♾️ 无尽（无限波次，越打越强）';
      } else {
        const level = LEVELS[this.currentLevel];
        if (level) {
          this.levelInfoEl.textContent = `当前关卡：${level.name}`;
        } else {
          this.levelInfoEl.textContent = '';
        }
      }
    }
  }

  // 主页累计统计（总胜场 / 总击杀 / 累计得分）
  updateMenuStats() {
    const el = document.getElementById('menu-stats');
    if (!el) return;
    const p = SaveStore.getProgress();
    if (p.wins === 0 && p.totalKills === 0 && p.totalScore === 0) {
      el.textContent = '🌻 全部关卡已解锁，随时挑战！';
      return;
    }
    el.textContent = `🏆 总胜场 ${p.wins} · 总击杀 ${p.totalKills} · 累计得分 ${p.totalScore}`;
  }

  startCooldown(typeId) {
    const type = PLANT_TYPES[typeId];
    this.cardCooldowns[typeId] = {
      total: type.cooldown,
      remaining: type.cooldown,
    };
  }

  update(dt) {
    // 开局倒数数字逐帧刷新（3 → 2 → 1；game.update 在 countdown 态负责递减 game.countdown）
    if (this.game.state === 'countdown' && this.countdownNumberEl) {
      const n = Math.ceil(this.game.countdown);
      this.countdownNumberEl.textContent = n > 0 ? String(n) : 'GO!';
    }

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