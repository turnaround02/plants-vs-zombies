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
var hud_score_label: Label

# 得分统计（与浏览器版 Task 6 对齐）
var score: int = 0
var kills: int = 0
var last_bonus: int = 0

# 存档路径（Godot 用户目录）
const SAVE_PATH := "user://save.cfg"
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

# 关卡系统（按 Levels 单例的 8 关数据生成波次，最后一波清空后胜利）
var current_level_id: int = 1
var current_wave_index: int = 0
var current_level: Dictionary = {}     # 当前关卡数据 {name, start_sun, waves}
var current_wave: Array = []           # 当前波次的僵尸队列 [{type, delay}]
var zombies_spawned_in_wave: int = 0  # 当前波次已生成数
var zombies_alive: int = 0
var wave_spawn_timer: float = 0.0
var wave_state: int = 0  # 0 = preparing(波次预告), 1 = spawning(按 delay 生成), 2 = 波次结束等待
var wave_prepare_time: float = 2.0    # 波次预告/间歇时长（秒）
var wave_prepare_timer: float = 0.0
var game_won: bool = false

func _ready() -> void:
    add_to_group("main")
    sun = sun_start
    sun_fall_timer = 0.0
    # Get HUD labels
    var hud_node: Node = get_node("HUD")
    if hud_node:
        hud_sun_label = hud_node.get_node("SunLabel")
        hud_wave_label = hud_node.get_node("WaveLabel")
        hud_score_label = hud_node.get_node("ScoreLabel")
        if hud_sun_label:
            hud_sun_label.text = "Sun: " + str(sun)
        else:
            push_error("Could not find SunLabel in HUD")
        if hud_wave_label:
            # 关卡系统下初始显示第 1 关第 1 波（与 _reset_level_state 保持一致）
            hud_wave_label.text = "关卡 1 波次 1/" + str(Levels.get_level(1)["waves"].size())
        else:
            push_error("Could not find WaveLabel in HUD")
        if hud_score_label:
            hud_score_label.text = "Score: 0"
        else:
            push_error("Could not find ScoreLabel in HUD")
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
    # Initialize level system
    _reset_level_state()
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

## 重置为第 1 关的初始状态
func _reset_level_state() -> void:
    current_level_id = 1
    current_wave_index = 0
    current_level = Levels.get_level(current_level_id)
    current_wave = current_level["waves"][0]
    zombies_spawned_in_wave = 0
    zombies_alive = 0
    wave_spawn_timer = 0.0
    wave_state = 0
    wave_prepare_timer = 0.0
    game_won = false
    # 应用关卡初始阳光
    sun = current_level.get("start_sun", sun_start)
    emit_signal("sun_changed", sun)
    # 重置每行小推车
    mowers_available = [true, true, true, true, true]
    _update_wave_label()

## 波次预告开始（显示关卡/波次信息后进入生成阶段）
func _start_wave_prepare() -> void:
    wave_state = 0
    wave_prepare_timer = 0.0
    zombies_spawned_in_wave = 0
    wave_spawn_timer = 0.0
    print("Preparing level ", current_level_id, " wave ", current_wave_index + 1, " of ", current_level["waves"].size())
    _update_wave_label()

## 波次状态机：预告 -> 按 delay 生成 -> 波次结束 -> 下一波/胜利
func _update_wave(delta: float) -> void:
    if game_won:
        return
    if wave_state == 0:  # 波次预告
        wave_prepare_timer += delta
        if wave_prepare_timer >= wave_prepare_time:
            wave_state = 1
            wave_spawn_timer = 0.0
            print("Wave ", current_wave_index + 1, " spawning started")
    elif wave_state == 1:  # 按当前波次 delay 生成僵尸
        wave_spawn_timer += delta
        while zombies_spawned_in_wave < current_wave.size() and wave_spawn_timer >= float(current_wave[zombies_spawned_in_wave]["delay"]):
            spawn_zombie(current_wave[zombies_spawned_in_wave]["type"])
            zombies_spawned_in_wave += 1
        # 全部生成且场上无僵尸时，进入波次间歇
        if zombies_spawned_in_wave >= current_wave.size() and zombies_alive == 0:
            wave_state = 2
            wave_prepare_timer = 0.0
            print("Wave ", current_wave_index + 1, " complete")
    elif wave_state == 2:  # 波次间歇
        wave_prepare_timer += delta
        if wave_prepare_timer >= wave_prepare_time:
            current_wave_index += 1
            if current_wave_index >= current_level["waves"].size():
                _on_level_won()
            else:
                current_wave = current_level["waves"][current_wave_index]
                _start_wave_prepare()

## 生成指定类型的僵尸（随机行）
func spawn_zombie(zombie_type: String = "normal") -> void:
    var zombie_scene = preload("res://Zombie.tscn")
    var zombie_instance = zombie_scene.instantiate()
    var row = randi() % 5  # 0-4
    zombie_instance.row_index = row
    if zombie_instance.has_method("set_type") or "type_id" in zombie_instance:
        zombie_instance.type_id = zombie_type
    var start_x = size.x + 30
    var y = grid.grid_to_world(Vector2(0, row)).y - grid.cell_height / 2
    zombie_instance.position = Vector2(start_x, y)
    add_child(zombie_instance)
    zombies_alive += 1
    # 传入僵尸实例，以便在 tree_exiting 时判断是否被击杀并累计得分
    zombie_instance.connect("tree_exiting", Callable(self, "_on_zombie_exited", [zombie_instance]))

