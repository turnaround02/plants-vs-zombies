extends Node2D

@export var speed: float = 300.0   # px/s leftward
var damage: int = 2                 # increased from 1
var row: int = 0

var _sprite: Sprite2D
var _active: bool = true

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
    position.x -= speed * delta
    # Off screen check
    if position.x < -30:
        queue_free()
        return
    # Check collision with zombies in the same row
    for z in get_tree().get_nodes_in_group("zombies"):
        if z.row_index == row:
            var dist = abs(z.position.x - position.x)
            if dist < 25:  # collision radius
                z.take_damage(damage)
                _active = false
                queue_free()
                return