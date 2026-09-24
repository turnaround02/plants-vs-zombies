extends Button

signal card_selected(type_name)

var plant_type_name: String = ""
var cost: int = 0
var _affordable: bool = true
var _on_cooldown: bool = false
var _cd_label: Label

func _ready() -> void:
    if plant_type_name != "":
        _update_display()
    pressed.connect(Callable(self, "_on_pressed"))
    # 冷却倒计时数字覆盖层（居中，不拦截点击）
    _cd_label = Label.new()
    _cd_label.anchors_preset = Control.PRESET_FULL_RECT
    _cd_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
    _cd_label.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
    _cd_label.add_theme_font_size_override("font_size", 32)
    _cd_label.mouse_filter = Control.MOUSE_FILTER_IGNORE
    _cd_label.visible = false
    add_child(_cd_label)

func set_plant_type(name: String) -> void:
    plant_type_name = name
    if is_node_ready():
        _update_display()

func set_enabled(enabled: bool) -> void:
    _affordable = enabled
    _refresh_visual()

## 设置冷却显示：remaining_ms 剩余毫秒，total_ms 总毫秒
func set_cooldown(remaining_ms: float, total_ms: float) -> void:
    _on_cooldown = remaining_ms > 0.0
    if _cd_label:
        _cd_label.visible = _on_cooldown
        if _on_cooldown:
            _cd_label.text = str(int(ceil(remaining_ms / 1000.0)))
    _refresh_visual()

## 根据「买得起」与「冷却中」合并刷新变暗与禁用状态
func _refresh_visual() -> void:
    var dim: bool = (not _affordable) or _on_cooldown
    disabled = dim
    modulate = Color(1, 1, 1, 0.5 if dim else 1.0)

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