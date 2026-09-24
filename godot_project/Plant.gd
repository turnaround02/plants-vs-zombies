extends Node2D

signal placed(type_id)

# Exported so we can set from Main
@export var type_id: String = ""
var type: Dictionary
var hp: float
var max_hp: float
var row: int = 0
var col: int = 0
var alive: bool = true

# Timers
var sun_timer: float = 0.0
var fire_timer: float = 0.0
var _hit_flash_timer: float = 0.0
# 炸弹类（cherrybomb/explosiveShroom）的引信计时
var fuse_timer: float = 0.0
var _exploded: bool = false

# Reference to sprite for visual feedback
var _sprite: Sprite2D

func _ready() -> void:
    add_to_group("plants")
    if type_id == "":
        push_error("Plant type_id not set")
        return
    var _pt = get_node_or_null("/root/PlantTypes")
    type = _pt.get_type(type_id) if _pt else {}
    if type.is_empty():
        push_error("Unknown plant type: " + type_id)
        return
    hp = type.hp
    max_hp = type.hp
    _sprite = get_node_or_null("Sprite")
    if _sprite:
        _make_placeholder()
    # Setup based on behavior
    match type.get("behavior", ""):
        "sunProducer":
            pass
        "shooter":
            pass
        "wall":
            pass
        "bomb":
            # 炸弹类：开始引信倒计时，到时后爆炸并消失
            fuse_timer = 0.0
        "charm":
            pass
        _:
            pass

func take_damage(dmg: float) -> void:
    hp -= dmg
    # Flash red on hit
    if _sprite:
        _sprite.modulate = Color(1, 0.2, 0.2, 1)
        _hit_flash_timer = 0.15
    if hp <= 0:
        alive = false
        queue_free()

func _draw() -> void:
    # Draw HP bar if damaged
    if hp < max_hp:
        var bar_width := 36.0
        var bar_height := 4.0
        var bar_x := position.x - bar_width / 2
        var bar_y := position.y - 30.0
        # Background
        draw_rect(Rect2(bar_x, bar_y, bar_width, bar_height), Color(0.2, 0.2, 0.2, 0.8))
        # Health fill
        var health_width := bar_width * (hp / max_hp)
        var health_color = Color(0.3, 0.8, 0.3) if hp / max_hp > 0.5 else Color(0.8, 0.3, 0.3)
        draw_rect(Rect2(bar_x, bar_y, health_width, bar_height), health_color)

func _process(delta: float) -> void:
    if not alive:
        return
    # Reset hit flash
    if _hit_flash_timer > 0:
        _hit_flash_timer -= delta
        if _hit_flash_timer <= 0 and _sprite:
            _sprite.modulate = Color(1, 1, 1, 1)
    
    match type.get("behavior", ""):
        "sunProducer":
            sun_timer += delta
            if sun_timer >= type.sun_produce_time:
                sun_timer = 0.0
                var main = get_tree().root.get_node("Main")
                if main and main.has_method("spawn_sun_at"):
                    main.spawn_sun_at(position, int(type.get("sun_amount", 25)))
                else:
                    main.add_sun(int(type.get("sun_amount", 25))) if main else null
        "shooter":
            fire_timer += delta
            if fire_timer >= type.fire_rate:
                fire_timer = 0.0
                # 双射豌豆（dualRow）：同时攻击本行与相邻行
                var rows_to_shoot: Array[int] = [row]
                if type.get("dual_row", false):
                    var adjacent = row + 1
                    if adjacent < 5:  # 行数上限（5 行）
                        rows_to_shoot.append(adjacent)
                # 检查本行范围内是否有僵尸，有则对所有目标行发射
                var target = _get_target_zombie()
                if target:
                    var main = get_tree().root.get_node("Main")
                    if main:
                        var shots: int = int(type.get("shots_per_fire", 1))
                        var slow_f: float = float(type.get("slow_factor", 0.0))
                        var slow_d: float = float(type.get("slow_duration", 0.0))
                        var pen: bool = bool(type.get("penetrate", false))
                        for r in rows_to_shoot:
                            for _i in range(shots):
                                main.shoot_projectile(r, position.x + 20.0, type.damage, slow_f, slow_d, pen)
                        var snd = get_node_or_null("/root/Sound")
                        if snd != null and snd.has_method("shoot"):
                            snd.shoot()
        "wall":
            pass
        "bomb":
            # 引信倒计时，到时后对周围大范围造成伤害并消失
            if _exploded:
                return
            fuse_timer += delta
            var fuse_time: float = type.get("fuse_time", 1.0)
            if fuse_timer >= fuse_time:
                _exploded = true
                _do_explosion()
        "charm":
            # 魅惑菇：与僵尸接触时魅惑（转换为友方），随后消失
            _do_charm()
        _:
            pass

