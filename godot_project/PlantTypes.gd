extends Node

# Singleton: plant type definitions
var types: Dictionary = {
    "sunflower": {
        "name": "Sunflower",
        "icon": "🌻",
        "cost": 50,
        "hp": 100,
        "sun_produce_time": 8.0,
        "sun_amount": 25,
        "behavior": "sunProducer"
    },
    "peashooter": {
        "name": "Peashooter",
        "icon": "🌱",
        "cost": 100,
        "hp": 100,
        "damage": 2,
        "fire_rate": 1.2,
        "range": 400,
        "behavior": "shooter"
    },
    "wall-nut": {
        "name": "Wall-nut",
        "icon": "🥜",
        "cost": 50,
        "hp": 400,
        "behavior": "wall"
    }
}

func get_type(type_name: String) -> Dictionary:
    return types.get(type_name, {})

func get_all() -> Dictionary:
    return types
