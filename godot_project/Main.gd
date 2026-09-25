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
var hud_wave_progress: ProgressBar

# 得分统计（与浏览器版 Task 6 对齐）
var score: int = 0
var kills: int = 0
var last_bonus: int = 0
# 本局星级与割草机用量（用于结算屏展示，与浏览器版 lastStars/lastMowersUsed 对齐）
var last_stars: int = 0
var last_mowers_used: int = 0

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

# 视口宽度（天空掉阳光 / 僵尸生成位置用）
const VIEWPORT_WIDTH: float = 960.0

# 关卡系统（按 Levels 单例的 8 关数据生成波次，最后一波清空后胜利）
var current_level_id: int = 1
var current_wave_index: int = 0
var current_level: Dictionary = {}     # 当前关卡数据 {name, start_sun, waves}
var current_wave: Array = []           # 当前波次的僵尸队列 [{type, delay}]
var zombies_spawned_in_wave: int = 0  # 当前波次已生成数
var wave_spawn_timer: float = 0.0
var wave_state: int = 0  # 0 = preparing(波次预告), 1 = spawning(按 delay 生成), 2 = 波次结束等待
var wave_prepare_time: float = 2.0    # 波次预告/间歇时长（秒）
var wave_prepare_timer: float = 0.0
var game_won: bool = false
var is_paused: bool = false   # 暂停标志（独立于关卡状态机）

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
		hud_wave_progress = hud_node.get_node_or_null("WaveProgress")
		if hud_sun_label:
			hud_sun_label.text = "Sun: " + str(sun)
		else:
			push_error("Could not find SunLabel in HUD")
		if hud_wave_label:
			# 关卡系统下初始显示第 1 关第 1 波（与 _reset_level_state 保持一致）
			var _lv_ref = get_node_or_null("/root/Levels")
			hud_wave_label.text = "关卡 1 波次 1/" + str(_lv_ref.get_level(1)["waves"].size()) if _lv_ref else "关卡 1 波次 1/1"
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
	else:
		_create_mower_sprites()
	# Get PlantBar and connect signal
	plant_bar = get_node("PlantUI/PlantBar")
	if not plant_bar:
		push_error("Could not find PlantBar node")
	else:
		plant_bar.connect("plant_selected", Callable(self, "_on_plant_selected"))
	# Get Menu and connect start/level-select signals
	menu = get_node("MenuUI/Menu")
	if not menu:
		push_error("Could not find Menu node")
	else:
		menu.connect("start_pressed", Callable(self, "_on_start_pressed"))
		menu.connect("level_selected", Callable(self, "_on_menu_level_selected"))
	# Connect sun_changed signal to update label
	connect("sun_changed", Callable(self, "_on_sun_changed"))
	# 连接铲子按钮（HUD 新增，位于右上角 RightButtons 容器内）
	var shovel_btn = hud_node.get_node_or_null("RightButtons/ShovelButton") if hud_node else null
	if shovel_btn:
		shovel_btn.connect("pressed", Callable(self, "_on_shovel_pressed"))
	# 连接暂停按钮（HUD 新增，位于右上角 RightButtons 容器内）
	var pause_btn = hud_node.get_node_or_null("RightButtons/PauseButton") if hud_node else null
	if pause_btn:
		pause_btn.connect("pressed", Callable(self, "_toggle_pause"))
	# 连接静音按钮（切换 Sound.enabled）
	var mute_btn = hud_node.get_node_or_null("RightButtons/MuteButton") if hud_node else null
	if mute_btn:
		mute_btn.connect("pressed", Callable(self, "_on_mute_pressed").bind(mute_btn))
	# Emit initial sun change (will trigger the callback)
	emit_signal("sun_changed", sun)
	if plant_bar:
		plant_bar.update_affordability(sun)
	# Initialize level system
	_reset_level_state()
	# Start first wave after a short delay
	call_deferred("_start_wave_prepare")

func _on_start_pressed() -> void:
	var menu_ctrl = get_node_or_null("MenuUI/Menu")
	if menu_ctrl:
		menu_ctrl.queue_free()
	_start_level(1)
	game_started = true
	print("Game started!")

## 菜单中选中已解锁关卡 → 直接进入该关
func _on_menu_level_selected(level_id: int) -> void:
	var menu_ctrl = get_node_or_null("MenuUI/Menu")
	if menu_ctrl:
		menu_ctrl.queue_free()
	_start_level(level_id)
	game_started = true
	print("Started selected level ", level_id)

