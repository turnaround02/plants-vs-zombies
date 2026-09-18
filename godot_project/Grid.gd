class_name Grid
extends Node2D

# Grid parameters
@export var cell_width: int = 100
@export var cell_height: int = 120
@export var rows: int = 5
@export var cols: int = 9

# Offset from top-left of the panel (HUD height)
@export var grid_offset: Vector2 = Vector2(0, 60)

func _ready() -> void:
    # Nothing special needed
    pass

func _draw() -> void:
    # Draw vertical lines
    for x in cols + 1:
        var line_x = grid_offset.x + x * cell_width
        draw_line(Vector2(line_x, grid_offset.y), Vector2(line_x, grid_offset.y + rows * cell_height), Color(1,1,1,0.2), 1)
    # Draw horizontal lines
    for y in rows + 1:
        var line_y = grid_offset.y + y * cell_height
        draw_line(Vector2(grid_offset.x, line_y), Vector2(grid_offset.x + cols * cell_width, line_y), Color(1,1,1,0.2), 1)

func grid_to_world(cell: Vector2) -> Vector2:
    # Convert grid coordinates to world position (center of cell)
    return grid_offset + Vector2(cell.x * cell_width + cell_width / 2, cell.y * cell_height + cell_height / 2)

func world_to_grid(pos: Vector2) -> Vector2:
    # Convert world position to grid coordinates (cell index)
    var rel = pos - grid_offset
    var cell_x = int(rel.x / cell_width)
    var cell_y = int(rel.y / cell_height)
    if cell_x < 0 or cell_x >= cols or cell_y < 0 or cell_y >= rows:
        return Vector2(-1, -1) # invalid
    return Vector2(cell_x, cell_y)