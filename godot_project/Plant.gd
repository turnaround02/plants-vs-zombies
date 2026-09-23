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
                        for r in rows_to_shoot:
                            main.shoot_projectile(r, position.x + 20.0, type.damage)
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
    queue_free()

func _make_placeholder() -> void:
    _sprite.texture = _build_emoji_texture(type.get("icon", "🌱"), 48)

## 用默认主题字体（含系统 emoji 回退）把 emoji 渲染成贴图，保证与卡片图标一致
static func _build_emoji_texture(emoji: String, size: int) -> ImageTexture:
    var font := ThemeDB.fallback_font
    var img := Image.create_empty(size, size, false, Image.FORMAT_RGBA8)
    var pos := Vector2(size * 0.5, size * 0.5 + font.get_height() * 0.35)
    font.draw_string(img, pos, emoji, HORIZONTAL_ALIGNMENT_CENTER, -1, size, Color.WHITE)
    return ImageTexture.create_from_image(img)

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