func _on_plant_selected(type_name: String) -> void:
	# 冷却中不可选中（与浏览器 isOnCooldown 前置拦截一致）
	if plant_bar and plant_bar.has_method("is_on_cooldown") and plant_bar.is_on_cooldown(type_name):
		return
	selected_plant_type = type_name
	_play_sound("click")
	print("Selected plant:", type_name)

func _on_sun_changed(amount: int) -> void:
	if hud_sun_label:
		hud_sun_label.text = "Sun: " + str(amount)
	else:
		push_error("HUD sun label not found")
	if plant_bar:
		plant_bar.update_affordability(sun)

func _process(delta: float) -> void:
	if not game_started or is_paused:
		return
	# 卡片冷却推进（毫秒）；暂停时提前 return，冷却自然冻结（与浏览器一致）
	if plant_bar and plant_bar.has_method("update_cooldowns"):
		plant_bar.update_cooldowns(delta * 1000.0)
	# 夜间关卡：天空掉月亮（🌙，与浏览器版对齐，收集 +sun_fall_amount）；白天掉太阳
	sun_fall_timer += delta
	if sun_fall_timer >= sun_fall_interval:
		sun_fall_timer = 0.0
		var is_night: bool = current_level.get("night", false)
		spawn_sky_pickup(is_night)
	_update_wave(delta)

## 天空收集物：夜间为月亮（is_moon=true，蓝色弯月），白天为太阳；收集效果相同
func spawn_sky_pickup(is_night: bool) -> void:
	var x: float = randf() * VIEWPORT_WIDTH
	var instance: Node2D = preload("res://scenes/Sun.tscn").instantiate()
	instance.process_mode = Node.PROCESS_MODE_PAUSABLE
	instance.position = Vector2(x, -20)
	instance.sun_amount = sun_fall_amount
	if is_night:
		# is_moon 是 @export 变量，实例化后属性可写
		instance.is_moon = true
	add_child(instance)
	instance.add_to_group("suns")

func spawn_sun_from_sky() -> void:
	spawn_sky_pickup(false)

## 向日葵等产光植物在自身位置生成可见阳光（短下落 + 可点击收集）
func spawn_sun_at(pos: Vector2, amount: int) -> void:
	var sun_instance: Node2D = preload("res://scenes/Sun.tscn").instantiate()
	sun_instance.process_mode = Node.PROCESS_MODE_PAUSABLE
	sun_instance.position = pos
	sun_instance.sun_amount = amount
	# 植物产出的阳光下落更短、更快，避免飘到别处
	if sun_instance.has_method("set_fall_behavior"):
		sun_instance.set_fall_behavior(40.0, 4.0)
	add_child(sun_instance)
	sun_instance.add_to_group("suns")

func add_sun(amount: int) -> void:
	sun += amount
	emit_signal("sun_changed", sun)

## 阳光收集：点击位置附近（半径 35px，与浏览器 SUN_COLLECT_RADIUS 对齐）找最近的阳光直接拾取
## 返回 true 表示拾取到了阳光（调用方应跳过后续放置逻辑）
func _try_collect_sun(click_pos: Vector2) -> bool:
	var suns = get_tree().get_nodes_in_group("suns")
	var best: Node = null
	var best_d: float = 35.0 * 35.0
	for s in suns:
		if s == null or not is_instance_valid(s):
			continue
		var d2: float = s.position.distance_squared_to(click_pos)
		if d2 < best_d:
			best_d = d2
			best = s
	if best != null and best.has_method("collect"):
		best.collect()
		return true
	return false

func _unhandled_input(event: InputEvent) -> void:
	if not game_started:
		return
	# 暂停热键：Esc / P
	if event is InputEventKey and event.pressed and not event.echo:
		if event.keycode == KEY_ESCAPE or event.keycode == KEY_P:
			_toggle_pause()
			return
		if event.keycode == KEY_SPACE and selected_plant_type != "":
			selected_plant_type = ""
			if plant_bar:
				plant_bar.deselect_all()
			print("Selection cancelled (Space)")
			return
		if event.keycode == KEY_1 and shovel_mode:
			shovel_mode = false
			print("Shovel mode cancelled")
			return
	if event is InputEventMouseButton and event.pressed:
		# 铲子模式优先：点击植物即铲除（回收 50% 阳光）
		if shovel_mode and event.button_index == MOUSE_BUTTON_LEFT:
			var wp: Vector2 = get_global_mouse_position()
			var gcoord: Vector2 = grid.world_to_grid(wp) if grid else Vector2(-1, -1)
			if gcoord.x >= 0 and gcoord.y >= 0:
				var key: String = str(gcoord.x) + "," + str(gcoord.y)
				if occupied_cells.has(key):
					_remove_plant_with_refund(key)
					shovel_mode = false
					return
		if event.button_index == MOUSE_BUTTON_RIGHT:
			selected_plant_type = ""
			print("Selection cleared")
			return
		# proceed for left button
		if event.button_index != MOUSE_BUTTON_LEFT:
			return
		# handle left button
		# 统一世界坐标来源：阳光收集 + 植物放置
		var world_pos: Vector2 = get_global_mouse_position()
		# 先尝试收集阳光（点中阳光就拾取，避免被误当成放置）
		var collected: bool = _try_collect_sun(world_pos)
		if collected:
			return
		if selected_plant_type != "" and grid:
			var grid_coord: Vector2 = grid.world_to_grid(world_pos)
			if grid_coord.x >= 0 and grid_coord.y >= 0:
				_try_place_plant(grid_coord.x, grid_coord.y)

