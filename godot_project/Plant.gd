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

# Reference to sprite for visual feedback
var _sprite: Sprite2D

func _ready() -> void:
    add_to_group("plants")
    if type_id == "":
        push_error("Plant type_id not set")
        return
    type = PlantTypes.get_type(type_id)
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
                if main:
                    main.add_sun(type.sun_amount)
        "shooter":
            fire_timer += delta
            if fire_timer >= type.fire_rate:
                fire_timer = 0.0
                # Check if there is a zombie in front within range
                var target = _get_target_zombie()
                if target:
                    var main = get_tree().root.get_node("Main")
                    if main:
                        main.shoot_projectile(row, position.x, type.damage)
        "wall":
            pass
        _:
            pass

func _make_placeholder() -> void:
    var img := Image.create(40, 40, false, Image.FORMAT_RGBA8)
    # Different colors for different plant types
    var color: Color = Color(0.3, 0.8, 0.3)  # default green
    match type.get("behavior", ""):
        "sunProducer":
            color = Color(1.0, 0.85, 0.0)  # yellow for sunflower
        "shooter":
            color = Color(0.2, 0.6, 0.2)  # dark green for shooter
        "wall":
            color = Color(0.6, 0.4, 0.2)  # brown for wall
    img.fill(color)
    _sprite.texture = ImageTexture.create_from_image(img)
    _sprite.offset = Vector2(20, 20)

func _get_target_zombie() -> Node:
    var main = get_tree().root.get_node("Main")
    if not main:
        return null
    var zombies = main.get_tree().get_nodes_in_group("zombies")
    var closest: Node = null
    var closest_dist: float = 1e9
    for z in zombies:
        if z.row_index == row and z.position.x > position.x:
            var dist = z.position.x - position.x
            if dist < closest_dist and dist <= type.get("range", 400):
                closest = z
                closest_dist = dist
    return closest
