extends Node2D

# 僵尸类型 ID（"normal" / "cone" / "runner" / "bucket" / "pole_vault" / "newspaper"）
@export var type_id: String = "normal"

# Zombie stats（默认值，若指定 type_id 则从 ZombieTypes 覆盖）
@export var speed: float = 25.0       # slightly slower
@export var hp: int = 5               # increased from 3
@export var max_hp: int = 5
@export var attack_interval: float = 1.0  # faster attacks
@export var attack_damage: int = 1
@export var attack_range: float = 50.0  # increased from 25
@export var row_index: int = 0

var _sprite: Sprite2D
var attack_timer: float = 0.0
var eating: bool = false
var target_plant: Node = null
var _hit_flash_timer: float = 0.0
var _dead: bool = false
var _death_timer: float = 0.0
var score: int = 0                    # 击杀得分

# 行为标志（与浏览器版对齐）
var is_ally: bool = false             # 魅惑后转为友方：右行 + 攻击普通僵尸
var _jumped: bool = false             # 撑杆是否已跳跃越障
var _newspaper_hit: bool = false      # 读报是否已被首次击中
var _news_speed: float = 0.0         # 读报加速后的速度（来自 ZombieTypes.speed_after_hit）
var slow_factor: float = 1.0          # 减速倍率（寒冰豌豆，1.0 = 正常）
var slow_timer: float = 0.0           # 减速剩余时间（秒）

func _ready() -> void:
    add_to_group("zombies")
    _apply_type()
    _sprite = get_node("Sprite")
    _make_placeholder()

## 按 type_id 从 ZombieTypes 单例覆盖属性
func _apply_type() -> void:
    var zt = get_node_or_null("/root/ZombieTypes")
    var t: Dictionary = zt.get_type(type_id) if zt else {}
    max_hp = t.get("hp", max_hp)
    hp = max_hp
    speed = t.get("speed", speed)
    attack_interval = t.get("attack_interval", attack_interval)
    attack_damage = t.get("damage", attack_damage)
    score = t.get("score", 0)

## 程序化绘制僵尸（头/眼/嘴/身体/手臂/腿 + 头饰区分类型），避免绿色方块
func _make_placeholder() -> void:
    var W := 32
    var H := 64
    var img := Image.create(W, H, false, Image.FORMAT_RGBA8)
    var skin := Color(0.55, 0.68, 0.35)
    var skin_dark := Color(0.45, 0.56, 0.28)
    var shirt := Color(0.5, 0.42, 0.75)
    var pants := Color(0.3, 0.32, 0.45)
    var black := Color(0.1, 0.1, 0.1)

    # 头（圆角块）
    _fill_rounded(img, 6, 2, 20, 20, 4, skin)
    # 眼睛
    _rect(img, 10, 9, 4, 4, Color.WHITE)
    _rect(img, 18, 9, 4, 4, Color.WHITE)
    _rect(img, 11, 10, 2, 2, black)
    _rect(img, 19, 10, 2, 2, black)
    # 嘴
    _rect(img, 11, 16, 9, 2, skin_dark)
    # 身体
    _rect(img, 7, 22, 18, 18, shirt)
    # 手臂（前伸）
    _rect(img, 1, 25, 7, 5, skin)
    _rect(img, 24, 29, 8, 5, skin)
    # 腿
    _rect(img, 9, 40, 6, 20, pants)
    _rect(img, 17, 40, 6, 20, pants)

    # 头饰按类型区分
    match type_id:
        "cone":
            # 路锥（三角形）
            var tri := _tri_points(16, 2, 6, 24, 26, 22)
            for p in tri:
                var pv: Vector2 = p
                _rect(img, int(pv.x), int(pv.y), 1, 1, Color(0.95, 0.55, 0.1))
        "bucket":
            # 铁桶
            _fill_rounded(img, 5, 0, 22, 14, 3, Color(0.6, 0.62, 0.68))
            _rect(img, 5, 5, 22, 3, Color(0.45, 0.47, 0.52))
        "runner":
            # 红色头巾
            _rect(img, 5, 6, 22, 6, Color(0.8, 0.2, 0.2))
        "pole_vault":
            # 撑杆
            _rect(img, 29, 0, 3, 62, Color(0.7, 0.5, 0.25))
            _rect(img, 26, 2, 8, 4, Color(0.7, 0.5, 0.25))
        "newspaper":
            # 报纸（胸前白纸）
            _rect(img, 9, 24, 14, 12, Color(0.92, 0.9, 0.85))
            _rect(img, 10, 26, 12, 1, Color(0.5, 0.5, 0.5))
            _rect(img, 10, 29, 12, 1, Color(0.5, 0.5, 0.5))
            _rect(img, 10, 32, 12, 1, Color(0.5, 0.5, 0.5))

    var tex := ImageTexture.create_from_image(img)
    _sprite.texture = tex
    _sprite.offset = Vector2(W / 2, H)