func _on_zombie_exited(zombie: Node) -> void:
    zombies_alive -= 1
    # 判断是"被击杀"而非"自然消失"（如过关清理 queue_free 也会触发 tree_exiting）
    # Zombie.gd 中 _dead 为 true 表示被攻击致死；自然走到 x<=0 时调用 zombie_reached 但不置 _dead
    if zombie and zombie.has_method("is_killed") and zombie.is_killed():
        record_kill(zombie.type_id)
    # 若全部生成且无存活僵尸，将在 _update_wave 中检测到并进入波次间歇

## 当前关卡全部波次清空，触发胜利
func _on_level_won() -> void:
    game_won = true
    print("Level ", current_level_id, " won! All waves cleared.")
    # 过关奖励：基础500 + 剩余阳光折算（与浏览器版 Task 6 对齐）
    last_bonus = 500 + sun / 10
    score += last_bonus
    _update_score_display()
    _save_progress()
    # 更新 HUD 并停止后续波次
    _update_wave_label()
    # 胜利后进入下一关（若未到最后关），否则停留在胜利状态
    if current_level_id < Levels.all_ids()[-1]:
        current_level_id += 1
        current_wave_index = 0
        current_level = Levels.get_level(current_level_id)
        current_wave = current_level["waves"][0]
        game_won = false
        sun = current_level.get("start_sun", sun)
        emit_signal("sun_changed", sun)
        # 清理残留单位后开始下一关
        for p in get_tree().get_nodes_in_group("plants"):
            p.queue_free()
        for z in get_tree().get_nodes_in_group("zombies"):
            z.queue_free()
        for proj in get_tree().get_nodes_in_group("projectiles"):
            proj.queue_free()
        for sun_node in get_tree().get_nodes_in_group("suns"):
            sun_node.queue_free()
        occupied_cells.clear()
        zombies_alive = 0
        call_deferred("_start_wave_prepare")
    else:
        print("All levels cleared!")
        _update_wave_label()

## 更新波次显示
func _update_wave_label() -> void:
    if hud_wave_label:
        if game_won:
            hud_wave_label.text = "关卡 " + str(current_level_id) + " 完成！"
        else:
            hud_wave_label.text = "关卡 " + str(current_level_id) + " 波次 " + str(current_wave_index + 1) + "/" + str(current_level["waves"].size())

func _on_game_won_ui() -> void:
    # 胜利状态下的 UI 钩子（可扩展为弹出胜利提示）
    pass

var mowers_available: Array = [true, true, true, true, true]  # 每行一次性小推车

func zombie_reached(row: int = -1) -> void:
    # 僵尸到达最左：先查本行小推车，可用则清行，否则失败
    if row >= 0 and row < 5 and mowers_available[row]:
        mowers_available[row] = false
        _clear_row_zombies(row)
        print("Mower triggered in row ", row)
        return
    print("Zombie reached house! Game Over")
    game_started = false
    _show_game_over()

## 小推车触发：清除本行全部僵尸（计入得分）
func _clear_row_zombies(row: int) -> void:
    for z in get_tree().get_nodes_in_group("zombies"):
        if z.get("row_index") == row:
            record_kill(z.get("type_id", "normal"))
            z.queue_free()
    zombies_alive = 0

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
    # 重置关卡系统并重新开始
    _reset_level_state()
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

## 击杀记录：按僵尸类型累加得分
func record_kill(zombie_type: String) -> void:
    var type_data = ZombieTypes.get_type(zombie_type)
    score += int(type_data.get("score", 10))
    kills += 1
    _update_score_display()

## 更新得分显示
func _update_score_display() -> void:
    if hud_score_label:
        hud_score_label.text = "Score: " + str(score)

## 存档到 user://save.cfg
func _save_progress() -> void:
    var file := FileAccess.open(SAVE_PATH, FileAccess.WRITE)
    if file:
        # 读取已有存档并累加
        var total_score := 0
        var wins := 0
        var unlocked := 1
        if FileAccess.file_exists(SAVE_PATH):
            var old_file := FileAccess.open(SAVE_PATH, FileAccess.READ)
            if old_file:
                var old_data = JSON.parse_string(old_file.get_as_text())
                old_file.close()
                if old_data:
                    total_score = int(old_data.get("total_score", 0))
                    wins = int(old_data.get("wins", 0))
                    unlocked = int(old_data.get("unlocked_level", 1))
        var data := {
            "unlocked_level": max(unlocked, current_level_id + 1),
            "total_score": total_score + score,
            "wins": wins + 1,
        }
        file.store_string(JSON.stringify(data))
        file.close()

## 加载存档
func _load_progress() -> Dictionary:
    if not FileAccess.file_exists(SAVE_PATH):
        return {"unlocked_level": 1, "total_score": 0, "wins": 0}
    var file := FileAccess.open(SAVE_PATH, FileAccess.READ)
    if file:
        var data = JSON.parse_string(file.get_as_text())
        file.close()
        if data:
            return data
    return {"unlocked_level": 1, "total_score": 0, "wins": 0}