func _try_place_plant(x: int, y: int) -> void:
	var key: String = str(x) + "," + str(y)
	if occupied_cells.has(key):
		print("Cell already occupied")
		return
	var _pt = get_node_or_null("/root/PlantTypes")
	if _pt == null:
		return
	var plant_data = _pt.get_type(selected_plant_type)
	if plant_data.is_empty():
		print("Invalid plant type:", selected_plant_type)
		return
	var cost: int = plant_data.get("cost", 0)
	if sun < cost:
		return
	# Deduct sun
	sun -= cost
	emit_signal("sun_changed", sun)
	# Place actual plant
	var plant_scene = preload("res://Plant.tscn")
	var plant_instance = plant_scene.instantiate()
	plant_instance.process_mode = Node.PROCESS_MODE_PAUSABLE
	plant_instance.type_id = selected_plant_type
	plant_instance.row = int(y)
	plant_instance.col = int(x)
	var pos = grid.grid_to_world(Vector2(x, y))
	plant_instance.position = pos
	add_child(plant_instance)
	occupied_cells[key] = plant_instance
	# 放置成功后启动卡片冷却（与浏览器 onPlantPlaced → startCooldown 一致）
	if plant_bar and plant_bar.has_method("start_cooldown"):
		plant_bar.start_cooldown(selected_plant_type)
	_play_sound("place_plant")
	# Reset selected
	selected_plant_type = ""
	# Connect plant exiting signal to clean up occupied_cells
	plant_instance.connect("tree_exiting", Callable(self, "_on_plant_exited").bind(key))

## 重置为第 1 关的初始状态
func _reset_level_state() -> void:
	current_level_id = 1
	current_wave_index = 0
	var _lv2 = get_node_or_null("/root/Levels")
	current_level = _lv2.get_level(current_level_id) if _lv2 else {}
	if current_level.is_empty():
		push_error("Levels autoload not found")
		return
	current_wave = current_level["waves"][0]
	zombies_spawned_in_wave = 0
	wave_spawn_timer = 0.0
	wave_state = 0
	wave_prepare_timer = 0.0
	game_won = false
	# 重置卡片冷却（新关卡/重开时清空，与浏览器一致）
	if plant_bar and plant_bar.has_method("deselect_all"):
		plant_bar.deselect_all()
	if plant_bar and "card_cooldowns" in plant_bar:
		plant_bar.card_cooldowns.clear()
	# 应用关卡初始阳光
	sun = current_level.get("start_sun", sun_start)
	emit_signal("sun_changed", sun)
	# 重置每行小推车
	mowers_available = [true, true, true, true, true]
	for spr in mower_sprites:
		if spr and is_instance_valid(spr):
			spr.visible = true
	_update_wave_label()

## 暂停切换（键盘 Esc/P 或 HUD 按钮）
func _toggle_pause() -> void:
	is_paused = not is_paused
	get_tree().paused = is_paused
	_update_pause_overlay()
	print("Paused: ", is_paused)

## 暂停时显示提示（HUD 新增 PauseLabel）
func _update_pause_overlay() -> void:
	var hud = get_node_or_null("HUD")
	if hud:
		var lbl = hud.get_node_or_null("PauseLabel")
		if lbl:
			lbl.visible = is_paused

