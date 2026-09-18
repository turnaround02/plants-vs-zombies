extends Node2D

# How much sun this pickup gives when collected
@export var sun_amount: int = 25
# Lifetime before disappearing (seconds)
@export var lifetime: float = 12.0

var _timer: float = 0.0

func _ready() -> void:
    _timer = 0.0
    # Optional: add a visual (Sprite2D or AnimatedSprite2D) here
    pass

func _process(delta: float) -> void:
    _timer += delta
    if _timer >= lifetime:
        queue_free()
        pass

# Called by the main game when the player clicks on this sun
func collect() -> void:
    # Emit a signal or call back to main to add sun
    # For simplicity, we directly call a method on Main via get_tree().root.get_node("Main")
    var main: Node = get_tree().root.get_node("Main")
    if main and main.has_method("add_sun"):
        main.add_sun(sun_amount)
    queue_free()