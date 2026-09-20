extends Node2D

# 僵尸类型 ID（"normal" / "cone" / "runner" / "bucket" / "pole_vault" / "newspaper"）
@export var type_id: String = "normal"

# Zombie stats（默认值，若指定 type_id 则从 ZombieTypes 覆盖）
@export var speed: float = 25.0       # slightly slower
@export var hp: int = 5               # increased from 3
@export var max_hp: int = 5
@export var attack_interval: float = 1.0  # faster attacks
@export var attack_damage: int = 1
@export var attack_range: float = 50.0  # increased from 25
@export var row_index: int = 0

var _sprite: Sprite2D
var attack_timer: float = 0.0
var eating: bool = false
var target_plant: Node = null
var _hit_flash_timer: float = 0.0
var _dead: bool = false
var _death_timer: float = 0.0
var score: int = 0                    # 击杀得分

# 行为标志（与浏览器版对齐）
var is_ally: bool = false             # 魅惑后转为友方：右行 + 攻击普通僵尸
var _jumped: bool = false             # 撑杆是否已跳跃越障
var _jump_timer: float = 0.0         # 跳跃冲刺剩余时间
var _newspaper_hit: bool = false      # 读报是否已被首次击中
var _news_speed: float = 0.0         # 读报加速后的速度（来自 ZombieTypes.speed_after_hit）

func _ready() -> void:
    add_to_group("zombies")
    _apply_type()
    _sprite = get_node("Sprite")
    _make_placeholder()

## 按 type_id 从 ZombieTypes 单例覆盖属性
func _apply_type() -> void:
    var t: Dictionary = ZombieTypes.get_type(type_id)
    max_hp = t.get("hp", max_hp)
    hp = max_hp
    speed = t.get("speed", speed)
    attack_interval = t.get("attack_interval", attack_interval)
    attack_damage = t.get("damage", attack_damage)
    score = t.get("score", 0)

func _make_placeholder() -> void:
    var img := Image.create(30, 60, false, Image.FORMAT_RGBA8)
    img.fill(Color(0.5, 0.7, 0.2, 1.0))  # green blob
    _sprite.texture = ImageTexture.create_from_image(img)
    _sprite.offset = Vector2(15, 30)

func _process(delta: float) -> void:
    # Death animation - fade out and rotate
    if _dead:
        _death_timer += delta
        _sprite.modulate.a = 1.0 - (_death_timer / 0.5)
        rotation = sign(position.x) * _death_timer * 3.14
        if _death_timer >= 0.5:
            queue_free()
            return
    
    # Hit flash effect
    if _hit_flash_timer > 0:
        _hit_flash_timer -= delta
        if _hit_flash_timer <= 0:
            _sprite.modulate = Color(1, 1, 1, 1)
    
    # 友方（魅惑）僵尸：右行，攻击普通僵尸，不再吃植物
    if is_ally:
        _process_ally(delta)
        return
    
    # 撑杆跳跃冲刺计时
    if _jump_timer > 0:
        _jump_timer -= delta
        if _jump_timer <= 0:
            speed -= 20.0  # 冲刺结束，回落原速
    if not eating:
        position.x -= speed * delta
    # Check if we have reached the house
    if position.x <= 0:
        var main = get_tree().root.get_node("Main")
        if main:
            main.zombie_reached(row_index)
    # Update timers
    attack_timer += delta
    # Find target plant if not eating
    if not eating:
        var plant = _find_target_plant()
        if plant:
            # 撑杆僵尸接近植物时一次性跳跃越障（短暂加速）
            if not _jumped and ZombieTypes.get_type(type_id).get("jump_over_plant", false):
                _jumped = true
                _jump_timer = 1.0
                speed += 20.0
            eating = true
            target_plant = plant
            attack_timer = 0.0
    else:
        # If eating, check if target plant still alive
        if not target_plant or not target_plant.is_instance_valid() or target_plant.hp <= 0:
            eating = false
            target_plant = null
            attack_timer = 0.0
            return
        # Attack the plant
        if attack_timer >= attack_interval:
            attack_timer = 0.0
            target_plant.take_damage(attack_damage)
            if target_plant.hp <= 0:
                eating = false
                target_plant = null

## 友方僵尸：右行出界移除，途中攻击普通（非友方）僵尸
func _process_ally(delta: float) -> void:
    position.x += speed * delta
    var main = get_tree().root.get_node("Main")
    if main and main.get("size") and position.x >= main.size.x + 50:
        queue_free()
        return
    attack_timer += delta
    # 找同向（右侧）最近的普通僵尸并啃食
    if not eating:
        var target = _find_ally_target()
        if target:
            eating = true
            target_plant = target
            attack_timer = 0.0
    else:
        if not target_plant or not target_plant.is_instance_valid() or target_plant._dead:
            eating = false
            target_plant = null
            attack_timer = 0.0
            return
        if attack_timer >= attack_interval:
            attack_timer = 0.0
            target_plant.take_damage(attack_damage)

## 友方目标：同排、右侧、未死、非友方的普通僵尸
func _find_ally_target() -> Node:
    var zombies = get_tree().get_nodes_in_group("zombies")
    var best: Node = null
    var best_dist: float = 1e9
    for z in zombies:
        if z == self or z.get("_dead", false) or z.get("is_ally", false):
            continue
        if z.get("row_index") != row_index:
            continue
        if z.position.x < position.x:
            continue
        var dist: float = z.position.x - position.x
        if dist < best_dist:
            best_dist = dist
            best = z
    return best

## 魅惑：转为友方（Plant.gd 的 _do_charm 调用本方法）
func set_charmed(ally: bool) -> void:
    is_ally = ally
    eating = false
    target_plant = null
    _sprite.modulate = Color(0.4, 0.7, 1.0)  # 蓝色标记魅惑状态

func _find_target_plant() -> Node:
    var plants = get_tree().get_nodes_in_group("plants")
    var closest: Node = null
    var closest_dist: float = 1e9
    for p in plants:
        if p.row == row_index and p.position.x < position.x:
            var dist = position.x - p.position.x
            if dist < closest_dist and dist <= attack_range:
                closest = p
                closest_dist = dist
    return closest

func take_damage(dmg: int) -> void:
    hp -= dmg
    # 读报僵尸首次被击后丢报加速（与浏览器版 newspaper 行为对齐）
    if not _newspaper_hit and ZombieTypes.get_type(type_id).get("newspaper_behavior", false):
        _newspaper_hit = true
        _news_speed = float(ZombieTypes.get_type(type_id).get("speed_after_hit", 30.0))
        speed = _news_speed
    # Flash white on hit
    _sprite.modulate = Color(1, 1, 1, 1)
    _hit_flash_timer = 0.15
    if hp <= 0 and not _dead:
        _dead = true
        _death_timer = 0.0

## 是否被攻击致死（用于 Main 判断"击杀得分"，区别于过关清理 queue_free）
func is_killed() -> bool:
    return _dead