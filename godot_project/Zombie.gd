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
    
    if not eating:
        position.x -= speed * delta
    # Check if we have reached the house
    if position.x <= 0:
        var main = get_tree().root.get_node("Main")
        if main:
            main.zombie_reached()
    # Update timers
    attack_timer += delta
    # Find target plant if not eating
    if not eating:
        var plant = _find_target_plant()
        if plant:
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
    # Flash white on hit
    _sprite.modulate = Color(1, 1, 1, 1)
    _hit_flash_timer = 0.15
    if hp <= 0 and not _dead:
        _dead = true
        _death_timer = 0.0

## 是否被攻击致死（用于 Main 判断"击杀得分"，区别于过关清理 queue_free）
func is_killed() -> bool:
    return _dead