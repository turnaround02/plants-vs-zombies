// ============================================================
// 核心游戏引擎
// ============================================================

class Game {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.state = 'menu'; // menu | countdown | playing | win | lose
    this.countdown = 0;  // 开局倒数剩余秒数（state==='countdown' 时递减）
    this.isPaused = false; // 暂停标志（由UI管理，与state独立）

    // 资源
    this.sun = 0;
    this.plants = [];
    this.zombies = [];
    this.projectiles = [];
    this.suns = [];
    this.explosions = [];
    this.mowers = [];

    // 网格占用
    this.grid = [];
    for (let r = 0; r < CONFIG.ROWS; r++) {
      this.grid.push(new Array(CONFIG.COLS).fill(null));
    }

    // 输入状态
    this.selectedPlant = null;
    this.shovelMode = false; // 铲子模式（与植物选择互斥）
    this.hoverCell = null;
    this.mouseX = 0;
    this.mouseY = 0;

    // 计时器
    this.sunFallTimer = 0;
    this.gameTime = 0;

    // 关卡
    this.levelManager = null;

    // 得分统计
    this.score = 0;
    this.kills = 0;

    // 回调
    this.onStateChange = null;
    this.onSunChange = null;
    this.onWaveChange = null;
    this.onPlantPlaced = null;
    this.onScoreChange = null;

