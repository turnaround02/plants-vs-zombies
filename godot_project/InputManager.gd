extends Node

# InputManager.gd
# Singleton to abstract input handling.
# Attach to an Autoload (Project Settings -> AutoLoad) with name "Input".

var _mouse_position: Vector2
var _mouse_button_pressed: Array[bool] = [false, false, false] # left, middle, right

func _input(event: InputEvent) -> void:
    if event is InputEventMouseMotion:
        _mouse_position = event.position
    elif event is InputEventMouseButton:
        _mouse_button_pressed[event.button_index - 1] = event.pressed
    elif event is InputEventScreenTouch:
        # Treat touch as mouse left button for simplicity
        _mouse_position = event.position
        _mouse_button_pressed[0] = event.pressed

func get_mouse_position() -> Vector2:
    return _mouse_position

func is_mouse_button_pressed(button: int) -> bool:
    # button: 1=left, 2=middle, 3=right
    if button < 1 or button > 3:
        return false
    return _mouse_button_pressed[button - 1]

func get_world_2d_position(camera: Camera2D) -> Vector2:
    if camera:
        return camera.get_screen_to_world_2d(get_mouse_position())
    return get_mouse_position()