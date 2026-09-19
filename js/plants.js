// ============================================================
// 植物实体模块
// ============================================================

class Plant {
  constructor(typeId, row, col) {
    this.type = PLANT_TYPES[typeId];
    this.typeId = typeId;
    this.row = row;
    this.col = col;
    this.x = CONFIG.GRID_OFFSET_X + col * CONFIG.CELL_WIDTH + CONFIG.CELL_WIDTH / 2;
    this.y = CONFIG.GRID_OFFSET_Y + row * CONFIG.CELL_HEIGHT + CONFIG.CELL_HEIGHT / 2;
    this.hp = this.type.hp;
    this.maxHp = this.type.hp;
    this.alive = true;

    // 行为计时器
    this.sunTimer = 0;
    this.fireTimer = 0;
    this.fuseTimer = 0;
    this.exploded = false;

    // 动画
    this.animTime = Math.random() * 1000;
    this.bobOffset = 0;
  }

  update(dt, game) {
    this.animTime += dt;
    this.bobOffset = Math.sin(this.animTime / 500) * 3;

    switch (this.type.behavior) {
      case 'sunProducer':
        this.updateSunProducer(dt, game);
        break;
      case 'shooter':
        this.updateShooter(dt, game);
        break;
      case 'charm':
        this.updateCharm(dt, game);
        break;
      case 'bomb':
        this.updateBomb(dt, game);
        break;
      case 'wall':
        // 坚果墙无主动行为
        break;
    }
  }

  updateSunProducer(dt, game) {
    this.sunTimer += dt;
    if (this.sunTimer >= this.type.sunInterval) {
      this.sunTimer = 0;
      game.spawnSun(this.x, this.y - 20, this.type.sunAmount, 'plant');
    }
  }
  updateShooter(dt, game) {
    // 检查本行是否有僵尸在射程内
    const target = game.getFirstZombieInRow(this.row, this.x, this.x + this.type.range);
    if (!target) {
      this.fireTimer = 0;
      return;
    }

    this.fireTimer += dt;
    if (this.fireTimer >= this.type.fireInterval) {
      this.fireTimer = 0;
      const shots = this.type.shotsPerFire || 1;
      // 双射豌豆：同时覆盖本行与相邻行
      const targetRows = this.type.dualRow
        ? [this.row, this.row + 1]
        : [this.row];
      for (const tRow of targetRows) {
        if (tRow >= CONFIG.ROWS) continue;
        for (let i = 0; i < shots; i++) {
          const bulletColor = this.type.projectileColor
            || (this.type.slowFactor ? '#b3e5fc' : (this.type.charm ? '#ce93d8' : '#66bb6a'));
          game.spawnProjectile({
            x: this.x + 20,
            y: this.y - 5,
            row: tRow,
            damage: this.type.damage,
            speed: this.type.projectileSpeed,
            slowFactor: this.type.slowFactor || 0,
            slowDuration: this.type.slowDuration || 0,
            color: bulletColor,
            penetrate: this.type.penetrate || false,
            charm: this.type.charm || false,
          });
        }
      }
      Sound.shoot();
    }
  }

  updateCharm(dt, game) {
    // 魅惑菇：接触僵尸时触发，没有射程概念，检测本行相邻僵尸
    const zombie = game.getFirstZombieInRow(this.row, this.x - 10, this.x + 10);
    if (zombie) {
      zombie.isAlly = true;
      this.alive = false;
      Sound.zombieDie();
    }
  }

  updateBomb(dt, game) {    this.fuseTimer += dt;
    if (this.fuseTimer >= this.type.fuseTime && !this.exploded) {
      this.explode(game);
    }
  }

  explode(game) {
    this.exploded = true;
    this.alive = false;
    game.addExplosion(this.x, this.y, this.type.blastRadius, this.type.damage);
    Sound.explosion();
  }

  takeDamage(dmg) {
    this.hp -= dmg;
    if (this.hp <= 0) {
      this.alive = false;
    }
  }

