extends Node2D

# Signal to update UI (optional)
signal sun_changed(amount)
signal wave_changed(wave_info)   # dict: {current, total, state}

# Exported for tuning
@export var sun_start: int = 150
@export var sun_fall_interval: float = 7.0
@export var sun_fall_amount: int = 25

var sun: int
var sun_fall_timer: float

# Reference to HUD label (we'll get it in _ready)
var hud_sun_label: Label
var hud_wave_label: Label
# Reference to Grid node
var grid: Node2D
# Reference to PlantBar node
var plant_bar: PanelContainer
# Reference to Menu node
var menu: Control

# Game state
var game_started: bool = false

# Currently selected plant type name ("" means none)
var selected_plant_type: String = ""

# Dictionary to track occupied cells: key = "x,y", value = Node instance
var occupied_cells: Dictionary = {}

# Wave system
var wave_number: int = 1
var zombies_per_wave: int = 3  # base zombies per wave
var zombies_to_spawn: int = 0
var zombies_spawned: int = 0
var zombies_alive: int = 0
var zombie_spawn_timer: float
var zombie_spawn_interval: float = 1.5  # seconds between spawns
var wave_state: int = 0  # 0 = preparing wave, 1 = spawning, 2 = wave complete waiting
var wave_prepare_time: float = 2.0  # seconds to show wave number before spawning
var wave_prepare_timer: float = 0.0

func _ready() -> void:
    add_to_group("main")
    sun = sun_start
    sun_fall_timer = 0.0
    # Get HUD labels
    var hud_node: Node = get_node("HUD")
    if hud_node:
        hud_sun_label = hud_node.get_node("SunLabel")
        hud_wave_label = hud_node.get_node("WaveLabel")
        if hud_sun_label:
            hud_sun_label.text = "Sun: " + str(sun)
        else:
            push_error("Could not find SunLabel in HUD")
        if hud_wave_label:
            hud_wave_label.text = "Wave: " + str(wave_number)
        else:
            push_error("Could not find WaveLabel in HUD")
    else:
        push_error("Could not find HUD node")
    # Get Grid
    grid = get_node("Grid")
    if not grid:
        push_error("Could not find Grid node")
    # Get PlantBar and connect signal
    plant_bar = get_node("PlantUI/PlantBar")
    if not plant_bar:
        push_error("Could not find PlantBar node")
    else:
        plant_bar.connect("plant_selected", Callable(self, "_on_plant_selected"))
    # Get Menu and connect start signal
    menu = get_node("MenuUI/Menu")
    if not menu:
        push_error("Could not find Menu node")
    else:
        menu.connect("start_pressed", Callable(self, "_on_start_pressed"))
    # Connect sun_changed signal to update label
    connect("sun_changed", Callable(self, "_on_sun_changed"))
    # Emit initial sun change (will trigger the callback)
    emit_signal("sun_changed", sun)
    if plant_bar:
        plant_bar.update_affordability(sun)
    # Initialize wave system
    _reset_wave_state()
    # Start first wave after a short delay
    call_deferred("_start_wave_prepare")

func _on_start_pressed() -> void:
    game_started = true
    print("Game started!")

func _on_plant_selected(type_name: String) -> void:
    selected_plant_type = type_name
    print("Selected plant:", type_name)

func _on_sun_changed(amount: int) -> void:
    if hud_sun_label:
        hud_sun_label.text = "Sun: " + str(amount)
    else:
        push_error("HUD sun label not found")
    if plant_bar:
        plant_bar.update_affordability(sun)

func _process(delta: float) -> void:
    if not game_started:
        return
    sun_fall_timer += delta
    if sun_fall_timer >= sun_fall_interval:
        sun_fall_timer = 0.0
        spawn_sun_from_sky()
    _update_wave(delta)

func spawn_sun_from_sky() -> void:
    var x: float = randf() * size.x
    var sun_instance: Node2D = preload("res://scenes/Sun.tscn").instantiate()
    sun_instance.position = Vector2(x, -20)
    sun_instance.sun_amount = sun_fall_amount
    add_child(sun_instance)
    sun_instance.add_to_group("suns")

func add_sun(amount: int) -> void:
    sun += amount
    emit_signal("sun_changed", sun)

func _unhandled_input(event: InputEvent) -> void:
    if not game_started:
        return
    if event is InputEventMouseButton and event.pressed:
        if event.button_index == MOUSE_BUTTON_RIGHT:
            selected_plant_type = ""
            print("Selection cleared")
            return
        # proceed for left button
        if event.button_index != MOUSE_BUTTON_LEFT:
            return
        # handle left button
    if event is InputEventMouseButton and event.pressed and event.button_index == MOUSE_BUTTON_LEFT:
        var world_pos: Vector2 = Input.get_world_2d_position(get_viewport().get_camera_2d())
        print("Left click at world:", world_pos)
        if selected_plant_type != "" and grid:
            var grid_coord: Vector2 = grid.world_to_grid(world_pos)
            if grid_coord.x >= 0 and grid_coord.y >= 0:
                _try_place_plant(grid_coord.x, grid_coord.y)

