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

## 卡片冷却状态：type_name -> 剩余毫秒
var card_cooldowns: Dictionary = {}

## 放置植物后启动该卡片的冷却（毫秒，来自 PlantTypes.cooldown）
func start_cooldown(type_name: String) -> void:
    var pt = get_node_or_null("/root/PlantTypes")
    var data = pt.get_type(type_name) if pt else {}
    var cd: int = int(data.get("cooldown", 0))
    if cd > 0:
        card_cooldowns[type_name] = float(cd)

## 每帧推进冷却（暂停时不调用即冻结，与浏览器一致）
func update_cooldowns(delta_ms: float) -> void:
    if card_cooldowns.is_empty():
        return
    var hbox = $HBoxContainer
    for type_name in card_cooldowns.keys():
        var remaining: float = card_cooldowns[type_name] - delta_ms
        if remaining <= 0.0:
            card_cooldowns.erase(type_name)
            _apply_card_cooldown(hbox, type_name, 0.0, 0.0)
        else:
            card_cooldowns[type_name] = remaining
            var pt = get_node_or_null("/root/PlantTypes")
            var data = pt.get_type(type_name) if pt else {}
            _apply_card_cooldown(hbox, type_name, remaining, float(data.get("cooldown", 0)))

## 将冷却剩余时间写到对应卡片上
func _apply_card_cooldown(hbox: Node, type_name: String, remaining_ms: float, total_ms: float) -> void:
    for child in hbox.get_children():
        if child.get("plant_type_name") == type_name and child.has_method("set_cooldown"):
            child.set_cooldown(remaining_ms, total_ms)

## 查询某卡片是否处于冷却中（用于点击前置拦截）
func is_on_cooldown(type_name: String) -> bool:
    return card_cooldowns.has(type_name) and card_cooldowns[type_name] > 0.0

func update_affordability(current_sun: int) -> void:
    var hbox = $HBoxContainer
    for child in hbox.get_children():
        if "PlantCard" in child.name or child.has_method("set_enabled"):
            var cost = child.cost
            child.set_enabled(current_sun >= cost)