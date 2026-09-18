// ============================================================
// 僵尸实体模块
// ============================================================

class Zombie {
  constructor(typeId, row) {
    this.type = ZOMBIE_TYPES[typeId];
    this.typeId = typeId;
    this.row = row;
    this.x = CONFIG.ZOMBIE_SPAWN_X;
    this.y = CONFIG.GRID_OFFSET_Y + row * CONFIG.CELL_HEIGHT + CONFIG.CELL_HEIGHT / 2;
    this.hp = this.type.hp;
    this.maxHp = this.type.hp;
    this.speed = this.type.speed;
    this.alive = true;
    this.eating = false;
    this.attackTimer = 0;
    this.slowTimer = 0;
    this.slowFactor = 1;
    this.isAlly = false; // 被魅惑后为true，向左走并攻击植物
    this.hasTakenHit = false;   // 读报僵尸是否已被首次命中
    this.isVaulting = false;    // 撑杆僵尸跳跃标志

    // 动画
    this.animTime = Math.random() * 1000;
    this.walkPhase = 0;
    this.dead = false;
    this.deathTimer = 0;
  }

  update(dt, game) {
    if (this.dead) {
      this.deathTimer += dt;
      if (this.deathTimer > 800) {
        this.alive = false;
      }
      return;
    }

    this.animTime += dt;

    // 减速状态
    if (this.slowTimer > 0) {
      this.slowTimer -= dt;
      if (this.slowTimer <= 0) {
        this.slowFactor = 1;
      }
    }

    // 优先检查本行敌方僵尸（僵尸间战斗）
    const enemy = game.getZombieInRowAt(this.row, this.x, this.isAlly);
    if (enemy && enemy.isAlly !== this.isAlly) {
      this.eating = true;
      this.attackTimer += dt;
      if (this.attackTimer >= this.type.attackInterval) {
        this.attackTimer = 0;
        enemy.takeDamage(this.type.damage);
        Sound.zombieEat();
      }
    } else {
      // 检查前方是否有植物阻挡（友军僵尸不攻击植物）
      const plant = game.getPlantAt(this.row, this.x);
      if (plant) {
        // 撑杆僵尸：跳跃越过第一排植物（不啃食）
        if (this.type.jumpOverPlant && !this.isVaulting) {
          this.isVaulting = true;
          this.x -= (plant.x - this.x + 40) + 60; // 越过并继续前进
          this.isVaulting = false;
          this.walkPhase += dt / 50; // 跳跃动画加速
          return;
        }
        if (plant.type.behavior === 'charm') {
          plant.alive = false;
          this.isAlly = true;
          Sound.zombieDie();
          return;
        }
        if (!this.isAlly) {
          this.eating = true;
          this.attackTimer += dt;
          if (this.attackTimer >= this.type.attackInterval) {
            this.attackTimer = 0;
            plant.takeDamage(this.type.damage);
            Sound.zombieEat();
          }
        }
      } else {
        this.eating = false;
        this.attackTimer = 0;
        // 普通僵尸向左(x减小)，被魅惑的僵尸向右(x增大)
        this.x -= this.speed * this.slowFactor * (dt / 1000) * (this.isAlly ? -1 : 1);
        this.walkPhase += dt / 100;
      }
    }

    // 普通僵尸到达房屋即失败；被魅惑的僵尸到达右侧边界则消失
    if (!this.isAlly) {
      if (this.x <= CONFIG.HOUSE_X) {
        game.zombieReachedHouse(this);
      }
    } else {
      if (this.x > CONFIG.CANVAS_WIDTH + 30) {
        this.alive = false;
      }
    }
  }

  applySlow(factor, duration) {
    this.slowFactor = factor;
    this.slowTimer = duration;
  }

  takeDamage(dmg) {
    this.hp -= dmg;
    // 读报僵尸：首次被命中后丢报纸加速
    if (this.type.newspaperBehavior && !this.hasTakenHit) {
      this.hasTakenHit = true;
      this.speed = this.type.speedAfterHit;
    }
    if (this.hp <= 0 && !this.dead) {
      this.dead = true;
      this.deathTimer = 0;
      Sound.zombieDie();
    }
  }

