extends Node2D

@export var speed: float = 300.0   # px/s toward zombies (+x)
var damage: int = 20
var row: int = 0
var slow_factor: float = 0.0        # 命中减速倍率（0 = 不减速）
var slow_duration: float = 0.0      # 减速持续秒数
var penetrate: bool = false         # 是否穿透（命中后不销毁，一弹多杀）
var _hit_zombies: Array = []        # 已命中的僵尸（穿透弹避免重复伤害同一目标）

var _sprite: Sprite2D
var _active: bool = true
const VIEWPORT_RIGHT_LIMIT: float = 1010.0

func _ready() -> void:
    add_to_group("projectiles")
    _sprite = get_node("Sprite")
    _make_placeholder()

func _make_placeholder() -> void:
    var img := Image.create(12, 12, false, Image.FORMAT_RGBA8)
    img.fill(Color(0.3, 0.7, 0.2, 1.0))  # green pea
    _sprite.texture = ImageTexture.create_from_image(img)
    _sprite.offset = Vector2(6, 6)

func _process(delta: float) -> void:
    if not _active:
        return
    position.x += speed * delta
    var main = get_tree().get_first_node_in_group("main")
    if main != null:
        for z in main.get_zombies():
            if z.get("row_index") == row and not z.get("_dead") and not _hit_zombies.has(z):
                var dist = abs(z.position.x - position.x)
                if dist < 25:  # collision radius
                    z.take_damage(damage)
                    if slow_factor > 0.0 and z.has_method("apply_slow"):
                        z.apply_slow(slow_factor, slow_duration)
                    _hit_zombies.append(z)
                    if not penetrate:
                        queue_free()
                        return
    if position.x > VIEWPORT_RIGHT_LIMIT:
        queue_free()