## --- 像素绘制辅助 ---
func _rect(img: Image, x: int, y: int, w: int, h: int, col: Color) -> void:
    for py in range(y, y + h):
        if py < 0 or py >= img.get_height():
            continue
        for px in range(x, x + w):
            if px < 0 or px >= img.get_width():
                continue
            img.set_pixel(px, py, col)

func _fill_rounded(img: Image, x: int, y: int, w: int, h: int, r: int, col: Color) -> void:
    for py in range(y, y + h):
        for px in range(x, x + w):
            if px < 0 or py < 0 or px >= img.get_width() or py >= img.get_height():
                continue
            # 圆角判断
            var cdx := 0.0
            var cdy := 0.0
            var corner := 0
            if px < x + r and py < y + r:
                corner = 1
                cdx = px - (x + r - 1)
                cdy = py - (y + r - 1)
            elif px >= x + w - r and py < y + r:
                corner = 2
                cdx = px - (x + w - r)
                cdy = py - (y + r - 1)
            elif px < x + r and py >= y + h - r:
                corner = 3
                cdx = px - (x + r - 1)
                cdy = py - (y + h - r)
            elif px >= x + w - r and py >= y + h - r:
                corner = 4
                cdx = px - (x + w - r)
                cdy = py - (y + h - r)
            if corner != 0:
                var d := Vector2(cdx, cdy).length()
                if d > float(r):
                    continue
            img.set_pixel(px, py, col)

func _tri_points(ax: int, ay: int, bx: int, by: int, cx: int, cy: int) -> Array:
    var pts: Array = []
    for py in range(ay, cy + 1):
        var lft := int(lerpf(float(ax), float(bx), float(py - ay) / maxf(1.0, float(by - ay))))
        var rgt := int(lerpf(float(ax), float(cx), float(py - ay) / maxf(1.0, float(cy - ay))))
        for px in range(minf(float(lft), float(rgt)), maxf(float(lft), float(rgt)) + 1):
            pts.append(Vector2(px, py))
    return pts

