extends Control

signal start_pressed

func _ready() -> void:
    $CenterContainer/Button.connect("pressed", Callable(self, "_on_button_pressed"))

func _on_button_pressed() -> void:
    emit_signal("start_pressed")
    queue_free()