  render(ctx) {
    if (!this.alive) return;

    const { x, y } = this;
    const bob = this.bobOffset;

    // 阴影
    ctx.fillStyle = 'rgba(0,0,0,0.2)';
    ctx.beginPath();
    ctx.ellipse(x, y + 30, 22, 8, 0, 0, Math.PI * 2);
    ctx.fill();

    // 根据行为绘制不同植物
    switch (this.type.behavior) {
      case 'sunProducer':
        this.renderSunflower(ctx, x, y + bob);
        break;
      case 'shooter':
        if (this.typeId === 'mushroomShooter') {
          this.renderMushroom(ctx, x, y + bob);
        } else if (this.typeId === 'dualPea') {
          this.renderDualPea(ctx, x, y + bob);
        } else if (this.type.penetrate) {
          this.renderCatTail(ctx, x, y + bob);
        } else if (this.type.charm) {
          this.renderChaosShroom(ctx, x, y + bob);
        } else {
          this.renderShooter(ctx, x, y + bob);
        }
        break;
      case 'charm':
        this.renderChaosShroom(ctx, x, y + bob);
        break;
      case 'wall':
        this.renderWallnut(ctx, x, y + bob);
        break;
      case 'bomb':
        this.renderBomb(ctx, x, y + bob);
        break;
    }

    // 血条(受伤时显示)
    if (this.hp < this.maxHp) {
      const barW = 40;
      const barH = 5;
      const barX = x - barW / 2;
      const barY = y - 38;
      ctx.fillStyle = 'rgba(0,0,0,0.5)';
      ctx.fillRect(barX, barY, barW, barH);
      ctx.fillStyle = this.hp / this.maxHp > 0.5 ? '#4caf50' : '#f44336';
      ctx.fillRect(barX, barY, barW * (this.hp / this.maxHp), barH);
    }
  }

