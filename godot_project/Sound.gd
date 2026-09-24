extends Node

## 运行时程序化合成音效（对齐浏览器 js/sound.js 的 Web Audio playTone）
## 不依赖任何音频素材文件：按「频率/时长/波形/音量/延迟」生成 PCM 后用 AudioStreamWAV 播放。

var enabled: bool = true
const MIX_RATE: int = 44100
const PLAYER_POOL: int = 8   # 同时可叠加播放的音效数

var _players: Array[AudioStreamPlayer] = []
var _next: int = 0
var _cache: Dictionary = {}   # 音效名 -> AudioStreamWAV（避免每次重算 PCM）

## 播放一组音调（带缓存；池中轮转，支持叠加）
func _play_cached(key: String, tones: Array) -> void:
	if not enabled:
		return
	if _players.is_empty():
		return
	var stream: AudioStreamWAV = _cache.get(key)
	if stream == null:
		stream = _build_stream(tones)
		_cache[key] = stream
	var p := _players[_next]
	_next = (_next + 1) % _players.size()
	p.stream = stream
	p.play()

func _ready() -> void:
	# 音效不受暂停影响（暂停时仍需播放已触发的音效）
	process_mode = Node.PROCESS_MODE_ALWAYS
	# 预建播放器池，支持多个音效叠加
	for _i in range(PLAYER_POOL):
		var p := AudioStreamPlayer.new()
		p.process_mode = Node.PROCESS_MODE_ALWAYS
		add_child(p)
		_players.append(p)

func set_enabled(v: bool) -> void:
	enabled = v

func is_enabled() -> bool:
	return enabled

## 构造单个音调描述（对齐 playTone(freq, duration, type, volume, delay)）
func _t(freq: float, duration: float, wave: String, volume: float, delay: float = 0.0) -> Dictionary:
	return {"freq": freq, "duration": duration, "wave": wave, "volume": volume, "delay": delay}

## 将一组音调合成为一段 PCM，返回 AudioStreamWAV
func _build_stream(tones: Array) -> AudioStreamWAV:
	var total: float = 0.0
	for t in tones:
		total = maxf(total, float(t["delay"]) + float(t["duration"]))
	var n: int = int((total + 0.05) * MIX_RATE)
	var buf := PackedFloat32Array()
	buf.resize(n)
	buf.fill(0.0)
	for t in tones:
		var start: int = int(float(t["delay"]) * MIX_RATE)
		var count: int = int(float(t["duration"]) * MIX_RATE)
		var freq: float = float(t["freq"])
		var wave: String = t["wave"]
		var vol: float = float(t["volume"])
		var dur: float = float(t["duration"])
		for i in range(count):
			var time: float = float(i) / float(MIX_RATE)
			var phase: float = time * freq
			var s: float = 0.0
			match wave:
				"square":
					s = 1.0 if fmod(phase, 1.0) < 0.5 else -1.0
				"triangle":
					s = 4.0 * abs(fmod(phase, 1.0) - 0.5) - 1.0
				"sawtooth":
					s = 2.0 * fmod(phase, 1.0) - 1.0
				_:
					s = sin(phase * TAU)
			# 指数衰减包络，近似 Web Audio 的 exponentialRampToValueAtTime(0.001)
			var env: float = exp(-3.0 * time / maxf(0.001, dur))
			var idx: int = start + i
			if idx < n:
				buf[idx] += s * vol * env
	# 转 16-bit PCM
	var bytes := PackedByteArray()
	bytes.resize(n * 2)
	for i in range(n):
		var v: float = clampf(buf[i], -1.0, 1.0)
		bytes.encode_s16(i * 2, int(v * 32767.0))
	var stream := AudioStreamWAV.new()
	stream.format = AudioStreamWAV.FORMAT_16_BITS
	stream.mix_rate = MIX_RATE
	stream.stereo = false
	stream.data = bytes
	return stream

# ============================================================
# 11 个音效（数值严格照搬 js/sound.js）
# ============================================================

func click() -> void:
	_play_cached("click", [_t(600, 0.08, "square", 0.08)])

func place_plant() -> void:
	_play_cached("place", [_t(400, 0.15, "triangle", 0.15), _t(600, 0.1, "triangle", 0.1, 0.08)])

func collect_sun() -> void:
	_play_cached("sun", [_t(880, 0.12, "sine", 0.12), _t(1320, 0.15, "sine", 0.1, 0.06)])

func shoot() -> void:
	_play_cached("shoot", [_t(200, 0.06, "square", 0.05)])

func zombie_hit() -> void:
	_play_cached("hit", [_t(150, 0.08, "sawtooth", 0.06)])

func zombie_eat() -> void:
	_play_cached("eat", [_t(90, 0.12, "sawtooth", 0.1)])

func explosion() -> void:
	_play_cached("explosion", [_t(80, 0.4, "sawtooth", 0.2), _t(50, 0.5, "square", 0.15, 0.05)])

func zombie_die() -> void:
	_play_cached("die", [_t(300, 0.2, "sawtooth", 0.08), _t(150, 0.3, "sawtooth", 0.08, 0.1)])

func wave_start() -> void:
	_play_cached("wave", [_t(440, 0.2, "triangle", 0.12), _t(660, 0.25, "triangle", 0.12, 0.15)])

func win() -> void:
	var tones: Array = []
	var freqs := [523.0, 659.0, 784.0, 1047.0]
	for i in range(freqs.size()):
		tones.append(_t(freqs[i], 0.3, "triangle", 0.15, i * 0.15))
	_play_cached("win", tones)

func lose() -> void:
	var tones: Array = []
	var freqs := [400.0, 350.0, 300.0, 200.0]
	for i in range(freqs.size()):
		tones.append(_t(freqs[i], 0.35, "sawtooth", 0.12, i * 0.2))
	_play_cached("lose", tones)