## 关卡胜利后不再自动推进：显示结算 + 手动进入下一关（与浏览器版对齐）
func _show_result_screen() -> void:
	var result := Label.new()
	result.name = "ResultLabel"
	# 本局星级 + 割草机数 + 历史最佳（与浏览器版胜利屏信息对齐）
	var stars_str := _stars_display(last_stars)
	var best := get_best_for_level(current_level_id)
	var lines := [
		"第 " + str(current_level_id) + " 关完成！",
		"本局 " + stars_str + "（割草机 " + str(last_mowers_used) + " 台）",
		"得分: " + str(score) + "  奖励: " + str(last_bonus),
		"历史最佳 " + str(best.get("score", 0)) + " 分",
	]
	result.text = "\n".join(lines)
	result.position = Vector2(280, 180)
	result.size = Vector2(400, 180)
	result.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	add_child(result)
	var btn_next := Button.new()
	btn_next.name = "NextLevelButton"
	var _lv3 = get_node_or_null("/root/Levels")
	var is_last: bool = _lv3 != null and current_level_id >= _lv3.all_ids().size()
	btn_next.text = "返回菜单" if is_last else "进入第 " + str(current_level_id + 1) + " 关"
	btn_next.position = Vector2(430, 380)
	add_child(btn_next)
	btn_next.pressed.connect(_on_result_button)

func _on_result_button() -> void:
	_clear_result_screen()
	var _lv4 = get_node_or_null("/root/Levels")
	var is_last: bool = _lv4 != null and current_level_id >= _lv4.all_ids().size()
	if not is_last:
		_start_level(current_level_id + 1)
	else:
		_back_to_menu()

## 星级显示（0-3 星），与浏览器版 '★'.repeat + '☆'.repeat 对齐
func _stars_display(n: int) -> String:
	var s := ""
	for i in 3:
		s += "★" if i < n else "☆"
	return s

func _clear_result_screen() -> void:
	for n in ["ResultLabel", "NextLevelButton"]:
		var node = get_node_or_null(n)
		if node:
			node.queue_free()

## 返回主菜单（末关通关后 / 可选重开入口）
func _back_to_menu() -> void:
	var menu_scene = preload("res://Menu.tscn")
	var menu_instance = menu_scene.instantiate()
	var menu_ui = get_node_or_null("MenuUI")
	if not menu_ui:
		menu_ui = CanvasLayer.new()
		menu_ui.layer = 20
		add_child(menu_ui)
		menu_ui.name = "MenuUI"
	for child in menu_ui.get_children():
		child.queue_free()
	menu_ui.add_child(menu_instance)
	menu_instance.connect("start_pressed", Callable(self, "_on_start_pressed"))
	menu_instance.connect("level_selected", Callable(self, "_on_menu_level_selected"))
	# 重置到第 1 关待命状态
	_reset_level_state()
	game_started = false

## 从指定关卡 ID 开始（供胜利结算/关卡选择使用）
func _start_level(level_id: int) -> void:
	current_level_id = level_id
	current_wave_index = 0
	var _lv6 = get_node_or_null("/root/Levels")
	current_level = _lv6.get_level(level_id) if _lv6 else {}
	if current_level.is_empty():
		push_error("Levels autoload not found")
		return
	current_wave = current_level["waves"][0]
	game_won = false
	sun = current_level.get("start_sun", sun_start)
	emit_signal("sun_changed", sun)
	mowers_available = [true, true, true, true, true]
	for p in get_tree().get_nodes_in_group("plants"):
		p.queue_free()
	for z in get_tree().get_nodes_in_group("zombies"):
		z.queue_free()
	occupied_cells.clear()
	call_deferred("_start_wave_prepare")

## 夜间视觉：深色背景 + 静态星空
func _apply_night_visuals() -> void:
	var night: bool = current_level.get("night", false)
	var bg: ColorRect = $Background
	bg.color = Color(0.05, 0.06, 0.13) if night else Color(0.1, 0.3, 0.1)
	var back_rect = get_node_or_null("NightSky/BackRect")
	if back_rect:
		back_rect.visible = night
	var stars = get_node_or_null("NightSky/Stars")
	if stars:
		stars.visible = night

