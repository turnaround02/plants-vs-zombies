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
    if (!s) return { unlockedLevel: 1, totalScore: 0, totalKills: 0, wins: 0 };
    return {
      unlockedLevel: s.unlockedLevel || 1,
      totalScore: s.totalScore || 0,
      totalKills: s.totalKills || 0,
      wins: s.wins || 0,
    };
  }

  function addClearScore(levelId, score) {
    const s = load() || { unlockedLevel: 1, totalScore: 0, totalKills: 0, wins: 0, bestScores: {} };
    s.totalScore += score;
    s.unlockedLevel = Math.max(s.unlockedLevel, Math.min(levelId + 1, Object.keys(LEVELS).length));
    s.bestScores = s.bestScores || {};
    s.bestScores[levelId] = Math.max(s.bestScores[levelId] || 0, score);
    localStorage.setItem(KEY, JSON.stringify(s));
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

  return { load, getProgress, addClearScore, recordWin, recordKill, isLevelUnlocked };
})();
