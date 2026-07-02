function getLatestSession(participant) {
  const sessions = Array.isArray(participant?.sessions) ? participant.sessions : [];
  return sessions.find((session) => session.sessionId) || null;
}

function computeKpis(participants) {
  const list = Array.isArray(participants) ? participants : [];
  const specialtyCounts = {};
  const verdictCounts = {};
  let completedCount = 0;
  let totalScore = 0;
  let totalResponseTimeMs = 0;
  let totalAnswers = 0;
  let timeoutCount = 0;
  let correctScoredAnswers = 0;
  let scoredAnswers = 0;

  for (const participant of list) {
    const specialty = participant.specialty || "Non renseigné";
    specialtyCounts[specialty] = (specialtyCounts[specialty] || 0) + 1;

    const session = getLatestSession(participant);
    if (!session) continue;

    completedCount += 1;
    totalScore += Number(session.score) || 0;

    const verdict = session.verdict || "Inconnu";
    verdictCounts[verdict] = (verdictCounts[verdict] || 0) + 1;

    for (const answer of session.answers || []) {
      totalAnswers += 1;
      totalResponseTimeMs += Number(answer.responseTimeMs) || 0;
      if (answer.timedOut) timeoutCount += 1;
      if (answer.scored !== false) {
        scoredAnswers += 1;
        if (answer.isFit) correctScoredAnswers += 1;
      }
    }
  }

  const registeredCount = list.length;
  const completionRate = registeredCount
    ? Math.round((completedCount / registeredCount) * 100)
    : 0;
  const averageScore = completedCount ? Math.round((totalScore / completedCount) * 10) / 10 : 0;
  const averageResponseTimeSec = totalAnswers
    ? Math.round((totalResponseTimeMs / totalAnswers / 1000) * 10) / 10
    : 0;
  const accuracyRate = scoredAnswers
    ? Math.round((correctScoredAnswers / scoredAnswers) * 100)
    : 0;

  return {
    registeredCount,
    completedCount,
    pendingCount: registeredCount - completedCount,
    completionRate,
    averageScore,
    averageResponseTimeSec,
    timeoutCount,
    accuracyRate,
    specialtyCounts,
    verdictCounts
  };
}

module.exports = {
  computeKpis,
  getLatestSession
};
