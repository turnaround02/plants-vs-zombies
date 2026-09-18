extends Button

signal card_selected(type_name)

var plant_type_name: String = ""
var cost: int = 0

func _ready() -> void:
    if plant_type_name != "":
        _update_display()
    pressed.connect(Callable(self, "_on_pressed"))

func set_plant_type(name: String) -> void:
    plant_type_name = name
    if is_node_ready():
        _update_display()

func set_enabled(enabled: bool) -> void:
    disabled = not enabled
    # Also modulate opacity for visual feedback
    modulate = Color(1, 1, 1, 1.0 if enabled else 0.5)

func _update_display() -> void:
    if plant_type_name == "":
        return
    var data = PlantTypes.get_type(plant_type_name)
    if data.is_empty():
        return
    cost = data.get("cost", 0)
    text = "%s\n%d" % [data.get("icon", "🌱"), cost]

func _on_pressed() -> void:
    emit_signal("card_selected", plant_type_name)