extends Control

signal start_pressed
signal level_selected(level_id: int)

var _unlocked_level: int = 1

func _ready() -> void:
    $CenterContainer/Button.connect("pressed", Callable(self, "_on_button_pressed"))
    _build_level_select()

func _on_button_pressed() -> void:
    emit_signal("start_pressed")
    queue_free()

## 关卡选择面板：已解锁可选，未解锁置灰（与浏览器版 #level-select 对齐）
func _build_level_select() -> void:
    var progress = _load_unlocked_level()
    _unlocked_level = progress
    var panel := Panel.new()
    panel.name = "LevelSelectPanel"
    panel.position = Vector2(330, 250)
    panel.size = Vector2(300, 200)
    add_child(panel)
    var title := Label.new()
    title.text = "选择关卡"
    title.position = Vector2(20, 10)
    panel.add_child(title)
    for i in range(1, Levels.all_ids().size() + 1):
        var btn := Button.new()
        btn.text = "第 " + str(i) + " 关"
        var row_idx: int = (i - 1) / 3
        var col_idx: int = (i - 1) % 3
        btn.position = Vector2(20 + col_idx * 90, 50 + row_idx * 50)
        btn.custom_minimum_size = Vector2(80, 40)
        var locked: bool = i > _unlocked_level
        btn.disabled = locked
        btn.modulate = Color(0.5, 0.5, 0.5, 1.0) if locked else Color(1.0, 1.0, 1.0, 1.0)
        btn.pressed.connect(_on_level_pressed.bind(i))
        panel.add_child(btn)

func _on_level_pressed(level_id: int) -> void:
    if level_id <= _unlocked_level:
        emit_signal("level_selected", level_id)
        queue_free()

func _load_unlocked_level() -> int:
    var save_path := "user://save.cfg"
    if not FileAccess.file_exists(save_path):
        return 1
    var file := FileAccess.open(save_path, FileAccess.READ)
    if file:
        var data = JSON.parse_string(file.get_as_text())
        file.close()
        if data:
            return int(data.get("unlocked_level", 1))
    return 1
