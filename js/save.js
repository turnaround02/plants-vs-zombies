// ============================================================
// 存档系统 - localStorage 持久化玩家进度
// ============================================================
const SaveStore = (() => {
  const KEY = 'pvz_save_v1';

  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return null;
      return JSON.parse(raw);
    } catch (e) {
      return null;
    }
  }

  function getProgress() {
    const s = load();
    if (!s) return { unlockedLevel: 1, totalScore: 0, totalKills: 0, wins: 0, bestScores: {} };
    return {
      unlockedLevel: s.unlockedLevel || 1,
      totalScore: s.totalScore || 0,
      totalKills: s.totalKills || 0,
      wins: s.wins || 0,
      bestScores: s.bestScores || {},
    };
  }

  // 返回某关的最佳分（未通过则 null）
  function bestScore(levelId) {
    const s = load();
    if (!s || !s.bestScores || s.bestScores[levelId] == null) return null;
    return s.bestScores[levelId];
  }

  function addClearScore(levelId, score, stars) {
    const s = load() || { unlockedLevel: 1, totalScore: 0, totalKills: 0, wins: 0, bestScores: {} };
    // 兼容仅含 checkpoints 的存档（如中途保存检查点后通关），缺失字段需初始化，避免 NaN
    s.totalScore = (s.totalScore || 0) + score;
    s.unlockedLevel = Math.max(s.unlockedLevel || 1, Math.min(levelId + 1, Object.keys(LEVELS).length));
    s.bestScores = s.bestScores || {};
    const prev = s.bestScores[levelId];
    const prevScore = typeof prev === 'number' ? prev : (prev?.score || 0);
    const prevStars = (typeof prev === 'object' && prev.stars) || 0;
    s.bestScores[levelId] = {
      score: Math.max(prevScore, score),
      stars: Math.max(prevStars, stars || 0),
    };
    localStorage.setItem(KEY, JSON.stringify(s));
  }

  // 返回某关的最佳（{score, stars}），未通过则 null。
  // 兼容旧存档：bestScores[levelId] 可能是纯数字（只有 score，无 stars）
  function bestScore(levelId) {
    const s = load();
    const entry = s && s.bestScores && s.bestScores[levelId];
    if (entry == null) return null;
    return typeof entry === 'number' ? { score: entry, stars: 0 } : entry;
  }

  // 返回某关的星级（0-3），未通关返回 0
  function bestStars(levelId) {
    const entry = bestScore(levelId);
    return entry ? (entry.stars || 0) : 0;
  }

  function recordWin() {
    const s = load() || { unlockedLevel: 1, totalScore: 0, totalKills: 0, wins: 0 };
    s.wins = (s.wins || 0) + 1;
    localStorage.setItem(KEY, JSON.stringify(s));
  }

  function recordKill() {
    const s = load() || { unlockedLevel: 1, totalScore: 0, totalKills: 0, wins: 0 };
    s.totalKills = (s.totalKills || 0) + 1;
    localStorage.setItem(KEY, JSON.stringify(s));
  }

  function isLevelUnlocked(levelId) {
    const p = getProgress();
    return levelId <= p.unlockedLevel;
  }

  // 检查点存档：关卡中段自动保存，失败后可恢复
  function saveCheckpoint(levelId, waveIndex, sun, plants, zombies) {
    const s = load() || { checkpoints: {} };
    s.checkpoints = s.checkpoints || {};
    s.checkpoints[levelId] = {
      waveIndex, sun, plants, zombies, ts: Date.now(),
    };
    localStorage.setItem(KEY, JSON.stringify(s));
  }

  function loadCheckpoint(levelId) {
    const s = load();
    if (!s || !s.checkpoints || !s.checkpoints[levelId]) return null;
    return s.checkpoints[levelId];
  }

  function clearCheckpoint(levelId) {
    const s = load();
    if (s && s.checkpoints && s.checkpoints[levelId]) {
      delete s.checkpoints[levelId];
      localStorage.setItem(KEY, JSON.stringify(s));
    }
  }

  return { load, getProgress, bestScore, bestStars, addClearScore, recordWin, recordKill, isLevelUnlocked, saveCheckpoint, loadCheckpoint, clearCheckpoint };
})();
