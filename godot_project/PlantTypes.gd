extends Node

# Singleton: plant type definitions
var types: Dictionary = {
    "sunflower": {
        "name": "Sunflower",
        "icon": "🌻",
        "cost": 50,
        "hp": 100,
        "sun_produce_time": 9.0,
        "sun_amount": 25,
        "cooldown": 5000,
        "behavior": "sunProducer"
    },
    "peashooter": {
        "name": "Peashooter",
        "icon": "🌱",
        "cost": 100,
        "hp": 100,
        "damage": 20,
        "fire_rate": 1.2,
        "range": 400,
        "cooldown": 5000,
        "behavior": "shooter"
    },
    # 寒冰射手：发射冰冻豌豆，附加减速
    "snowpea": {
        "name": "Snowpea",
        "icon": "❄️",
        "cost": 175,
        "hp": 100,
        "damage": 20,
        "fire_rate": 1.4,
        "range": 400,
        "slow_factor": 0.5,
        "slow_duration": 3.0,
        "cooldown": 7000,
        "behavior": "shooter"
    },
    # 樱桃炸弹：一次性大范围爆炸
    "cherrybomb": {
        "name": "Cherry Bomb",
        "icon": "🍒",
        "cost": 150,
        "hp": 100,
        "damage": 180,
        "blast_radius": 120,
        "fuse_time": 1.0,
        "cooldown": 15000,
        "behavior": "bomb"
    },
    # 坚果墙：高耐久屏障（与浏览器版 PLANT_TYPES.wallnut 对齐）
    "wallnut": {
        "name": "Wall-nut",
        "icon": "🥜",
        "cost": 50,
        "hp": 400,
        "cooldown": 10000,
        "behavior": "wall"
    },
    # 双发豌豆：一次发射两颗子弹
    "repeater": {
        "name": "Repeater",
        "icon": "🔫",
        "cost": 200,
        "hp": 100,
        "damage": 20,
        "fire_rate": 1.4,
        "range": 400,
        "shots_per_fire": 2,
        "cooldown": 7000,
        "behavior": "shooter"
    },
    # 猫尾草：穿透子弹，攻击多个僵尸
    "catTail": {
        "name": "Cat Tail",
        "icon": "🌿",
        "cost": 25,
        "hp": 60,
        "damage": 15,
        "fire_rate": 1.8,
        "range": 400,
        "penetrate": true,
        "cooldown": 3000,
        "behavior": "shooter"
    },
    # 魅惑菇：接触僵尸即魅惑，随后消失
    "chaosShroom": {
        "name": "Chaos Shroom",
        "icon": "🍄",
        "cost": 25,
        "hp": 30,
        "cooldown": 5000,
        "behavior": "charm"
    },
    # 蘑菇射手：便宜快射，高频低攻
    "mushroomShooter": {
        "name": "Mushroom Shooter",
        "icon": "🍄",
        "cost": 30,
        "hp": 40,
        "damage": 10,
        "fire_rate": 1.0,
        "range": 350,
        "projectile_color": "#a1887f",
        "cooldown": 3000,
        "behavior": "shooter"
    },
    # 爆炸菇：大范围一次性爆炸
    "explosiveShroom": {
        "name": "Explosive Shroom",
        "icon": "💥",
        "cost": 225,
        "hp": 60,
        "damage": 300,
        "blast_radius": 180,
        "fuse_time": 1.5,
        "cooldown": 20000,
        "behavior": "bomb"
    },
    # 双射豌豆：攻击本行与相邻行
    "dualPea": {
        "name": "Dual Pea",
        "icon": "⚡",
        "cost": 150,
        "hp": 100,
        "damage": 20,
        "fire_rate": 1.4,
        "range": 400,
        "dual_row": true,
        "cooldown": 8000,
        "behavior": "shooter"
    }
}

func get_type(type_name: String) -> Dictionary:
    return types.get(type_name, {})

func get_all() -> Dictionary:
    return types