# 爆炸：对 blast_radius 范围内的所有僵尸造成 damage
func _do_explosion() -> void:
    var damage: int = type.get("damage", 0)
    var blast_radius: int = type.get("blast_radius", 120)
    var main = get_tree().get_first_node_in_group("main")
    if main == null:
        queue_free()
        return
    for z in main.get_zombies():
        if z.get("_dead"):
            continue
        var dist = z.position.distance_to(position)
        if dist <= blast_radius:
            z.take_damage(damage)
    var snd = get_node_or_null("/root/Sound")
    if snd != null and snd.has_method("explosion"):
        snd.explosion()
    queue_free()

# 魅惑：找到相邻最近的一只僵尸并将其转换为友方（向右行走）
func _do_charm() -> void:
    var main = get_tree().get_first_node_in_group("main")
    if main == null:
        return
    var charm_radius: float = 40.0
    var best: Node = null
    var best_dist: float = 1e9
    for z in main.get_zombies():
        if z.get("_dead") or z.get("is_ally"):
            continue
        if z.get("row_index") != row:
            continue
        var dist: float = z.position.distance_to(position)
        if dist <= charm_radius and dist < best_dist:
            best_dist = dist
            best = z
    if best != null:
        # 魅惑：让僵尸转为友方（向右侧行走）
        if best.has_method("set_charmed"):
            best.set_charmed(true)
        elif best.has_method("charm"):
            best.charm()
        var snd = get_node_or_null("/root/Sound")
        if snd != null and snd.has_method("zombie_die"):
            snd.zombie_die()
    queue_free()

func _make_placeholder() -> void:
    _sprite.texture = _build_plant_texture(type)

## 程序化绘制植物（底座 + 行为图标），保证草地上的植物可见且与卡片语义一致
static func _build_plant_texture(type: Dictionary) -> ImageTexture:
    var W := 40
    var H := 40
    var img := Image.create(W, H, false, Image.FORMAT_RGBA8)
    img.fill(Color(0, 0, 0, 0))
    # 底座圆角块（不同行为不同色）
    var base := Color(0.3, 0.75, 0.35)
    match type.get("behavior", ""):
        "sunProducer": base = Color(1.0, 0.85, 0.1)
        "shooter": base = Color(0.25, 0.65, 0.3)
        "wall": base = Color(0.7, 0.5, 0.25)
        "bomb": base = Color(0.9, 0.25, 0.25)
        "charm": base = Color(0.8, 0.4, 0.9)
    _plant_fill_rounded(img, 4, 14, 32, 22, 6, base)
    # 顶部"叶子/花瓣"装饰
    _plant_fill_rounded(img, 10, 4, 20, 14, 5, base.lightened(0.25))
    # 眼睛点缀
    _plant_rect(img, 12, 22, 4, 4, Color(0.1, 0.1, 0.1))
    _plant_rect(img, 24, 22, 4, 4, Color(0.1, 0.1, 0.1))
    var tex := ImageTexture.create_from_image(img)
    return tex

## 像素矩形填充（静态，供 _build_plant_texture 调用）
static func _plant_rect(img: Image, x: int, y: int, w: int, h: int, col: Color) -> void:
    for py in range(y, y + h):
        for px in range(x, x + w):
            if px >= 0 and py >= 0 and px < img.get_width() and py < img.get_height():
                img.set_pixel(px, py, col)

## 圆角矩形填充（静态，供 _build_plant_texture 调用）
static func _plant_fill_rounded(img: Image, x: int, y: int, w: int, h: int, r: int, col: Color) -> void:
    for py in range(y, y + h):
        for px in range(x, x + w):
            if px < 0 or py < 0 or px >= img.get_width() or py >= img.get_height():
                continue
            var cdx := 0
            var cdy := 0
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

func _get_target_zombie() -> Node:
    var main = get_tree().get_first_node_in_group("main")
    if main == null:
        return null
    # 取本行射程内距离最近的活僵尸（与浏览器版 getFirstZombieInRow 语义对齐，修复"返回行内第一只"的截断 bug）
    var shot_range: float = type.get("shot_range", 400.0)
    var best: Node = null
    var best_dist: float = 1e9
    for z in main.get_zombies():
        if z.get("row_index") != row or z.get("_dead"):
            continue
        var dist: float = z.position.distance_to(position)
        if dist > shot_range:
            continue
        if dist < best_dist:
            best_dist = dist
            best = z
    return best