## 波次预告开始（显示关卡/波次信息后进入生成阶段）
func _start_wave_prepare() -> void:
	wave_state = 0
	wave_prepare_timer = 0.0
	zombies_spawned_in_wave = 0
	wave_spawn_timer = 0.0
	print("Preparing level ", current_level_id, " wave ", current_wave_index + 1, " of ", current_level["waves"].size())
	_update_wave_label()
	# 中段（半波次）自动保存检查点（与浏览器版 level.js 对齐）
	if current_wave_index == int(current_level["waves"].size() / 2):
		_save_checkpoint()
	# 夜间视觉切换
	_apply_night_visuals()

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
			_play_sound("wave_start")
	elif wave_state == 1:  # 按当前波次 delay 生成僵尸
		wave_spawn_timer += delta
		while zombies_spawned_in_wave < current_wave.size() and wave_spawn_timer >= float(current_wave[zombies_spawned_in_wave]["delay"]):
			spawn_zombie(current_wave[zombies_spawned_in_wave]["type"])
			zombies_spawned_in_wave += 1
		# 全部生成且场上无僵尸时，进入波次间歇（派生计数）
		if zombies_spawned_in_wave >= current_wave.size() and _count_alive_zombies() == 0:
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
	zombie_instance.process_mode = Node.PROCESS_MODE_PAUSABLE
	var row = randi() % 5  # 0-4
	zombie_instance.row_index = row
	if zombie_instance.has_method("set_type") or "type_id" in zombie_instance:
		zombie_instance.type_id = zombie_type
	var start_x = VIEWPORT_WIDTH + 30
	var y = grid.grid_to_world(Vector2(0, row)).y - grid.cell_height / 2
	zombie_instance.position = Vector2(start_x, y)
	add_child(zombie_instance)
	# 传入僵尸实例，以便在 tree_exiting 时判断是否被击杀并累计得分
	zombie_instance.connect("tree_exiting", Callable(self, "_on_zombie_exited").bind(zombie_instance))

func _on_zombie_exited(zombie: Node) -> void:
	# 存活数改为派生计数，此处只负责击杀计分
	# 判断是"被击杀"而非"自然消失"（如过关清理 queue_free 也会触发 tree_exiting）
	# Zombie.gd 中 _dead 为 true 表示被攻击致死；自然走到 x<=0 时调用 zombie_reached 但不置 _dead
	if zombie and zombie.has_method("is_killed") and zombie.is_killed():
		record_kill(zombie.type_id)
	# 若全部生成且无存活僵尸，将在 _update_wave 中检测到并进入波次间歇

## 派生计数：统计场上未死亡的僵尸数（含友方），替代易失同步的手动计数器
func _count_alive_zombies() -> int:
	var n: int = 0
	for z in get_tree().get_nodes_in_group("zombies"):
		if z != null and is_instance_valid(z) and not z.get("_dead"):
			n += 1
	return n

## 当前关卡全部波次清空，触发胜利
func _on_level_won() -> void:
	game_won = true
	print("Level ", current_level_id, " won! All waves cleared.")
	# 过关奖励：基础500 + 剩余阳光折算（与浏览器版 Task 6 对齐）
	last_bonus = 500 + sun / 10
	score += last_bonus
	# 星级：按割草机使用量（0-1台→3星，2-3台→2星，4台及以上→1星，与浏览器版一致）
	var mowers_used: int = 5 - mowers_available.filter(func(v): return v).size()
	var stars: int = 3 if mowers_used <= 1 else (2 if mowers_used <= 3 else 1)
	last_stars = stars
	last_mowers_used = mowers_used
	_update_score_display()
	_save_progress()
	# 更新 HUD 并停止后续波次
	_update_wave_label()
	_play_sound("win")
	# 停止自动推进：显示结算画面，由玩家手动进入下一关（与浏览器版对齐）
	_show_result_screen()

## 更新波次显示
func _update_wave_label() -> void:
	if hud_wave_label:
		if game_won:
			hud_wave_label.text = "关卡 " + str(current_level_id) + " 完成！"
		else:
			hud_wave_label.text = "关卡 " + str(current_level_id) + " 波次 " + str(current_wave_index + 1) + "/" + str(current_level["waves"].size())
	# 波次进度条：当前波 / 总波（与浏览器 ui.js 渲染一致）
	if hud_wave_progress:
		var total_waves: int = current_level["waves"].size() if not current_level.is_empty() else 0
		var cur: int = mini(current_wave_index + 1, total_waves)
		hud_wave_progress.value = (float(cur) / float(total_waves) * 100.0) if total_waves > 0 else 0.0

func _on_game_won_ui() -> void:
	# 胜利状态下的 UI 钩子（可扩展为弹出胜利提示）
	pass

var mowers_available: Array = [true, true, true, true, true]  # 每行一次性小推车
var shovel_mode: bool = false                                  # 铲子模式（HUD 按钮切换）
var mower_sprites: Array = []                                  # 每行小推车精灵（可见化）

## 音效触发helper：调用 Sound autoload 的对应方法（方法名与 js/sound.js 对齐）
func _play_sound(method: String) -> void:
	var snd = get_node_or_null("/root/Sound")
	if snd != null and snd.has_method(method):
		snd.call(method)

