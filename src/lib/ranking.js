/**
 * Ranking utility for calculating positions in class
 */

export const calculatePositions = (scores) => {
  // scores: Array of { learnerId, totalScore }
  
  // 1. Sort by total score descending
  const sorted = [...scores].sort((a, b) => b.totalScore - a.totalScore);
  
  // 2. Assign positions (handle ties)
  let currentPos = 1;
  return sorted.map((score, index) => {
    if (index > 0 && score.totalScore < sorted[index - 1].totalScore) {
      currentPos = index + 1;
    }
    return {
      ...score,
      position: currentPos
    };
  });
};