  render(ctx) {
    if (!this.alive) return;

    const { x, y } = this;

    // 死亡动画(倒下)
    if (this.dead) {
      const progress = Math.min(this.deathTimer / 800, 1);
      ctx.save();
      ctx.translate(x, y);
      ctx.scale(-1, 1);
      ctx.rotate(-progress * Math.PI / 2);
      this.renderBody(ctx, 0, 0);
      ctx.restore();
      return;
    }

    // 阴影
    ctx.fillStyle = 'rgba(0,0,0,0.2)';
    ctx.beginPath();
    ctx.ellipse(x, y + 30, 20, 7, 0, 0, Math.PI * 2);
    ctx.fill();

    // 走路摆动
    const wobble = Math.sin(this.walkPhase) * 3;
    ctx.save();
    ctx.translate(x, y + wobble);
    // 普通僵尸向左(已翻转)，被魅惑的僵尸向右(再翻转回来显示正脸)
    ctx.scale(this.isAlly ? 1 : -1, 1);
    this.renderBody(ctx, 0, 0);
    ctx.restore();

    // 血条
    if (this.hp < this.maxHp) {
      const barW = 36;
      const barH = 4;
      const barX = x - barW / 2;
      const barY = y - 40;
      ctx.fillStyle = 'rgba(0,0,0,0.5)';
      ctx.fillRect(barX, barY, barW, barH);
      ctx.fillStyle = this.hp / this.maxHp > 0.5 ? '#4caf50' : '#f44336';
      ctx.fillRect(barX, barY, barW * (this.hp / this.maxHp), barH);
    }

    // 减速效果(蓝色覆盖)
    if (this.slowTimer > 0) {
      ctx.fillStyle = 'rgba(79,195,247,0.25)';
      ctx.beginPath();
      ctx.ellipse(x, y, 20, 30, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    // 魅惑光环(紫色覆盖)
    if (this.isAlly) {
      ctx.fillStyle = 'rgba(156, 39, 176, 0.2)';
      ctx.beginPath();
      ctx.ellipse(x, y, 22, 32, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = 'rgba(156, 39, 176, 0.5)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.ellipse(x, y, 22, 32, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  renderBody(ctx, x, y) {
    const isRunner = this.typeId === 'runner';
    const isCone = this.typeId === 'cone';

    // 腿
    ctx.strokeStyle = '#37474f';
    ctx.lineWidth = 4;
    const legSwing = Math.sin(this.walkPhase * 2) * 5;
    ctx.beginPath();
    ctx.moveTo(x - 5, y + 15);
    ctx.lineTo(x - 5 + legSwing, y + 28);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x + 5, y + 15);
    ctx.lineTo(x + 5 - legSwing, y + 28);
    ctx.stroke();

    // 身体
    ctx.fillStyle = isRunner ? '#5d4037' : '#4e342e';
    ctx.beginPath();
    ctx.ellipse(x, y, 14, 18, 0, 0, Math.PI * 2);
    ctx.fill();

    // 衣服
    ctx.fillStyle = isRunner ? '#e53935' : '#455a64';
    ctx.beginPath();
    ctx.ellipse(x, y + 4, 13, 12, 0, 0, Math.PI * 2);
    ctx.fill();

    // 手臂(向前伸)
    ctx.strokeStyle = '#4e342e';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(x + 8, y - 2);
    ctx.lineTo(x + 20, y + 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x + 8, y + 4);
    ctx.lineTo(x + 18, y + 8);
    ctx.stroke();

    // 头
    ctx.fillStyle = isRunner ? '#8d6e63' : '#a1887f';
    ctx.beginPath();
    ctx.arc(x, y - 22, 12, 0, Math.PI * 2);
    ctx.fill();

    // 眼睛
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(x + 3, y - 24, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#f44336';
    ctx.beginPath();
    ctx.arc(x + 4, y - 24, 2, 0, Math.PI * 2);
    ctx.fill();

    // 嘴
    ctx.strokeStyle = '#3e2723';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(x + 2, y - 16, 4, 0.2, Math.PI - 0.2);
    ctx.stroke();

    // 路障(橙色锥桶)
    if (isCone) {
      ctx.fillStyle = '#ef6c00';
      ctx.beginPath();
      ctx.moveTo(x - 10, y - 32);
      ctx.lineTo(x + 10, y - 32);
      ctx.lineTo(x, y - 48);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.fillRect(x - 8, y - 36, 16, 3);
    }

    // 奔跑僵尸的头发
    if (isRunner) {
      ctx.fillStyle = '#3e2723';
      ctx.beginPath();
      ctx.moveTo(x - 10, y - 30);
      ctx.quadraticCurveTo(x, y - 42, x + 10, y - 30);
      ctx.closePath();
      ctx.fill();
    }

    // 铁桶僵尸（灰色铁桶罩头）
    if (this.typeId === 'bucket') {
      ctx.fillStyle = '#9e9e9e';
      ctx.beginPath();
      ctx.ellipse(x, y - 28, 13, 16, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#757575';
      ctx.fillRect(x - 13, y - 30, 26, 4);
      ctx.fillStyle = '#bdbdbd';
      ctx.fillRect(x - 2, y - 34, 4, 12); // 桶上高光
    }

    // 撑杆僵尸（橙色运动装+撑杆）
    if (this.typeId === 'poleVault') {
      ctx.fillStyle = '#ff9800';
      ctx.beginPath();
      ctx.ellipse(x, y + 4, 13, 12, 0, 0, Math.PI * 2);
      ctx.fill();
      // 撑杆
      ctx.strokeStyle = '#616161';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(x + 10, y - 30);
      ctx.lineTo(x + 22, y + 28);
      ctx.stroke();
    }

    // 读报僵尸（报纸遮脸）
    if (this.typeId === 'newspaper') {
      if (!this.hasTakenHit) {
        ctx.fillStyle = '#fff8e1';
        ctx.fillRect(x + 2, y - 30, 14, 18);
        ctx.strokeStyle = '#9e9e9e';
        ctx.lineWidth = 1;
        ctx.strokeRect(x + 2, y - 30, 14, 18);
        // 报纸文字线
        ctx.strokeStyle = '#616161';
        ctx.beginPath();
        ctx.moveTo(x + 4, y - 26); ctx.lineTo(x + 14, y - 26);
        ctx.moveTo(x + 4, y - 22); ctx.lineTo(x + 14, y - 22);
        ctx.moveTo(x + 4, y - 18); ctx.lineTo(x + 14, y - 18);
        ctx.stroke();
      }
    }
  }
}