extends Node
## 僵尸类型单例（与浏览器版 ZOMBIE_TYPES 对齐）

var types: Dictionary = {
    "normal":     { "hp": 100, "speed": 20.0, "damage": 10, "attack_interval": 0.8, "score": 10 },
    "cone":       { "hp": 200, "speed": 18.0, "damage": 12, "attack_interval": 0.8, "score": 20 },
    "runner":     { "hp": 80,  "speed": 42.0, "damage": 8,  "attack_interval": 0.6, "score": 15 },
    "bucket":     { "hp": 400, "speed": 16.0, "damage": 12, "attack_interval": 1.0, "score": 30 },
    "pole_vault": { "hp": 80,  "speed": 45.0, "damage": 8,  "attack_interval": 0.8, "score": 25, "jump_over_plant": true },
    "newspaper":  { "hp": 130, "speed": 18.0, "damage": 10, "attack_interval": 0.8, "score": 20, "newspaper_behavior": true, "speed_after_hit": 30.0 },
}

func get_type(type_id: String) -> Dictionary:
    return types.get(type_id, types["normal"])

func all_ids() -> Array:
    return types.keys()
