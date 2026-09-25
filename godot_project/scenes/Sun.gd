extends Area2D

# How much sun this pickup gives when collected
@export var sun_amount: int = 25
# Lifetime before disappearing (seconds)
@export var lifetime: float = 12.0
# Fall speed (pixels per second) - positive Y is down in Godot 2D
@export var fall_speed: float = 100.0
# 月亮模式：夜间关卡天空掉落的收集物（蓝色弯月，收集效果与太阳相同 +sun_amount）
@export var is_moon: bool = false

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
    
    # Generate the texture (yellow sun or blue crescent moon based on is_moon)
    var tex := _generate_texture()
    _sprite.texture = tex
    # Center the sprite on its texture
    _sprite.offset = Vector2(16, 16)
    # Set area2D to monitor mouse
    monitorable = true
    # Connect input event
    connect("input_event", Callable(self, "_on_input_event"))

func _generate_texture() -> Texture2D:
    # 月亮：蓝色弯月（亮圆 + 偏移暗圆裁缺口，与浏览器版 renderSun 的 moon 分支一致）
    if is_moon:
        var size: int = 32
        var img := Image.create(size, size, false, Image.FORMAT_RGBA8)
        img.fill(Color(0, 0, 0, 0))
        var center := size / 2
        var radius := size / 2 - 2
        for x in size:
            for y in size:
                var dx := x - center
                var dy := y - center
                if dx * dx + dy * dy <= radius * radius:
                    img.set_pixel(x, y, Color(0.62, 0.77, 1.0, 1.0))  # 浅蓝弯月
        # 用偏移暗圆裁出月牙缺口（暗色近似夜空背景 #0d1b2a）
        var cut_cx := int(center + radius * 0.55)
        var cut_cy := int(center - radius * 0.25)
        var cut_r := int(radius * 0.9)
        for x in range(maxi(0, cut_cx - cut_r), mini(size, cut_cx + cut_r + 1)):
            for y in range(maxi(0, cut_cy - cut_r), mini(size, cut_cy + cut_r + 1)):
                var dx := x - cut_cx
                var dy := y - cut_cy
                if dx * dx + dy * dy <= cut_r * cut_r:
                    img.set_pixel(x, y, Color(0.05, 0.10, 0.16, 0.0))  # 透明缺口
        return ImageTexture.create_from_image(img)

    # 太阳：黄色圆（原逻辑）
    var sz: int = 32
    var img2 := Image.create(sz, sz, false, Image.FORMAT_RGBA8)
    img2.fill(Color(0, 0, 0, 0))
    var c2 := sz / 2
    var r2 := sz / 2 - 2
    for x in sz:
        for y in sz:
            var dx := x - c2
            var dy := y - c2
            if dx * dx + dy * dy <= r2 * r2:
                img2.set_pixel(x, y, Color(1.0, 0.84, 0.0, 1.0))  # yellow
    return ImageTexture.create_from_image(img2)

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
    var snd = get_node_or_null("/root/Sound")
    if snd != null and snd.has_method("collect_sun"):
        snd.collect_sun()
    queue_free()
