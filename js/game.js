// ============================================================
// 核心游戏引擎
// ============================================================

class Game {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.state = 'menu'; // menu | playing | win | lose
    this.isPaused = false; // 暂停标志（由UI管理，与state独立）

    // 资源
    this.sun = 0;
    this.plants = [];
    this.zombies = [];
    this.projectiles = [];
    this.suns = [];
    this.explosions = [];

    // 网格占用
    this.grid = [];
    for (let r = 0; r < CONFIG.ROWS; r++) {
      this.grid.push(new Array(CONFIG.COLS).fill(null));
    }

    // 输入状态
    this.selectedPlant = null;
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

  startLevel(levelId) {
    const level = LEVELS[levelId];
    this.sun = level.startSun;
    this.plants = [];
    this.zombies = [];
    this.projectiles = [];
    this.suns = [];
    this.explosions = [];
    this.grid = [];
    for (let r = 0; r < CONFIG.ROWS; r++) {
      this.grid.push(new Array(CONFIG.COLS).fill(null));
    }
    this.selectedPlant = null;
    this.sunFallTimer = 0;
    this.gameTime = 0;
    this.score = 0;
    this.kills = 0;

    this.levelManager = new LevelManager(levelId);
    this.levelManager.start();

    this.state = 'playing';
    this.emitStateChange();
    this.emitSunChange();
    this.emitWaveChange();
  }

  reset() {
    this.startLevel(1);
  }

  // ==========================================================
  // 更新
  // ==========================================================

  update(dt) {
    if (this.state !== 'playing') return;
    if (this.isPaused) return;

    this.gameTime += dt;

    // 天空掉阳光
    this.sunFallTimer += dt;
    if (this.sunFallTimer >= CONFIG.SUN_FALL_INTERVAL) {
      this.sunFallTimer = 0;
      const x = CONFIG.GRID_OFFSET_X + 50 + Math.random() * (CONFIG.CANVAS_WIDTH - CONFIG.GRID_OFFSET_X - 100);
      const y = -20;
      this.spawnSun(x, y, CONFIG.SUN_FALL_AMOUNT, 'sky');
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
      // 天空阳光下落
      if (sun.source === 'sky' && sun.y < sun.targetY) {
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

    // 放置预览
    this.renderPlacementPreview(ctx);

    // 房屋
    this.renderHouse(ctx);
  }

  renderBackground(ctx) {
    // 草地背景
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
    if (!this.selectedPlant || this.state !== 'playing') return;

    const cell = this.getCellFromMouse();
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
  // 输入处理
  // ==========================================================

  bindEvents() {
    this.canvas.addEventListener('mousemove', (e) => {
      const rect = this.canvas.getBoundingClientRect();
      this.mouseX = e.clientX - rect.left;
      this.mouseY = e.clientY - rect.top;
    });

    this.canvas.addEventListener('click', (e) => {
      if (this.state !== 'playing') return;
      const rect = this.canvas.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;

      // 先检查点击阳光
      for (let i = this.suns.length - 1; i >= 0; i--) {
        const sun = this.suns[i];
        const dist = Math.hypot(mx - sun.x, my - sun.y);
        if (dist < CONFIG.SUN_COLLECT_RADIUS) {
          this.collectSun(sun);
          return;
        }
      }

      // 再检查放置植物
      if (this.selectedPlant) {
        const cell = this.getCellFromMouse();
        if (cell && this.canPlacePlant(cell.row, cell.col)) {
          this.placePlant(this.selectedPlant.id, cell.row, cell.col);
        }
      }
    });

    // 右键取消选择
    this.canvas.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      this.selectedPlant = null;
      this.emitStateChange();
    });
  }

  getCellFromMouse() {
    const col = Math.floor((this.mouseX - CONFIG.GRID_OFFSET_X) / CONFIG.CELL_WIDTH);
    const row = Math.floor((this.mouseY - CONFIG.GRID_OFFSET_Y) / CONFIG.CELL_HEIGHT);
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

    this.sun -= type.cost;
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

  spawnZombie(typeId, row) {
    const zombie = new Zombie(typeId, row);
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

  // ==========================================================
  // 游戏事件
  // ==========================================================

  zombieReachedHouse(zombie) {
    zombie.alive = false;
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
    SaveStore.addClearScore(this.levelManager.level.id, this.score);
    SaveStore.recordWin();
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