  renderSunflower(ctx, x, y) {
    // 茎
    ctx.strokeStyle = '#2e7d32';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(x, y + 20);
    ctx.lineTo(x, y + 30);
    ctx.stroke();

    // 叶子
    ctx.fillStyle = '#4caf50';
    ctx.beginPath();
    ctx.ellipse(x - 8, y + 26, 8, 4, -0.5, 0, Math.PI * 2);
    ctx.fill();

    // 花瓣
    ctx.fillStyle = '#ffd700';
    for (let i = 0; i < 10; i++) {
      const angle = (i / 10) * Math.PI * 2;
      ctx.beginPath();
      ctx.ellipse(
        x + Math.cos(angle) * 14,
        y + Math.sin(angle) * 14,
        7, 4, angle, 0, Math.PI * 2
      );
      ctx.fill();
    }

    // 花心
    ctx.fillStyle = '#8d6e63';
    ctx.beginPath();
    ctx.arc(x, y, 10, 0, Math.PI * 2);
    ctx.fill();

    // 笑脸
    ctx.fillStyle = '#5d4037';
    ctx.beginPath();
    ctx.arc(x - 3, y - 2, 1.5, 0, Math.PI * 2);
    ctx.arc(x + 3, y - 2, 1.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#5d4037';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(x, y + 2, 4, 0.2, Math.PI - 0.2);
    ctx.stroke();
  }

  renderShooter(ctx, x, y) {
    // 茎
    ctx.strokeStyle = '#2e7d32';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(x, y + 15);
    ctx.lineTo(x, y + 30);
    ctx.stroke();

    // 主体(圆球)
    const isSnow = this.type.slowFactor > 0;
    const isRepeater = this.type.shotsPerFire > 1;
    ctx.fillStyle = isSnow ? '#4fc3f7' : (isRepeater ? '#66bb6a' : '#4caf50');
    ctx.beginPath();
    ctx.arc(x, y, 16, 0, Math.PI * 2);
    ctx.fill();

    // 高光
    ctx.fillStyle = 'rgba(255,255,255,0.3)';
    ctx.beginPath();
    ctx.arc(x - 5, y - 6, 5, 0, Math.PI * 2);
    ctx.fill();

    // 炮管
    ctx.fillStyle = isSnow ? '#0288d1' : '#388e3c';
    ctx.fillRect(x + 8, y - 6, 18, 12);
    ctx.beginPath();
    ctx.arc(x + 26, y, 6, 0, Math.PI * 2);
    ctx.fill();

    // 眼睛
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(x - 4, y - 2, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#000';
    ctx.beginPath();
    ctx.arc(x - 3, y - 2, 2, 0, Math.PI * 2);
    ctx.fill();

    // 双发标记
    if (isRepeater) {
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 10px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('×2', x, y + 24);
    }
  }

  renderMushroom(ctx, x, y) {
    // 蘑菇主体
    ctx.fillStyle = '#8d6e63';
    ctx.beginPath();
    ctx.ellipse(x, y + 10, 16, 8, 0, 0, Math.PI * 2);
    ctx.fill();
    // 蘑菇帽
    ctx.fillStyle = '#d7ccc8';
    ctx.beginPath();
    ctx.arc(x, y, 14, Math.PI, 0);
    ctx.fill();
    // 帽点
    ctx.fillStyle = '#a1887f';
    ctx.beginPath();
    ctx.arc(x - 6, y - 4, 3, 0, Math.PI * 2);
    ctx.arc(x + 5, y - 6, 3, 0, Math.PI * 2);
    ctx.fill();
    // 眼睛
    ctx.fillStyle = '#000';
    ctx.beginPath();
    ctx.arc(x - 4, y + 2, 2, 0, Math.PI * 2);
    ctx.arc(x + 4, y + 2, 2, 0, Math.PI * 2);
    ctx.fill();
  }

  renderDualPea(ctx, x, y) {
    // 双管豌豆：两个并列炮管
    ctx.strokeStyle = '#2e7d32';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(x, y + 15);
    ctx.lineTo(x, y + 30);
    ctx.stroke();
    const isDual = true;
    ctx.fillStyle = '#43a047';
    ctx.beginPath();
    ctx.arc(x, y, 15, 0, Math.PI * 2);
    ctx.fill();
    // 双炮管
    ctx.fillStyle = '#388e3c';
    ctx.fillRect(x + 6, y - 10, 18, 8);
    ctx.fillRect(x + 6, y + 2, 18, 8);
    ctx.beginPath();
    ctx.arc(x + 24, y - 6, 5, 0, Math.PI * 2);
    ctx.arc(x + 24, y + 6, 5, 0, Math.PI * 2);
    ctx.fill();
    // 闪电标记
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 10px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('⚡', x, y + 24);
  }

  renderCatTail(ctx, x, y) {
    // 草丛状主体 - 多片尖叶
    const leafCount = 5;
    for (let i = 0; i < leafCount; i++) {
      const angle = -Math.PI / 2 + (i - (leafCount - 1) / 2) * 0.35;
      const sway = Math.sin(this.animTime / 400 + i * 0.8) * 4;
      const lx = x + Math.cos(angle) * 12 + sway;
      const ly = y + Math.sin(angle) * 12;

      ctx.save();
      ctx.translate(lx, ly);
      ctx.rotate(angle + Math.PI / 2);

      // 叶片
      ctx.fillStyle = i % 2 === 0 ? '#7b1fa2' : '#4caf50';
      ctx.beginPath();
      ctx.moveTo(0, 14);
      ctx.quadraticCurveTo(-8, 0, 0, -18);
      ctx.quadraticCurveTo(8, 0, 0, 14);
      ctx.fill();

      // 叶脉
      ctx.strokeStyle = 'rgba(0,0,0,0.2)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, 12);
      ctx.lineTo(0, -14);
      ctx.stroke();

      ctx.restore();
    }

    // 茎
    ctx.strokeStyle = '#2e7d32';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(x, y + 8);
    ctx.lineTo(x, y + 30);
    ctx.stroke();

    // 叶子
    ctx.fillStyle = '#4caf50';
    ctx.beginPath();
    ctx.ellipse(x - 8, y + 24, 7, 3, -0.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(x + 7, y + 20, 6, 3, 0.4, 0, Math.PI * 2);
    ctx.fill();

    // 猫脸（在草丛中间）
    // 眼睛
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.ellipse(x - 5, y, 4, 3.5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(x + 5, y, 4, 3.5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#333';
    ctx.beginPath();
    ctx.arc(x - 4, y, 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(x + 6, y, 2, 0, Math.PI * 2);
    ctx.fill();

    // 鼻子
    ctx.fillStyle = '#e91e63';
    ctx.beginPath();
    ctx.moveTo(x, y + 4);
    ctx.lineTo(x - 2, y + 7);
    ctx.lineTo(x + 2, y + 7);
    ctx.closePath();
    ctx.fill();

    // 嘴巴
    ctx.strokeStyle = '#333';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(x, y + 7);
    ctx.lineTo(x, y + 9);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(x - 3, y + 10, 2.5, Math.PI + 0.3, -0.3);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(x + 3, y + 10, 2.5, Math.PI - 0.3, 0.3);
    ctx.stroke();

    // 胡须
    ctx.strokeStyle = 'rgba(51,51,51,0.5)';
    ctx.lineWidth = 1;
    for (let side = -1; side <= 1; side += 2) {
      ctx.beginPath();
      ctx.moveTo(x + side * 6, y + 6);
      ctx.lineTo(x + side * 18, y + 3);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(x + side * 6, y + 8);
      ctx.lineTo(x + side * 18, y + 9);
      ctx.stroke();
    }
  }

  renderChaosShroom(ctx, x, y) {
    // 蘑菇茎
    ctx.fillStyle = '#f5f5f5';
    ctx.beginPath();
    ctx.moveTo(x - 6, y + 28);
    ctx.lineTo(x - 8, y + 6);
    ctx.quadraticCurveTo(x, y + 2, x + 8, y + 6);
    ctx.lineTo(x + 6, y + 28);
    ctx.closePath();
    ctx.fill();

    // 菌盖（紫红色蘑菇伞）
    ctx.fillStyle = '#7b1fa2';
    ctx.beginPath();
    ctx.ellipse(x, y - 2, 20, 14, 0, Math.PI, 0);
    ctx.fill();

    // 菌盖斑点
    ctx.fillStyle = '#e1bee7';
    const spots = [[x - 8, y - 8], [x + 6, y - 10], [x + 1, y - 13], [x - 3, y - 6]];
    for (const [sx, sy] of spots) {
      ctx.beginPath();
      ctx.arc(sx, sy, 3, 0, Math.PI * 2);
      ctx.fill();
    }

    // 菌盖边缘
    ctx.strokeStyle = '#4a148c';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.ellipse(x, y - 2, 20, 14, 0, Math.PI, 0);
    ctx.stroke();

    // 眼睛（神秘紫色）
    ctx.fillStyle = '#e040fb';
    ctx.beginPath();
    ctx.arc(x - 5, y + 10, 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(x + 5, y + 10, 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#1a0030';
    ctx.beginPath();
    ctx.arc(x - 5, y + 10, 1.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(x + 5, y + 10, 1.5, 0, Math.PI * 2);
    ctx.fill();

    // 诡异微笑
    ctx.strokeStyle = '#e040fb';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(x, y + 15, 5, 0.3, Math.PI - 0.3);
    ctx.stroke();

    // 根须
    ctx.strokeStyle = '#e0e0e0';
    ctx.lineWidth = 2;
    for (let i = -1; i <= 1; i++) {
      ctx.beginPath();
      ctx.moveTo(x + i * 4, y + 28);
      ctx.quadraticCurveTo(x + i * 8, y + 34, x + i * 6, y + 38);
      ctx.stroke();
    }
  }

  renderWallnut(ctx, x, y) {
    // 坚果主体
    ctx.fillStyle = '#a1887f';
    ctx.beginPath();
    ctx.ellipse(x, y, 22, 26, 0, 0, Math.PI * 2);
    ctx.fill();

    // 纹理
    ctx.strokeStyle = '#795548';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x - 10, y - 10);
    ctx.quadraticCurveTo(x, y - 15, x + 10, y - 10);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x - 12, y);
    ctx.quadraticCurveTo(x, y + 5, x + 12, y);
    ctx.stroke();

    // 高光
    ctx.fillStyle = 'rgba(255,255,255,0.2)';
    ctx.beginPath();
    ctx.ellipse(x - 6, y - 10, 6, 8, -0.3, 0, Math.PI * 2);
    ctx.fill();

    // 表情
    ctx.fillStyle = '#4e342e';
    ctx.beginPath();
    ctx.arc(x - 6, y - 4, 2, 0, Math.PI * 2);
    ctx.arc(x + 6, y - 4, 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#4e342e';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(x, y + 4, 5, 0.3, Math.PI - 0.3);
    ctx.stroke();
  }

  renderBomb(ctx, x, y) {
    // 樱桃主体
    ctx.fillStyle = '#e53935';
    ctx.beginPath();
    ctx.arc(x - 8, y + 2, 12, 0, Math.PI * 2);
    ctx.arc(x + 8, y + 2, 12, 0, Math.PI * 2);
    ctx.fill();

    // 高光
    ctx.fillStyle = 'rgba(255,255,255,0.3)';
    ctx.beginPath();
    ctx.arc(x - 11, y - 2, 4, 0, Math.PI * 2);
    ctx.arc(x + 5, y - 2, 4, 0, Math.PI * 2);
    ctx.fill();

    // 茎
    ctx.strokeStyle = '#2e7d32';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(x, y - 8);
    ctx.quadraticCurveTo(x + 2, y - 18, x + 6, y - 22);
    ctx.stroke();

    // 引信闪烁
    const blink = Math.sin(this.animTime / 100) > 0;
    if (blink) {
      ctx.fillStyle = '#ffeb3b';
      ctx.beginPath();
      ctx.arc(x + 6, y - 24, 4, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}