## 创建每行小推车精灵（程序化绘制，零素材；与浏览器 _drawMower 造型对齐）
func _create_mower_sprites() -> void:
	mower_sprites.clear()
	var tex := _build_mower_texture()
	for r in range(5):
		var spr := Sprite2D.new()
		spr.texture = tex
		# 小推车停在网格最左侧（房屋与第一列之间）
		var cy: float = grid.grid_to_world(Vector2(0, r)).y
		spr.position = Vector2(28.0, cy)
		spr.process_mode = Node.PROCESS_MODE_PAUSABLE
		add_child(spr)
		mower_sprites.append(spr)

## 程序化绘制小推车：红色机身 + 两侧刀片 + 黄色车头标识
func _build_mower_texture() -> ImageTexture:
	var W := 44
	var H := 32
	var img := Image.create(W, H, false, Image.FORMAT_RGBA8)
	img.fill(Color(0, 0, 0, 0))
	var body := Color(0.72, 0.11, 0.11)
	var blade := Color(0.62, 0.62, 0.62)
	var gold := Color(1.0, 0.84, 0.0)
	# 机身
	for py in range(9, 23):
		for px in range(6, 38):
			img.set_pixel(px, py, body)
	# 两侧刀片（圆环）
	for py in range(H):
		for px in range(W):
			var d1: float = Vector2(px - 6, py - 16).length()
			var d2: float = Vector2(px - 38, py - 16).length()
			if abs(d1 - 8.0) < 1.6 or abs(d2 - 8.0) < 1.6:
				img.set_pixel(px, py, blade)
	# 车头黄色标识
	for py in range(12, 16):
		for px in range(16, 28):
			img.set_pixel(px, py, gold)
	return ImageTexture.create_from_image(img)

## 小推车触发后隐藏该行精灵
func _hide_mower(row: int) -> void:
	if row >= 0 and row < mower_sprites.size():
		var spr = mower_sprites[row]
		if spr and is_instance_valid(spr):
			spr.visible = false

## 铲子按钮切换
func _on_shovel_pressed() -> void:
	shovel_mode = not shovel_mode
	_play_sound("click")
	print("Shovel mode: ", shovel_mode)

## 静音切换（对应浏览器 Sound.setEnabled）
func _on_mute_pressed(btn: Button) -> void:
	var snd = get_node_or_null("/root/Sound")
	if snd == null:
		return
	var now_enabled: bool = not snd.is_enabled()
	snd.set_enabled(now_enabled)
	if btn:
		btn.text = "🔊" if now_enabled else "🔇"

## 铲除指定格的植物并回收 50% 阳光成本（与浏览器版 removePlant 对齐）
func _remove_plant_with_refund(key: String) -> void:
	var plant: Node = occupied_cells.get(key)
	if plant == null or not is_instance_valid(plant):
		occupied_cells.erase(key)
		return
	var _pt2 = get_node_or_null("/root/PlantTypes")
	var cost: int = int(_pt2.get_type(plant.type_id).get("cost", 0)) if _pt2 else 0
	sun += int(cost * 0.5)
	emit_signal("sun_changed", sun)
	plant.queue_free()
	occupied_cells.erase(key)
	print("Plant removed, refund ", int(cost * 0.5), " sun")

func zombie_reached(row: int = -1) -> void:
	# 僵尸到达最左：先查本行小推车，可用则清行，否则失败
	if row >= 0 and row < 5 and mowers_available[row]:
		mowers_available[row] = false
		_hide_mower(row)
		_clear_row_zombies(row)
		_play_sound("zombie_die")
		print("Mower triggered in row ", row)
		return
	print("Zombie reached house! Game Over")
	game_started = false
	_play_sound("lose")
	_show_game_over()

## 小推车触发：清除本行全部僵尸（计入得分）
func _clear_row_zombies(row: int) -> void:
	for z in get_tree().get_nodes_in_group("zombies"):
		if z.row_index == row:
			record_kill(z.type_id)
			z.queue_free()

## ===== 检查点存档（基础版：每关中段自动快照，失败可恢复） =====
const CHECKPOINT_PATH := "user://checkpoint.cfg"

## 保存本关中段检查点快照（waveIndex/sun/plants/zombies）
func _save_checkpoint() -> void:
	var plants_arr: Array = []
	for p in get_tree().get_nodes_in_group("plants"):
		plants_arr.append({
			"type": p.type_id,
			"row": p.row,
			"col": p.col,
		})
	var zombies_arr: Array = []
	for z in get_tree().get_nodes_in_group("zombies"):
		if not z._dead:
			zombies_arr.append({
				"type": z.type_id,
				"row": z.row_index,
				"x": z.position.x,
				"hp": z.hp,
			})
	var data := {
		"level_id": current_level_id,
		"wave_index": current_wave_index,
		"sun": sun,
		"plants": plants_arr,
		"zombies": zombies_arr,
	}
	var file := FileAccess.open(CHECKPOINT_PATH, FileAccess.WRITE)
	if file:
		file.store_string(JSON.stringify(data))
		file.close()

