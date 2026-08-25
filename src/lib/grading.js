/**
 * Dynamic Assessment Calculation Engine
 * Replaces hardcoded logic with dynamic database-driven configurations.
 */

/**
 * Calculates the Continuous Assessment (CA) Score based on the selected model.
 * @param {number[]} caScores - Array of raw scores (assumed to be out of 100).
 * @param {object} settings - Global settings object.
 * @returns {number} The computed and scaled CA score.
 */
export const calculateCaTotal = (caScores = [], settings) => {
  if (!settings || !settings.caBreakdown || !caScores.length) return 0;
  
  // Use strictly the active breakdown (ignore enabled flag, filter by count > 0)
  const activeBreakdown = Array.isArray(settings.caBreakdown) ? settings.caBreakdown : [];
  const enabledComponents = activeBreakdown.filter(c => c && Number(c.count) > 0);

  // Generate a flat list of column descriptors
  const columns = [];
  enabledComponents.forEach(component => {
    const count = Number(component.count) || 0;
    for (let i = 0; i < count; i++) {
      columns.push({
        componentId: component.id,
        maxScore: component.maxScore || 100
      });
    }
  });

  // Map entered scores to their respective columns
  const items = [];
  caScores.forEach((score, index) => {
    const raw = parseFloat(score);
    if (!isNaN(raw) && columns[index]) {
      items.push({
        raw,
        max: columns[index].maxScore,
        componentId: columns[index].componentId,
        percentage: (raw / columns[index].maxScore) * 100
      });
    }
  });

  if (items.length === 0) return 0;

  let averagePercentage = 0;

  if (settings.caModel === 'simple_mean') {
    // Simple Mean: Sum of all entered raw scores divided by sum of their respective max scores
    const sumRaw = items.reduce((acc, item) => acc + item.raw, 0);
    const sumMax = items.reduce((acc, item) => acc + item.max, 0);
    if (sumMax === 0) return 0;
    averagePercentage = (sumRaw / sumMax) * 100;
  } else {
    // Best N Model: Select the top N scored items in EACH component category, sum them up, and find total %
    const bestN = Number(settings.caBestNCount) || 1;
    
    // Group entered scores by component ID (e.g., exercises, tests...)
    const groups = {};
    items.forEach(item => {
      if (!groups[item.componentId]) {
        groups[item.componentId] = [];
      }
      groups[item.componentId].push(item);
    });
    
    const selectedItems = [];
    
    // For each component category, sort descending by percentage score and take top N
    Object.values(groups).forEach(groupItems => {
      const sorted = [...groupItems].sort((a, b) => b.percentage - a.percentage);
      const topN = sorted.slice(0, bestN);
      selectedItems.push(...topN);
    });
    
    const sumRaw = selectedItems.reduce((acc, item) => acc + item.raw, 0);
    const sumMax = selectedItems.reduce((acc, item) => acc + item.max, 0);
    
    if (sumMax === 0) return 0;
    averagePercentage = (sumRaw / sumMax) * 100;
  }

  // Scale the final percentage to the configured caWeight
  const scaledScore = averagePercentage * (settings.caWeight / 100);
  return Math.round(scaledScore);
};

/**
 * Scales the raw Exam Score to the configured Exam Weight.
 * @param {number} examScore - Raw exam score out of 100.
 * @param {object} settings - Global settings object.
 * @returns {number}
 */
export const calculateExamTotal = (examScore, settings) => {
  if (!settings || isNaN(parseFloat(examScore))) return 0;
  const raw = parseFloat(examScore);
  const scaled = raw * (settings.examWeight / 100);
  return Math.round(scaled);
};

/**
 * Calculates the final Total Score (CA + Exam).
 */
export const calculateTotal = (caTotal, examTotal) => {
  return Math.round((parseFloat(caTotal) || 0) + (parseFloat(examTotal) || 0));
};

export const DEFAULT_GRADING_SCALE = [
  { min: 80, max: 100, grade: '1', remark: 'HIGHEST' },
  { min: 70, max: 79,  grade: '2', remark: 'HIGHER' },
  { min: 60, max: 69,  grade: '3', remark: 'HIGH' },
  { min: 55, max: 59,  grade: '4', remark: 'HIGH AVERAGE' },
  { min: 50, max: 54,  grade: '5', remark: 'AVERAGE' },
  { min: 40, max: 49,  grade: '6', remark: 'LOW AVERAGE' },
  { min: 35, max: 39,  grade: '7', remark: 'LOW' },
  { min: 30, max: 34,  grade: '8', remark: 'LOWER' },
  { min: 0,  max: 29,  grade: '9', remark: 'LOWEST' }
];

/**
 * Evaluates the total score against the dynamic grading scale.
 * @param {number} total - The total score.
 * @param {Array} gradingScale - Array of grading tiers sorted descending by min score.
 */
export const calculateGrade = (total, gradingScale = []) => {
  const activeScale = (Array.isArray(gradingScale) && gradingScale.length > 0) ? gradingScale : DEFAULT_GRADING_SCALE;

  for (const tier of activeScale) {
    if (total >= tier.min) {
      return { grade: tier.grade, remark: tier.remark };
    }
  }

  const lowest = activeScale[activeScale.length - 1];
  return { grade: lowest.grade, remark: lowest.remark };
};
