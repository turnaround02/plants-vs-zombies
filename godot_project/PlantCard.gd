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
    var pt = get_node_or_null("/root/PlantTypes")
    var data = pt.get_type(plant_type_name) if pt else {}
    if data.is_empty():
        return
    cost = data.get("cost", 0)
    text = "%s\n%d" % [data.get("icon", "🌱"), cost]

func _on_pressed() -> void:
    emit_signal("card_selected", plant_type_name)
    highlight()

func highlight() -> void:
    add_theme_stylebox_override("normal", _build_style(Color(0.35, 0.55, 0.25, 1)))
    add_theme_stylebox_override("hover", _build_style(Color(0.4, 0.62, 0.28, 1)))

func clear_highlight() -> void:
    add_theme_stylebox_override("normal", _build_style(Color(0.16, 0.2, 0.14, 1)))
    add_theme_stylebox_override("hover", _build_style(Color(0.22, 0.28, 0.19, 1)))

func _build_style(bg: Color) -> StyleBoxFlat:
    var sb := StyleBoxFlat.new()
    sb.bg_color = bg
    sb.set_corner_radius_all(6)
    return sb