## 是否存在本关可用检查点
func _has_checkpoint() -> bool:
	if not FileAccess.file_exists(CHECKPOINT_PATH):
		return false
	var data = _load_checkpoint_data()
	return data != null and int(data.get("level_id", 0)) == current_level_id

func _load_checkpoint_data() -> Variant:
	var file := FileAccess.open(CHECKPOINT_PATH, FileAccess.READ)
	if not file:
		return null
	var data = JSON.parse_string(file.get_as_text())
	file.close()
	return data

## 从检查点恢复（清场后按快照重建）
func _load_checkpoint() -> void:
	var data = _load_checkpoint_data()
	if data == null:
		return
	# 清场
	for p in get_tree().get_nodes_in_group("plants"):
		p.queue_free()
	for z in get_tree().get_nodes_in_group("zombies"):
		z.queue_free()
	occupied_cells.clear()
	# 恢复状态
	current_level_id = int(data.get("level_id", 1))
	current_wave_index = int(data.get("wave_index", 0))
	sun = int(data.get("sun", sun_start))
	emit_signal("sun_changed", sun)
	var _lv5 = get_node_or_null("/root/Levels")
	current_level = _lv5.get_level(current_level_id) if _lv5 else {}
	if current_level.is_empty():
		push_error("Levels autoload not found")
		return
	current_wave = current_level["waves"][current_wave_index]
	# 重建植物
	for pdata in data.get("plants", []):
		var key: String = str(pdata["col"]) + "," + str(pdata["row"])
		var plant_scene = preload("res://Plant.tscn")
		var plant_instance = plant_scene.instantiate()
		plant_instance.type_id = pdata["type"]
		plant_instance.row = int(pdata["row"])
		plant_instance.col = int(pdata["col"])
		plant_instance.position = grid.grid_to_world(Vector2(int(pdata["col"]), int(pdata["row"])))
		add_child(plant_instance)
		occupied_cells[key] = plant_instance
	# 重建僵尸
	for zdata in data.get("zombies", []):
		var zombie_scene = preload("res://Zombie.tscn")
		var zombie_instance = zombie_scene.instantiate()
		zombie_instance.type_id = zdata["type"]
		zombie_instance.row_index = int(zdata["row"])
		var y = grid.grid_to_world(Vector2(0, int(zdata["row"]))).y - grid.cell_height / 2
		zombie_instance.position = Vector2(float(zdata["x"]), y)
		if "hp" in zdata:
			zombie_instance.hp = int(zdata["hp"])
		add_child(zombie_instance)
		zombie_instance.connect("tree_exiting", Callable(self, "_on_zombie_exited").bind(zombie_instance))
	# 重新开始波次
	game_started = true
	call_deferred("_start_wave_prepare")
	print("Checkpoint restored at level ", current_level_id, " wave ", current_wave_index + 1)

func _show_game_over() -> void:
	# 失败面板：有本关检查点 → 提供"从检查点恢复"；否则重开本关
	var panel := Panel.new()
	panel.name = "GameOverPanel"
	panel.position = Vector2(330, 180)
	panel.size = Vector2(300, 200)
	add_child(panel)
	var title := Label.new()
	title.text = "防线被突破！"
	title.position = Vector2(20, 10)
	title.size = Vector2(260, 40)
	panel.add_child(title)
	if _has_checkpoint():
		var btn_resume := Button.new()
		btn_resume.text = "从检查点恢复"
		btn_resume.position = Vector2(40, 60)
		btn_resume.pressed.connect(_on_game_over_resume)
		panel.add_child(btn_resume)
	var btn_restart := Button.new()
	btn_restart.text = "重开本关"
	btn_restart.position = Vector2(40, 110)
	btn_restart.pressed.connect(_on_game_over_restart)
	panel.add_child(btn_restart)

func _on_game_over_resume() -> void:
	var panel = get_node_or_null("GameOverPanel")
	if panel:
		panel.queue_free()
	_load_checkpoint()

func _on_game_over_restart() -> void:
	var panel = get_node_or_null("GameOverPanel")
	if panel:
		panel.queue_free()
	# 重置关卡系统并重新开始本关
	_reset_level_state()
	game_started = true
	call_deferred("_start_wave_prepare")
	print("Level restarted")