func _process(delta: float) -> void:
    # Death animation - fade out and rotate (对齐浏览器 js/zombies.js：0.8s 内旋转 -90° 并淡出)
    if _dead:
        _death_timer += delta
        var progress: float = minf(_death_timer / 0.8, 1.0)
        _sprite.modulate.a = 1.0 - progress
        rotation = -progress * PI / 2.0
        if _death_timer >= 0.8:
            queue_free()
            return
    
    # Hit flash effect
    if _hit_flash_timer > 0:
        _hit_flash_timer -= delta
        if _hit_flash_timer <= 0:
            _sprite.modulate = Color(1, 1, 1, 1)
    
    # 减速状态（寒冰豌豆）：计时结束恢复常速
    if slow_timer > 0:
        slow_timer -= delta
        if slow_timer <= 0:
            slow_factor = 1.0
            # 恢复底色：友军保持魅惑蓝，普通僵尸恢复白
            _sprite.modulate = Color(0.4, 0.7, 1.0) if is_ally else Color(1, 1, 1, 1)
            queue_redraw()  # 减速结束后移除蓝色覆盖
    
    # 友方（魅惑）僵尸：右行，攻击普通僵尸，不再吃植物
    if is_ally:
        _process_ally(delta)
        return
    
    # 撑杆跳跃已改为瞬间跳过（见下方 _find_target_plant 分支），无需冲刺计时
    if not eating:
        position.x -= speed * slow_factor * delta
    # Check if we have reached the house
    if position.x <= 0:
        var main = get_tree().root.get_node("Main")
        if main:
            main.zombie_reached(row_index)
    # Update timers
    attack_timer += delta
    # Find target plant if not eating
    # 撑杆僵尸：接近植物时一帧内瞬间跳过（不啃食，与浏览器版对齐）
    if not eating:
        var plant = _find_target_plant()
        if plant:
            var _zt = get_node_or_null("/root/ZombieTypes")
            var _td: Dictionary = _zt.get_type(type_id) if _zt != null else {}
            if not _jumped and _td.get("jump_over_plant", false):
                _jumped = true
                # 越过植物并继续前进（落点 = 植物左侧一格）
                position.x = plant.position.x - 100.0
                return
            eating = true
            target_plant = plant
            attack_timer = 0.0
    else:
        # If eating, check if target plant still alive
        if not target_plant or not is_instance_valid(target_plant) or target_plant.hp <= 0:
            eating = false
            target_plant = null
            attack_timer = 0.0
            return
        # Attack the plant
        if attack_timer >= attack_interval:
            attack_timer = 0.0
            target_plant.take_damage(attack_damage)
            var snd = get_node_or_null("/root/Sound")
            if snd != null and snd.has_method("zombie_eat"):
                snd.zombie_eat()
            if target_plant.hp <= 0:
                eating = false
                target_plant = null

## 友方僵尸：右行出界移除，途中攻击普通（非友方）僵尸
func _process_ally(delta: float) -> void:
    position.x += speed * delta
    var main = get_tree().root.get_node("Main")
    var view_w: float = get_viewport().get_visible_rect().size.x
    if position.x >= view_w + 50:
        queue_free()
        return
    attack_timer += delta
    # 找同向（右侧）最近的普通僵尸并啃食
    if not eating:
        var target = _find_ally_target()
        if target:
            eating = true
            target_plant = target
            attack_timer = 0.0
    else:
        if not target_plant or not is_instance_valid(target_plant) or target_plant._dead:
            eating = false
            target_plant = null
            attack_timer = 0.0
            return
        if attack_timer >= attack_interval:
            attack_timer = 0.0
            target_plant.take_damage(attack_damage)
            var snd2 = get_node_or_null("/root/Sound")
            if snd2 != null and snd2.has_method("zombie_eat"):
                snd2.zombie_eat()

## 友方目标：同排、右侧、未死、非友方的普通僵尸
func _find_ally_target() -> Node:
    var zombies = get_tree().get_nodes_in_group("zombies")
    var best: Node = null
    var best_dist: float = 1e9
    for z in zombies:
        if z == self or z._dead or z.is_ally:
            continue
        if z.row_index != row_index:
            continue
        if z.position.x < position.x:
            continue
        var dist: float = z.position.x - position.x
        if dist < best_dist:
            best_dist = dist
            best = z
    return best

## 魅惑：转为友方（Plant.gd 的 _do_charm 调用本方法）
func set_charmed(ally: bool) -> void:
    is_ally = ally
    eating = false
    target_plant = null
    _sprite.modulate = Color(0.4, 0.7, 1.0)  # 蓝色标记魅惑状态
    queue_redraw()  # 魅惑状态变化后刷新光环

## 寒冰减速：factor 为速度倍率（0.5 = 半速），duration 秒（与浏览器 applySlow 对齐）
func apply_slow(factor: float, duration: float) -> void:
    slow_factor = factor
    slow_timer = duration
    _sprite.modulate = Color(0.6, 0.85, 1.0)  # 冰蓝标记减速状态
    queue_redraw()  # 减速状态变化后刷新覆盖