    // 绑定事件
    this.bindEvents();
  }

  // ==========================================================
  // 生命周期
  // ==========================================================

  startLevel(levelId, endless = false, sandbox = false) {
    const level = LEVELS[levelId];
    // 沙盒模式：无限阳光（用一个很大的数近似，避免 Infinity 在 UI 显示为 Inf）
    this.sun = sandbox ? Number.MAX_SAFE_INTEGER : level.startSun;
    this.plants = [];
    this.zombies = [];
    this.projectiles = [];
    this.suns = [];
    this.explosions = [];
    this.mowers = this._initMowers();
    this.grid = [];
    for (let r = 0; r < CONFIG.ROWS; r++) {
      this.grid.push(new Array(CONFIG.COLS).fill(null));
    }
    this.selectedPlant = null;
    this.shovelMode = false;
    this.sunFallTimer = 0;
    this.gameTime = 0;
    this.score = 0;
    this.kills = 0;
    this.endlessMode = !!endless;
    this.sandboxMode = !!sandbox;
    this.lastStars = 0;
    this.lastMowersUsed = 0;
    this.lastBonus = 0;

    // 沙盒模式：用无尽波次（僵尸无限刷）但跳过失败条件与结算
    this.levelManager = new LevelManager(levelId, endless || sandbox);
    this.levelManager.start(this);

    // 开局前 3-2-1 倒数（期间游戏冻结，UI 显示大数字；倒数结束进 playing）
    this.isPaused = false;
    this.state = 'countdown';
    this.countdown = 3;
    this.emitStateChange();
    this.emitSunChange();
    this.emitWaveChange();
  }

  // 跳过开局倒数（自动化测试用：让游戏立即进入 playing 态）
  skipCountdown() {
    if (this.state !== 'countdown') return;
    this.countdown = 0;
    this.state = 'playing';
    this.emitStateChange();
  }

  reset() {
    this.startLevel(1);
  }

  // 从检查点恢复：读取存档并重建关卡/植物/僵尸状态
  restoreCheckpoint(levelId) {
    const cp = SaveStore.loadCheckpoint(levelId);
    if (!cp) return false;
    this.startLevel(levelId);
    this.levelManager.waveIndex = cp.waveIndex;
    this.levelManager.waveState = 'idle';
    this.levelManager.waveBreakTimer = 0;
    this.levelManager.spawnQueue = [];
    this.levelManager.spawnTimer = 0;
    this.levelManager.allWavesComplete = false;
    this.sun = cp.sun;
    this.plants = (cp.plants || []).map(p => {
      const pl = new Plant(p.typeId, p.row, p.col);
      pl.hp = p.hp; pl.maxHp = p.maxHp;
      if (this.grid[p.row]) this.grid[p.row][p.col] = pl;
      return pl;
    });
    this.zombies = (cp.zombies || []).map(z => {
      const zombie = new Zombie(z.typeId, z.row);
      zombie.x = z.x; zombie.hp = z.hp; zombie.maxHp = z.maxHp;
      return zombie;
    });
    this.state = 'playing';
    this.emitStateChange();
    this.emitSunChange();
    this.emitWaveChange();
    return true;
  }

  // ==========================================================
  // 更新
  // ==========================================================

  update(dt) {
    // 开局倒数：3-2-1 递减，期间游戏冻结（不计时、不刷僵尸、不掉阳光），
    // 倒数归零后进入 playing 并发出状态变化（UI 据此显示"开始"并放行）
    if (this.state === 'countdown') {
      this.countdown -= dt / 1000;
      if (this.countdown <= 0) {
        this.countdown = 0;
        this.state = 'playing';
        this.emitStateChange();
      }
      return;
    }
    if (this.state !== 'playing') return;
    if (this.isPaused) return;

    this.gameTime += dt;

    // 天空掉阳光；夜间关卡掉月亮（🌙，同样 +25 阳光）
    const isNight = this.isNightLevel();
    this.sunFallTimer += dt;
    if (this.sunFallTimer >= CONFIG.SUN_FALL_INTERVAL) {
      this.sunFallTimer = 0;
      const x = CONFIG.GRID_OFFSET_X + 50 + Math.random() * (CONFIG.CANVAS_WIDTH - CONFIG.GRID_OFFSET_X - 100);
      const y = -20;
      // 夜间掉月亮而非太阳：收集效果相同（+SUN_FALL_AMOUNT），视觉不同
      this.spawnSun(x, y, CONFIG.SUN_FALL_AMOUNT, isNight ? 'moon' : 'sky');
    }

    // 更新植物
    for (const plant of this.plants) {
      plant.update(dt, this);
    }
    this.plants = this.plants.filter(p => p.alive);

    // 更新僵尸
    for (const zombie of this.zombies) {
      zombie.update(dt, this);
    }
    this.zombies = this.zombies.filter(z => z.alive);

    // 更新割草机
    this.updateMowers(dt);

    // 更新子弹
    for (const proj of this.projectiles) {
      proj.x += proj.speed * (dt / 1000);
      // 检测命中
      const target = this.getFirstZombieInRow(proj.row, proj.x - 10, proj.x + 10);
      if (target) {
        if (proj.charm) {
          // 魅惑弹：将僵尸变为友军，不造成伤害，直接消除弹
          target.isAlly = true;
          Sound.zombieDie();
          proj.hit = true;
        } else {
          if (!proj.hitZombies) proj.hitZombies = new Set();
          if (!proj.hitZombies.has(target)) {
            proj.hitZombies.add(target);
            target.takeDamage(proj.damage);
            if (target.dead) {
              this.recordKill(target.typeId);
              SaveStore.recordKill();
            }
            if (proj.slowFactor > 0) {
              target.applySlow(proj.slowFactor, proj.slowDuration);
            }
            Sound.zombieHit();
            if (!proj.penetrate) {
              proj.hit = true;
            }
          }
        }
      }
      // 超出屏幕
      if (proj.x > CONFIG.CANVAS_WIDTH + 50) {
        proj.hit = true;
      }
    }
    this.projectiles = this.projectiles.filter(p => !p.hit);

    // 更新阳光
    for (const sun of this.suns) {
      sun.life += dt;
      // 天空/月亮下落
      if ((sun.source === 'sky' || sun.source === 'moon') && sun.y < sun.targetY) {
        sun.y += 40 * (dt / 1000);
        if (sun.y >= sun.targetY) {
          sun.y = sun.targetY;
        }
      }
    }
    this.suns = this.suns.filter(s => s.life < CONFIG.SUN_LIFETIME);

    // 更新爆炸
    for (const exp of this.explosions) {
      exp.life += dt;
    }
    this.explosions = this.explosions.filter(e => e.life < e.duration);

    // 更新关卡
    this.levelManager.update(dt, this);
  }

  // ==========================================================
  // 渲染
  // ==========================================================

  render() {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, CONFIG.CANVAS_WIDTH, CONFIG.CANVAS_HEIGHT);

    this.renderBackground(ctx);
    this.renderGrid(ctx);

    // 阳光(在植物下方)
    for (const sun of this.suns) {
      this.renderSun(ctx, sun);
    }

    // 植物
    for (const plant of this.plants) {
      plant.render(ctx);
    }

    // 僵尸
    for (const zombie of this.zombies) {
      zombie.render(ctx);
    }

    // 子弹
    for (const proj of this.projectiles) {
      ctx.fillStyle = proj.charm ? '#ce93d8' : proj.color;
      const r = proj.penetrate ? 7 : (proj.charm ? 6 : 6);
      ctx.beginPath();
      ctx.arc(proj.x, proj.y, r, 0, Math.PI * 2);
      ctx.fill();
      // 穿透弹轨迹效果
      if (proj.penetrate) {
        ctx.strokeStyle = 'rgba(156, 39, 176, 0.4)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(proj.x - 12, proj.y);
        ctx.lineTo(proj.x + 12, proj.y);
        ctx.stroke();
      }
      // 魅惑弹光晕
      if (proj.charm) {
        ctx.strokeStyle = 'rgba(206, 147, 216, 0.5)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(proj.x, proj.y, 9, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.fillStyle = 'rgba(255,255,255,0.4)';
      ctx.beginPath();
      ctx.arc(proj.x - 2, proj.y - 2, 2, 0, Math.PI * 2);
      ctx.fill();
    }

    // 割草机
    this.renderMowers(ctx);

    // 爆炸效果
    for (const exp of this.explosions) {
      const progress = exp.life / exp.duration;
      const radius = exp.radius * (0.5 + progress * 0.5);
      const alpha = 1 - progress;
      ctx.fillStyle = `rgba(255, 165, 0, ${alpha * 0.6})`;
      ctx.beginPath();
      ctx.arc(exp.x, exp.y, radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = `rgba(255, 235, 59, ${alpha * 0.8})`;
      ctx.beginPath();
      ctx.arc(exp.x, exp.y, radius * 0.6, 0, Math.PI * 2);
      ctx.fill();
    }

    // 铲子预览
    this.renderShovelPreview(ctx);

    // 放置预览
    this.renderPlacementPreview(ctx);

    // 房屋
    this.renderHouse(ctx);
  }

  renderMowers(ctx) {
    for (const m of this.mowers) {
      if (m.spent && !m.active) continue;
      const y = CONFIG.GRID_OFFSET_Y + m.row * CONFIG.CELL_HEIGHT + CONFIG.CELL_HEIGHT / 2;
      // 未激活的待命割草机显示在房屋右侧
      if (!m.active) {
        ctx.globalAlpha = 0.6;
        this._drawMower(ctx, CONFIG.MOWER_START_X + 10, y);
        ctx.globalAlpha = 1;
      } else {
        this._drawMower(ctx, m.x, y);
      }
    }
  }

  _drawMower(ctx, x, y) {
    // 机身
    ctx.fillStyle = '#b71c1c';
    ctx.fillRect(x - 18, y - 14, 36, 28);
    // 刀片
    ctx.strokeStyle = '#9e9e9e';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(x - 18, y, 10, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(x + 18, y, 10, 0, Math.PI * 2);
    ctx.stroke();
    // 车头标识
    ctx.fillStyle = '#ffd700';
    ctx.fillRect(x - 10, y - 8, 20, 6);
  }

  renderShovelPreview(ctx) {
    if (!this.shovelMode || this.state !== 'playing') return;
    const cell = this.getCellAt(this.mouseX, this.mouseY);
    if (!cell) return;
    const { row, col } = cell;
    const x = CONFIG.GRID_OFFSET_X + col * CONFIG.CELL_WIDTH;
    const y = CONFIG.GRID_OFFSET_Y + row * CONFIG.CELL_HEIGHT;
    const hasPlant = this.grid[row][col] !== null;
    ctx.fillStyle = hasPlant ? 'rgba(255,152,0,0.4)' : 'rgba(158,158,158,0.3)';
    ctx.fillRect(x, y, CONFIG.CELL_WIDTH, CONFIG.CELL_HEIGHT);
    ctx.globalAlpha = 0.8;
    ctx.font = '30px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('🪏', x + CONFIG.CELL_WIDTH / 2, y + CONFIG.CELL_HEIGHT / 2);
    ctx.globalAlpha = 1;
  }

  renderBackground(ctx) {
    const isNight = this.isNightLevel();

    if (isNight) {
      // 夜间草地背景（深色）
      const grad = ctx.createLinearGradient(0, 0, 0, CONFIG.CANVAS_HEIGHT);
      grad.addColorStop(0, '#1a237e');
      grad.addColorStop(1, '#0d1b2a');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, CONFIG.CANVAS_WIDTH, CONFIG.CANVAS_HEIGHT);

      // 夜间天空区域(左侧房屋上方)
      ctx.fillStyle = '#0b1026';
      ctx.fillRect(0, 0, CONFIG.GRID_OFFSET_X, CONFIG.CANVAS_HEIGHT);

      // 星空（随机小点 + 闪烁）
      for (let i = 0; i < 80; i++) {
        const x = (i * 137.5) % CONFIG.CANVAS_WIDTH;
        const y = (i * 89.3) % CONFIG.CANVAS_HEIGHT;
        const twinkle = 0.4 + 0.6 * Math.abs(Math.sin(this.gameTime / 500 + i));
        ctx.fillStyle = `rgba(255,255,255,${twinkle})`;
        ctx.beginPath();
        ctx.arc(x, y, 1.5, 0, Math.PI * 2);
        ctx.fill();
      }
      return;
    }

    // 白天草地背景
    const grad = ctx.createLinearGradient(0, 0, 0, CONFIG.CANVAS_HEIGHT);
    grad.addColorStop(0, '#7cb342');
    grad.addColorStop(1, '#558b2f');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, CONFIG.CANVAS_WIDTH, CONFIG.CANVAS_HEIGHT);

    // 天空区域(左侧房屋上方)
    ctx.fillStyle = '#87ceeb';
    ctx.fillRect(0, 0, CONFIG.GRID_OFFSET_X, CONFIG.CANVAS_HEIGHT);

    // 草地纹理(小点)
    ctx.fillStyle = 'rgba(255,255,255,0.08)';
    for (let i = 0; i < 60; i++) {
      const x = (i * 137.5) % CONFIG.CANVAS_WIDTH;
      const y = (i * 89.3) % CONFIG.CANVAS_HEIGHT;
      ctx.beginPath();
      ctx.arc(x, y, 2, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  renderGrid(ctx) {
    // 棋盘格
    for (let r = 0; r < CONFIG.ROWS; r++) {
      for (let c = 0; c < CONFIG.COLS; c++) {
        const x = CONFIG.GRID_OFFSET_X + c * CONFIG.CELL_WIDTH;
        const y = CONFIG.GRID_OFFSET_Y + r * CONFIG.CELL_HEIGHT;
        ctx.fillStyle = (r + c) % 2 === 0 ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.05)';
        ctx.fillRect(x, y, CONFIG.CELL_WIDTH, CONFIG.CELL_HEIGHT);
      }
    }

    // 网格线
    ctx.strokeStyle = 'rgba(0,0,0,0.1)';
    ctx.lineWidth = 1;
    for (let c = 0; c <= CONFIG.COLS; c++) {
      const x = CONFIG.GRID_OFFSET_X + c * CONFIG.CELL_WIDTH;
      ctx.beginPath();
      ctx.moveTo(x, CONFIG.GRID_OFFSET_Y);
      ctx.lineTo(x, CONFIG.GRID_OFFSET_Y + CONFIG.ROWS * CONFIG.CELL_HEIGHT);
      ctx.stroke();
    }
    for (let r = 0; r <= CONFIG.ROWS; r++) {
      const y = CONFIG.GRID_OFFSET_Y + r * CONFIG.CELL_HEIGHT;
      ctx.beginPath();
      ctx.moveTo(CONFIG.GRID_OFFSET_X, y);
      ctx.lineTo(CONFIG.GRID_OFFSET_X + CONFIG.COLS * CONFIG.CELL_WIDTH, y);
      ctx.stroke();
    }
  }

  renderHouse(ctx) {
    // 房屋
    const hx = 0;
    const hy = 0;
    const hw = 60;
    const hh = CONFIG.CANVAS_HEIGHT;

    // 房屋主体
    ctx.fillStyle = '#8d6e63';
    ctx.fillRect(hx, hy, hw, hh);

    // 屋顶
    ctx.fillStyle = '#6d4c41';
    ctx.beginPath();
    ctx.moveTo(hx, hy);
    ctx.lineTo(hx + hw / 2, hy - 30);
    ctx.lineTo(hx + hw, hy);
    ctx.closePath();
    ctx.fill();

    // 门
    ctx.fillStyle = '#4e342e';
    ctx.fillRect(hx + 15, hy + hh / 2 - 40, 30, 50);
    ctx.fillStyle = '#ffd700';
    ctx.beginPath();
    ctx.arc(hx + 38, hy + hh / 2 - 15, 3, 0, Math.PI * 2);
    ctx.fill();

    // 窗户
    ctx.fillStyle = '#ffecb3';
    ctx.fillRect(hx + 15, hy + 40, 30, 25);
    ctx.strokeStyle = '#4e342e';
    ctx.lineWidth = 2;
    ctx.strokeRect(hx + 15, hy + 40, 30, 25);
    ctx.beginPath();
    ctx.moveTo(hx + 30, hy + 40);
    ctx.lineTo(hx + 30, hy + 65);
    ctx.stroke();
  }

  renderSun(ctx, sun) {
    // 月亮（夜间收集物）：蓝色弯月 + 星光，收集效果与太阳相同
    if (sun.source === 'moon') {
      const pulse = 1 + Math.sin(sun.life / 300) * 0.1;
      const r = 14 * pulse;
      // 光晕
      ctx.fillStyle = 'rgba(120,180,255,0.35)';
      ctx.beginPath();
      ctx.arc(sun.x, sun.y, r + 8, 0, Math.PI * 2);
      ctx.fill();
      // 弯月主体：用一个亮圆 + 一个偏移暗圆裁出月牙
      ctx.save();
      ctx.fillStyle = '#9fc4ff';
      ctx.beginPath();
      ctx.arc(sun.x, sun.y, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#0d1b2a'; // 与夜空背景接近，制造月牙缺口
      ctx.beginPath();
      ctx.arc(sun.x + r * 0.55, sun.y - r * 0.25, r * 0.9, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      // 数字
      ctx.fillStyle = '#dbe9ff';
      ctx.font = 'bold 10px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(sun.amount, sun.x, sun.y + 1);
      return;
    }

    const pulse = 1 + Math.sin(sun.life / 300) * 0.1;
    const r = 16 * pulse;

    // 光晕
    ctx.fillStyle = 'rgba(255,215,0,0.3)';
    ctx.beginPath();
    ctx.arc(sun.x, sun.y, r + 8, 0, Math.PI * 2);
    ctx.fill();

    // 主体
    ctx.fillStyle = '#ffd700';
    ctx.beginPath();
    ctx.arc(sun.x, sun.y, r, 0, Math.PI * 2);
    ctx.fill();

    // 光芒
    ctx.strokeStyle = '#ffd700';
    ctx.lineWidth = 3;
    for (let i = 0; i < 8; i++) {
      const angle = (i / 8) * Math.PI * 2 + sun.life / 500;
      ctx.beginPath();
      ctx.moveTo(sun.x + Math.cos(angle) * (r + 4), sun.y + Math.sin(angle) * (r + 4));
      ctx.lineTo(sun.x + Math.cos(angle) * (r + 12), sun.y + Math.sin(angle) * (r + 12));
      ctx.stroke();
    }

    // 高光
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.beginPath();
    ctx.arc(sun.x - 4, sun.y - 4, 4, 0, Math.PI * 2);
    ctx.fill();

    // 数字
    ctx.fillStyle = '#b8860b';
    ctx.font = 'bold 10px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(sun.amount, sun.x, sun.y + 1);
  }

  renderPlacementPreview(ctx) {
    if (!this.selectedPlant || this.state !== 'playing' || this.shovelMode) return;

    const cell = this.getCellAt(this.mouseX, this.mouseY);
    if (!cell) return;

    const { row, col } = cell;
    const x = CONFIG.GRID_OFFSET_X + col * CONFIG.CELL_WIDTH;
    const y = CONFIG.GRID_OFFSET_Y + row * CONFIG.CELL_HEIGHT;

    const canPlace = this.canPlacePlant(row, col);
    ctx.fillStyle = canPlace ? 'rgba(76,175,80,0.3)' : 'rgba(244,67,54,0.3)';
    ctx.fillRect(x, y, CONFIG.CELL_WIDTH, CONFIG.CELL_HEIGHT);

    // 预览植物图标
    ctx.globalAlpha = 0.6;
    ctx.font = '36px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(this.selectedPlant.icon, x + CONFIG.CELL_WIDTH / 2, y + CONFIG.CELL_HEIGHT / 2);
    ctx.globalAlpha = 1;
  }

  // ==========================================================
  // 割草机（每行一台一次性保险）
  // ==========================================================

  _initMowers() {
    const mowers = [];
    for (let r = 0; r < CONFIG.ROWS; r++) {
      mowers.push({ row: r, active: false, spent: false, x: CONFIG.MOWER_START_X });
    }
    return mowers;
  }

  updateMowers(dt) {
    for (const m of this.mowers) {
      // 未触发的割草机：僵尸越过触发线时一次性清掉整行所有僵尸
      if (!m.spent) {
        const triggered = this.zombies.some(z => z.row === m.row && !z.dead && !z.isAlly && z.x < CONFIG.MOWER_TRIGGER_X);
        if (triggered) {
          m.spent = true;
          m.active = true;
          m.x = CONFIG.MOWER_START_X;
          // 立即清整行保险：所有该行的敌方僵尸被消灭
          for (const z of this.zombies) {
            if (z.row === m.row && !z.dead && !z.isAlly) {
              z.dead = true;
              z.alive = false;
              this.recordKill(z.typeId);
            }
          }
          Sound.zombieDie();
        }
      }
      // 触发的割草机仅做向右驶出的动画（伤害已在触发瞬间结算）
      if (m.active) {
        m.x += CONFIG.MOWER_SPEED * (dt / 1000);
        if (m.x > CONFIG.CANVAS_WIDTH + 50) m.active = false;
      }
    }
  }

  // ==========================================================
  // 铲子（铲除植物回收阳光）
  // ==========================================================

  removePlant(row, col) {
    const plant = this.grid[row] ? this.grid[row][col] : null;
    if (!plant) return 0;
    const refund = Math.floor(plant.type.cost * CONFIG.SHOVEL_REFUND_RATE);
    this.grid[row][col] = null;
    plant.alive = false;
    this.plants = this.plants.filter(p => p !== plant);
    this.sun += refund;
    this.emitSunChange();
    return refund;
  }

  // ==========================================================
  // 输入处理
  // ==========================================================

  bindEvents() {
    // 将指针坐标换算为 canvas 内部坐标系（960×600 逻辑像素）。
    // 关键：canvas 可能被 CSS 缩放（移动端自适应），必须用
    // 逻辑宽度 / getBoundingClientRect 的实际宽度 作为缩放系数，
    // 否则 CSS 缩放后点击位置会偏移。
    const toCanvasPoint = (clientX, clientY) => {
      const rect = this.canvas.getBoundingClientRect();
      const scaleX = CONFIG.CANVAS_WIDTH / (rect.width || CONFIG.CANVAS_WIDTH);
      const scaleY = CONFIG.CANVAS_HEIGHT / (rect.height || CONFIG.CANVAS_HEIGHT);
      return { x: (clientX - rect.left) * scaleX, y: (clientY - rect.top) * scaleY };
    };

    this.canvas.addEventListener('mousemove', (e) => {
      const p = toCanvasPoint(e.clientX, e.clientY);
      this.mouseX = p.x;
      this.mouseY = p.y;
    });

    // 统一用 click 处理放置/收集（鼠标左键、触屏 tap 都会触发），
    // 保证缩放后坐标正确。
    this.canvas.addEventListener('click', (e) => {
      if (this.state !== 'playing') return;
      const p = toCanvasPoint(e.clientX, e.clientY);
      const mx = p.x;
      const my = p.y;

      // 先检查点击阳光
      for (let i = this.suns.length - 1; i >= 0; i--) {
        const sun = this.suns[i];
        const dist = Math.hypot(mx - sun.x, my - sun.y);
        if (dist < CONFIG.SUN_COLLECT_RADIUS) {
          this.collectSun(sun);
          return;
        }
      }

      // 铲子模式：铲除植物回收阳光
      if (this.shovelMode) {
        const cell = this.getCellAt(mx, my);
        if (cell && this.grid[cell.row][cell.col]) {
          const refund = this.removePlant(cell.row, cell.col);
          if (refund > 0) Sound.collectSun();
        }
        return;
      }

      // 再检查放置植物
      if (this.selectedPlant) {
        const cell = this.getCellAt(mx, my);
        if (cell && this.canPlacePlant(cell.row, cell.col)) {
          this.placePlant(this.selectedPlant.id, cell.row, cell.col);
        }
      }
    });

    // 触屏：阻止 tap 后的 300ms 延迟滚动/双击缩放，让 tap 即触发 click
    this.canvas.addEventListener('touchstart', (e) => {
      e.preventDefault();
      if (e.touches.length > 0) {
        const p = toCanvasPoint(e.touches[0].clientX, e.touches[0].clientY);
        this.mouseX = p.x;
        this.mouseY = p.y;
      }
    }, { passive: false });

    // 右键取消选择 / 退出铲子模式
    this.canvas.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      this.selectedPlant = null;
      this.shovelMode = false;
      this.emitStateChange();
    });
  }

  // 由 canvas 内部坐标 (960×600) 取格子，独立于鼠标状态，供放置/铲子使用
  getCellAt(mx, my) {
    const col = Math.floor((mx - CONFIG.GRID_OFFSET_X) / CONFIG.CELL_WIDTH);
    const row = Math.floor((my - CONFIG.GRID_OFFSET_Y) / CONFIG.CELL_HEIGHT);
    if (row < 0 || row >= CONFIG.ROWS || col < 0 || col >= CONFIG.COLS) {
      return null;
    }
    return { row, col };
  }

  canPlacePlant(row, col) {
    if (!this.selectedPlant) return false;
    if (this.sun < this.selectedPlant.cost) return false;
    return this.grid[row][col] === null;
  }

  placePlant(typeId, row, col) {
    const type = PLANT_TYPES[typeId];
    if (this.sun < type.cost) return false;
    if (this.grid[row][col] !== null) return false;

    // 沙盒模式：植物免费（不扣阳光，保持 MAX 不变）
    if (!this.sandboxMode) {
      this.sun -= type.cost;
    }
    const plant = new Plant(typeId, row, col);
    this.plants.push(plant);
    this.grid[row][col] = plant;

    this.selectedPlant = null;
    Sound.placePlant();
    this.emitSunChange();
    this.emitStateChange();
    if (this.onPlantPlaced) {
      this.onPlantPlaced(typeId);
    }
    return true;
  }

  // ==========================================================
  // 实体生成
  // ==========================================================

  spawnZombie(typeId, row, hpMul = 1) {
    const zombie = new Zombie(typeId, row);
    if (hpMul !== 1) {
      // 无尽模式：按波次递增僵尸 HP
      zombie.hp = Math.round(zombie.hp * hpMul);
      zombie.maxHp = Math.round(zombie.maxHp * hpMul);
    }
    this.zombies.push(zombie);
  }

  spawnProjectile(data) {
    this.projectiles.push({
      x: data.x,
      y: data.y,
      row: data.row,
      damage: data.damage,
      speed: data.speed,
      slowFactor: data.slowFactor,
      slowDuration: data.slowDuration,
      color: data.color,
      penetrate: data.penetrate || false,
      charm: data.charm || false,
      hit: false,
      hitZombies: null,
    });
  }

  spawnSun(x, y, amount, source) {
    const targetY = source === 'sky'
      ? 80 + Math.random() * (CONFIG.CANVAS_HEIGHT - 160)
      : y;
    this.suns.push({
      x,
      y,
      targetY,
      amount,
      source,
      life: 0,
    });
  }

  collectSun(sun) {
    this.sun += sun.amount;
    this.suns = this.suns.filter(s => s !== sun);
    Sound.collectSun();
    this.emitSunChange();
  }

  recordKill(typeId) {
    const type = ZOMBIE_TYPES[typeId];
    this.kills++;
    this.score += (type && type.score) || 10;
    this.emitScoreChange();
  }

  // 过关奖励：基础500 + 剩余阳光折算
  computeClearBonus() {
    const base = 500;
    const sunBonus = Math.floor(this.sun / 10); // 每10阳光=1分
    return base + sunBonus;
  }

  addExplosion(x, y, radius, damage) {
    // 对范围内僵尸造成伤害
    for (const zombie of this.zombies) {
      const dist = Math.hypot(zombie.x - x, zombie.y - y);
      if (dist <= radius + 30) {
        zombie.takeDamage(damage);
      }
    }
    this.explosions.push({
      x, y, radius, damage,
      life: 0,
      duration: 500,
    });
  }

  // ==========================================================
  // 查询
  // ==========================================================

  getPlantAt(row, x) {
    // 找到该行中 x 位置附近的植物
    for (const plant of this.plants) {
      if (plant.row !== row || !plant.alive) continue;
      const dist = Math.abs(plant.x - x);
      if (dist < 30) {
        return plant;
      }
    }
    return null;
  }
  getFirstZombieInRow(row, minX, maxX) {
    let best = null;
    let bestX = Infinity;
    for (const zombie of this.zombies) {
      if (zombie.row !== row || zombie.dead || zombie.isAlly) continue;
      if (zombie.x >= minX && zombie.x <= maxX) {
        if (zombie.x < bestX) {
          bestX = zombie.x;
          best = zombie;
        }
      }
    }
    return best;
  }

  getZombieInRowAt(row, x, myIsAlly) {
    for (const zombie of this.zombies) {
      if (zombie.row !== row || zombie.dead || zombie.isAlly === myIsAlly) continue;
      const dist = Math.abs(zombie.x - x);
      if (dist < 35) {
        return zombie;
      }
    }
    return null;
  }

  getAliveZombieCount() {
    return this.zombies.filter(z => z.alive && !z.dead).length;
  }

  // 是否为夜间关卡（夜间不掉自然阳光，背景为深色）
  isNightLevel() {
    return this.levelManager && this.levelManager.level && this.levelManager.level.night;
  }

  // ==========================================================
  // 游戏事件
  // ==========================================================

  zombieReachedHouse(zombie) {
    zombie.alive = false;
    // 沙盒模式：不设失败条件（僵尸到达房屋仅清除该僵尸，不触发 lose）
    if (this.sandboxMode) return;
    this.state = 'lose';
    Sound.lose();
    this.emitStateChange();
  }

  onAllWavesComplete() {
    const bonus = this.computeClearBonus();
    this.score += bonus;
    this.lastBonus = bonus;
    this.state = 'win';
    Sound.win();
    const levelId = this.levelManager.level.id;
    // 星级：按本次通关使用的割草机数量（0-1台→3星，2-3台→2星，4台及以上→1星）
    const mowersUsed = this.mowers.filter(m => m.spent).length;
    const stars = mowersUsed <= 1 ? 3 : mowersUsed <= 3 ? 2 : 1;
    this.lastStars = stars;
    this.lastMowersUsed = mowersUsed;
    SaveStore.addClearScore(levelId, this.score, stars);
    SaveStore.recordWin();
    // 通关后清除该关检查点，避免失败屏"从检查点继续"误用旧存档
    SaveStore.clearCheckpoint(levelId);
    this.emitStateChange();
    this.emitScoreChange();
  }

  // ==========================================================
  // 事件发射
  // ==========================================================

  emitStateChange() {
    if (this.onStateChange) {
      this.onStateChange({
        state: this.state,
        selectedPlant: this.selectedPlant,
        sun: this.sun,
      });
    }
  }

  emitSunChange() {
    if (this.onSunChange) {
      this.onSunChange(this.sun);
    }
  }

  emitWaveChange() {
    if (this.onWaveChange && this.levelManager) {
      this.onWaveChange(this.levelManager.getWaveInfo());
    }
  }

  emitScoreChange() {
    if (this.onScoreChange) {
      this.onScoreChange(this.score, this.kills);
    }
  }
}