func shoot_projectile(from_row: int, from_x: float, damage: int, slow_factor: float = 0.0, slow_duration: float = 0.0, penetrate: bool = false) -> void:
	var proj_scene = preload("res://scenes/Projectile.tscn")
	var proj_instance = proj_scene.instantiate()
	proj_instance.row = from_row
	proj_instance.damage = damage
	proj_instance.slow_factor = slow_factor
	proj_instance.slow_duration = slow_duration
	proj_instance.penetrate = penetrate
	proj_instance.process_mode = Node.PROCESS_MODE_PAUSABLE
	var y = grid.grid_to_world(Vector2(0, from_row)).y - grid.cell_height / 2
	proj_instance.position = Vector2(from_x, y)
	add_child(proj_instance)

func _on_plant_exited(key: String) -> void:
	occupied_cells.erase(key)

func get_zombies() -> Array:
	return get_tree().get_nodes_in_group("zombies")

## 击杀记录：按僵尸类型累加得分
func record_kill(zombie_type: String) -> void:
	var _zt = get_node_or_null("/root/ZombieTypes")
	var type_data = _zt.get_type(zombie_type) if _zt else {}
	score += int(type_data.get("score", 10))
	kills += 1
	_update_score_display()

## 更新得分显示
func _update_score_display() -> void:
	if hud_score_label:
		hud_score_label.text = "Score: " + str(score)

## 存档到 user://save.cfg（字段与浏览器版 SaveStore 对齐：
## unlocked_level / total_score / total_kills / wins / best_scores{level:{score,stars}}）
func _save_progress() -> void:
	# 读取已有存档
	var old_total_score := 0
	var old_total_kills := 0
	var old_wins := 0
	var old_unlocked := 1
	var old_best_scores := {}
	if FileAccess.file_exists(SAVE_PATH):
		var old_file := FileAccess.open(SAVE_PATH, FileAccess.READ)
		if old_file:
			var old_data = JSON.parse_string(old_file.get_as_text())
			old_file.close()
			if old_data:
				old_total_score = int(old_data.get("total_score", 0))
				old_total_kills = int(old_data.get("total_kills", 0))
				old_wins = int(old_data.get("wins", 0))
				old_unlocked = int(old_data.get("unlocked_level", 1))
				var bs = old_data.get("best_scores", {})
				if bs is Dictionary:
					old_best_scores = bs
	# 更新/写入本关最佳（score 与 stars 均取历史最大值，与浏览器 addClearScore 一致）
	var prev = old_best_scores.get(current_level_id, {})
	if not (prev is Dictionary):
		prev = {}
	var prev_score: int = int(prev.get("score", 0))
	var prev_stars: int = int(prev.get("stars", 0))
	var new_best := {
		"score": maxi(prev_score, score),
		"stars": maxi(prev_stars, last_stars),
	}
	old_best_scores[current_level_id] = new_best

	var file := FileAccess.open(SAVE_PATH, FileAccess.WRITE)
	if file:
		var data := {
			"unlocked_level": max(old_unlocked, current_level_id + 1),
			"total_score": old_total_score + score,
			"total_kills": old_total_kills + kills,
			"wins": old_wins + 1,
			"best_scores": old_best_scores,
		}
		file.store_string(JSON.stringify(data))
		file.close()

## 加载存档
func _load_progress() -> Dictionary:
	var default := {
		"unlocked_level": 1, "total_score": 0, "total_kills": 0,
		"wins": 0, "best_scores": {},
	}
	if not FileAccess.file_exists(SAVE_PATH):
		return default
	var file := FileAccess.open(SAVE_PATH, FileAccess.READ)
	if file:
		var data = JSON.parse_string(file.get_as_text())
		file.close()
		if data is Dictionary:
			# 补齐缺失字段，保证结构与浏览器版一致
			data["unlocked_level"] = int(data.get("unlocked_level", 1))
			data["total_score"] = int(data.get("total_score", 0))
			data["total_kills"] = int(data.get("total_kills", 0))
			data["wins"] = int(data.get("wins", 0))
			data["best_scores"] = data.get("best_scores", {})
			return data
	return default

## 读取某关的最佳记录 {score, stars}；未通关返回 {score:0, stars:0}
func get_best_for_level(level_id: int) -> Dictionary:
	var save := _load_progress()
	var bs = save.get("best_scores", {})
	var entry = bs.get(level_id, {})
	if entry is Dictionary:
		return {"score": int(entry.get("score", 0)), "stars": int(entry.get("stars", 0))}
	return {"score": 0, "stars": 0}