func _try_place_plant(x: int, y: int) -> void:
    var key: String = str(x) + "," + str(y)
    if occupied_cells.has(key):
        print("Cell already occupied")
        return
    var plant_data = PlantTypes.get_type(selected_plant_type)
    if plant_data.is_empty():
        print("Invalid plant type:", selected_plant_type)
        return
    var cost: int = plant_data.get("cost", 0)
    if sun < cost:
        print("Not enough sun! need ", cost, " have ", sun)
        return
    # Deduct sun
    sun -= cost
    emit_signal("sun_changed", sun)
    # Place actual plant
    var plant_scene = preload("res://Plant.tscn")
    var plant_instance = plant_scene.instantiate()
    plant_instance.type_id = selected_plant_type
    plant_instance.row = int(y)
    plant_instance.col = int(x)
    var pos = grid.grid_to_world(Vector2(x, y))
    plant_instance.position = pos
    add_child(plant_instance)
    occupied_cells[key] = plant_instance
    # Reset selected
    selected_plant_type = ""
    # Connect plant exiting signal to clean up occupied_cells
    plant_instance.connect("tree_exiting", Callable(self, "_on_plant_exited", key))

func _reset_wave_state() -> void:
    wave_number = 1
    zombies_per_wave = 3
    zombies_to_spawn = 0
    zombies_spawned = 0
    zombies_alive = 0
    zombie_spawn_timer = 0.0
    zombie_spawn_interval = 1.5
    wave_state = 0
    wave_prepare_timer = 0.0

func _start_wave_prepare() -> void:
    wave_state = 0  # preparing
    wave_prepare_timer = 0.0
    zombies_to_spawn = zombies_per_wave + (wave_number - 1)  # increase slightly each wave
    zombies_spawned = 0
    zombies_alive = 0
    zombie_spawn_timer = 0.0
    print("Preparing wave ", wave_number, ": ", zombies_to_spawn, " zombies to spawn")

func _update_wave(delta: float) -> void:
    if wave_state == 0:  # preparing
        wave_prepare_timer += delta
        if wave_prepare_timer >= wave_prepare_time:
            wave_state = 1  # spawning
            zombie_spawn_timer = 0.0
            print("Wave ", wave_number, " spawning started")
    elif wave_state == 1:  # spawning
        zombie_spawn_timer += delta
        if zombie_spawn_timer >= zombie_spawn_interval and zombies_spawned < zombies_to_spawn:
            zombie_spawn_timer = 0.0
            spawn_zombie()
            zombies_spawned += 1
        # Check if all zombies spawned and none alive
        if zombies_spawned >= zombies_to_spawn and zombies_alive == 0:
            wave_state = 2  # wave complete, waiting
            wave_prepare_timer = 0.0
            print("Wave ", wave_number, " complete")
    elif wave_state == 2:  # waiting before next wave
        wave_prepare_timer += delta
        if wave_prepare_timer >= wave_prepare_time:
            wave_number += 1
            zombies_per_wave = 3 + int((wave_number - 1) / 2)  # increase slowly
            _start_wave_prepare()

func spawn_zombie() -> void:
    var zombie_scene = preload("res://Zombie.tscn")
    var zombie_instance = zombie_scene.instantiate()
    var row = randi() % 5  # 0-4
    zombie_instance.row_index = row
    var start_x = size.x + 30
    var y = grid.grid_to_world(Vector2(0, row)).y - grid.cell_height / 2
    zombie_instance.position = Vector2(start_x, y)
    add_child(zombie_instance)
    zombies_alive += 1
    zombie_instance.connect("tree_exiting", Callable(self, "_on_zombie_exited"))

func _on_zombie_exited() -> void:
    zombies_alive -= 1
    # If all zombies have been spawned and none alive, we will detect in _update_wave

func zombie_reached() -> void:
    # Called when a zombie reaches x <= 0 (in Zombie.gd we call main.zombie_reached())
    print("Zombie reached house! Game Over")
    game_started = false
    _show_game_over()

func _show_game_over() -> void:
    # Simple: show menu again
    var menu_scene = preload("res://Menu.tscn")
    var menu_instance = menu_scene.instantiate()
    # We need to add it to a CanvasLayer on top
    var menu_ui = get_node("MenuUI")
    if not menu_ui:
        menu_ui = CanvasLayer.new()
        menu_ui.layer = 20
        add_child(menu_ui)
        menu_ui.name = "MenuUI"
    # Clear previous menu if any
    for child in menu_ui.get_children():
        child.queue_free()
    var menu_ctrl = menu_instance
    menu_ui.add_child(menu_ctrl)
    # Connect start signal again
    menu_ctrl.connect("start_pressed", Callable(self, "_on_start_pressed"))
    # Reset game state
    sun = sun_start
    emit_signal("sun_changed", sun)
    selected_plant_type = ""
    occupied_cells.clear()
    # Remove all plants and zombies and projectiles
    for p in get_tree().get_nodes_in_group("plants"):
        p.queue_free()
    for z in get_tree().get_nodes_in_group("zombies"):
        z.queue_free()
    for proj in get_tree().get_nodes_in_group("projectiles"):
        proj.queue_free()
    for sun_node in get_tree().get_nodes_in_group("suns"):
        sun_node.queue_free()
    # Reset wave
    _reset_wave_state()
    _start_wave_prepare()
    print("Game over, menu shown")

func shoot_projectile(from_row: int, from_x: float, damage: int) -> void:
    var proj_scene = preload("res://scenes/Projectile.tscn")
    var proj_instance = proj_scene.instantiate()
    proj_instance.row = from_row
    proj_instance.damage = damage
    var y = grid.grid_to_world(Vector2(0, from_row)).y - grid.cell_height / 2
    proj_instance.position = Vector2(from_x, y)
    add_child(proj_instance)

func _on_plant_exited(key: String) -> void:
    occupied_cells.erase(key)

func get_zombies() -> Array:
    return get_tree().get_nodes_in_group("zombies")