func _find_target_plant() -> Node:
    var plants = get_tree().get_nodes_in_group("plants")
    var closest: Node = null
    var closest_dist: float = 1e9
    for p in plants:
        if p.row == row_index and p.position.x < position.x:
            var dist = position.x - p.position.x
            if dist < closest_dist and dist <= attack_range:
                closest = p
                closest_dist = dist
    return closest

func take_damage(dmg: int) -> void:
    hp -= dmg
    # 读报僵尸首次被击后丢报加速（与浏览器版 newspaper 行为对齐）
    var _zt2 = get_node_or_null("/root/ZombieTypes")
    var _td2: Dictionary = _zt2.get_type(type_id) if _zt2 != null else {}
    if not _newspaper_hit and _td2.get("newspaper_behavior", false):
        _newspaper_hit = true
        _news_speed = float(_td2.get("speed_after_hit", 30.0))
        speed = _news_speed
    # Flash white on hit
    _sprite.modulate = Color(1, 1, 1, 1)
    _hit_flash_timer = 0.15
    queue_redraw()  # 血量变化后刷新血条
    if hp <= 0 and not _dead:
        _dead = true
        _death_timer = 0.0
        var snd3 = get_node_or_null("/root/Sound")
        if snd3 != null and snd3.has_method("zombie_die"):
            snd3.zombie_die()

## 是否被攻击致死（用于 Main 判断"击杀得分"，区别于过关清理 queue_free）
func is_killed() -> bool:
    return _dead

## 状态可视化：常驻血条 + 魅惑紫色光环/标识 + 减速蓝色覆盖（对齐浏览器 js/zombies.js）
func _draw() -> void:
    # 死亡时不绘制（精灵自行淡出）
    if _dead:
        return
    # 常驻血条：36×4，位于僵尸头顶上方（局部原点 = 僵尸中心，对齐浏览器 y-40）
    var bar_w := 36.0
    var bar_h := 4.0
    var bar_x := -bar_w / 2.0
    var bar_y := -40.0
    draw_rect(Rect2(bar_x, bar_y, bar_w, bar_h), Color(0, 0, 0, 0.5))
    var ratio: float = clampf(float(hp) / float(max_hp), 0.0, 1.0)
    var bar_col: Color = Color(0.3, 0.69, 0.31) if ratio > 0.5 else Color(0.96, 0.26, 0.21)
    draw_rect(Rect2(bar_x, bar_y, bar_w * ratio, bar_h), bar_col)
    # 减速蓝色覆盖（椭圆填充，居中于僵尸身体）
    if slow_timer > 0.0:
        _draw_ellipse(Vector2(0, 0), Vector2(20, 30), Color(0.31, 0.76, 0.97, 0.25), true)
    # 魅惑：紫色光环（椭圆描边）+ 头顶紫色圆环标识（替代 🌀 字形）
    if is_ally:
        _draw_ellipse(Vector2(0, 0), Vector2(22, 32), Color(0.61, 0.15, 0.69, 0.2), true)
        _draw_ellipse(Vector2(0, 0), Vector2(22, 32), Color(0.61, 0.15, 0.69, 0.5), false)
        draw_arc(Vector2(0, -52), 7.0, 0.0, TAU, 24, Color(0.8, 0.4, 0.9), 2.0)

## 绘制椭圆：filled=true 填充，false 描边
func _draw_ellipse(center: Vector2, radii: Vector2, col: Color, filled: bool) -> void:
    var pts := PackedVector2Array()
    var seg := 28
    for i in range(seg):
        var a: float = TAU * float(i) / float(seg)
        pts.append(center + Vector2(cos(a) * radii.x, sin(a) * radii.y))
    if filled:
        draw_colored_polygon(pts, col)
    else:
        var loop := pts.duplicate()
        loop.append(pts[0])
        draw_polyline(loop, col, 2.0)
