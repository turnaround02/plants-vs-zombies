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

## 关卡选择面板：全部关卡默认解锁（无需通关解锁）；已通关显示 ★ 与最佳分（与浏览器版 buildLevelGrid 对齐）
func _build_level_select() -> void:
    var progress := _load_progress_full()
    var best_scores: Dictionary = progress.get("best_scores", {})
    var panel := Panel.new()
    panel.name = "LevelSelectPanel"
    panel.position = Vector2(330, 250)
    panel.size = Vector2(300, 200)
    add_child(panel)
    var title := Label.new()
    title.text = "选择关卡"
    title.position = Vector2(20, 10)
    panel.add_child(title)
    var _lv = get_node_or_null("/root/Levels")
    var _total: int = _lv.all_ids().size() if _lv else 0
    # 全关卡默认解锁：_unlocked_level 恒为总关卡数（存档 unlocked_level 字段仅为向后兼容保留）
    _unlocked_level = _total
    for i in range(1, _total + 1):
        var btn := Button.new()
        var best: Dictionary = best_scores.get(i, {})
        var best_score: int = int(best.get("score", 0)) if best is Dictionary else 0
        var best_stars: int = int(best.get("stars", 0)) if best is Dictionary else 0
        var suffix := ""
        if best_score > 0:
            suffix = _stars_display(best_stars) + " 最佳 " + str(best_score)
        btn.text = ("第 " + str(i) + " 关" + ("  " + suffix if suffix != "" else ""))
        var row_idx: int = (i - 1) / 3
        var col_idx: int = (i - 1) % 3
        btn.position = Vector2(20 + col_idx * 90, 50 + row_idx * 50)
        btn.custom_minimum_size = Vector2(80, 40)
        # 全关卡默认解锁：所有按钮可点（locked 恒为 false，保留字段以便未来恢复进度门控）
        var locked: bool = i > _unlocked_level
        btn.disabled = locked
        btn.modulate = Color(0.5, 0.5, 0.5, 1.0) if locked else Color(1.0, 1.0, 1.0, 1.0)
        btn.pressed.connect(_on_level_pressed.bind(i))
        panel.add_child(btn)

## 星级显示（0-3 星）
func _stars_display(n: int) -> String:
    var s := ""
    for i in 3:
        s += "★" if i < n else "☆"
    return s

func _on_level_pressed(level_id: int) -> void:
    if level_id <= _unlocked_level:
        emit_signal("level_selected", level_id)
        queue_free()

## 读取完整存档（unlocked_level + best_scores），与浏览器 SaveStore.getProgress 字段对齐
func _load_progress_full() -> Dictionary:
    var save_path := "user://save.cfg"
    if not FileAccess.file_exists(save_path):
        return {"unlocked_level": 1, "best_scores": {}}
    var file := FileAccess.open(save_path, FileAccess.READ)
    if file:
        var data = JSON.parse_string(file.get_as_text())
        file.close()
        if data is Dictionary:
            data["unlocked_level"] = int(data.get("unlocked_level", 1))
            data["best_scores"] = data.get("best_scores", {})
            return data
    return {"unlocked_level": 1, "best_scores": {}}
