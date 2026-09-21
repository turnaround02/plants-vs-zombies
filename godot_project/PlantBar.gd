extends PanelContainer

signal plant_selected(plant_type_name)

func _ready() -> void:
    # Wait until children are ready
    call_deferred("_populate")

func _populate() -> void:
    var hbox = $HBoxContainer
    # Clear existing
    for c in hbox.get_children():
        c.queue_free()
    # Create plant cards
    var pt = get_node_or_null("/root/PlantTypes")
    if pt == null: return
    for type_name in pt.get_all().keys():
        var card = preload("res://PlantCard.tscn").instantiate()
        card.set_plant_type(type_name)
        card.connect("card_selected", Callable(self, "_on_card_selected"))
        hbox.add_child(card)

func _on_card_selected(type_name: String) -> void:
    emit_signal("plant_selected", type_name)

## 清除卡片上的选中高亮（取消选择时调用）
func deselect_all() -> void:
    var hbox = $HBoxContainer
    for child in hbox.get_children():
        if child.has_method("clear_highlight"):
            child.clear_highlight()

func update_affordability(current_sun: int) -> void:
    var hbox = $HBoxContainer
    for child in hbox.get_children():
        if "PlantCard" in child.name or child.has_method("set_enabled"):
            var cost = child.cost
            child.set_enabled(current_sun >= cost)