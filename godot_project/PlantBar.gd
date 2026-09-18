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
    for type_name in PlantTypes.get_all().keys():
        var card = preload("res://PlantCard.tscn").instantiate()
        card.set_plant_type(type_name)
        card.connect("card_selected", Callable(self, "_on_card_selected"))
        hbox.add_child(card)

func _on_card_selected(type_name: String) -> void:
    emit_signal("plant_selected", type_name)

func update_affordability(current_sun: int) -> void:
    var hbox = $HBoxContainer
    for child in hbox.get_children():
        if child is PlantCard:
            var cost = child.cost
            child.set_enabled(current_sun >= cost)