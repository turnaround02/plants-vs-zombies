extends Area2D

# How much sun this pickup gives when collected
@export var sun_amount: int = 25
# Lifetime before disappearing (seconds)
@export var lifetime: float = 12.0
# Fall speed (pixels per second) - positive Y is down in Godot 2D
@export var fall_speed: float = 100.0

var _timer: float = 0.0
var _sprite: Sprite2D
var _collision_shape: CollisionShape2D
var _remaining_fall: float = -1.0  # 剩余下落距离；<0 表示一直下落（天空阳光）

## 植物产出的阳光：快速短距离下落，到位置后停留一段时间（可点击收集）
func set_fall_behavior(fall_px: float, linger_seconds: float) -> void:
    fall_speed = 200.0
    _remaining_fall = fall_px
    lifetime = linger_seconds

func _ready() -> void:
    _timer = 0.0
    _sprite = get_node("Sprite")
    if not _sprite:
        push_error("Sun: Sprite child not found")
        return
    _collision_shape = get_node("CollisionShape")
    if not _collision_shape:
        push_error("Sun: CollisionShape child not found")
        return
    # Set collision shape radius to match collect radius (35px diameter -> radius 17.5)
    var circle_shape: CircleShape2D = CircleShape2D.new()
    circle_shape.radius = 17.5
    _collision_shape.shape = circle_shape
    
    # Generate a yellow circle texture
    var size: int = 32  # diameter
    # Godot 4: Image.create requires width, height, use_mipmaps, format
    var img := Image.create(size, size, false, Image.FORMAT_RGBA8)
    img.fill(Color(0, 0, 0, 0))  # transparent background
    var center := size / 2
    var radius := size / 2 - 2
    # Draw a filled circle
    for x in size:
        for y in size:
            var dx := x - center
            var dy := y - center
            if dx*dx + dy*dy <= radius*radius:
                img.set_pixel(x, y, Color(1.0, 0.84, 0.0, 1.0))  # yellow
    var tex := ImageTexture.create_from_image(img)
    _sprite.texture = tex
    # Center the sprite on its texture
    _sprite.offset = Vector2(size / 2, size / 2)
    # Set area2D to monitor mouse
    monitorable = true
    # Connect input event
    connect("input_event", Callable(self, "_on_input_event"))

func _on_input_event(viewport: Viewport, event: InputEvent, shape_idx: int) -> void:
    if event is InputEventMouseButton and event.pressed and event.button_index == MOUSE_BUTTON_LEFT:
        collect()

func _process(delta: float) -> void:
    _timer += delta
    if _timer >= lifetime:
        queue_free()
        return
    # Move down（植物产出的阳光有下落距离上限，到点后原地停留）
    if _remaining_fall >= 0.0:
        var step: float = fall_speed * delta
        _remaining_fall -= step
        position.y += min(step, maxf(_remaining_fall, 0.0))
    else:
        position.y += fall_speed * delta

# Called by the main game when the player clicks on this sun
func collect() -> void:
    var main: Node = get_tree().root.get_node("Main")
    if main and main.has_method("add_sun"):
        main.add_sun(sun_amount)
    queue_free()
