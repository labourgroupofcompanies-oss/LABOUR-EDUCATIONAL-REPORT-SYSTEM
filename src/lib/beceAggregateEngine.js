/**
 * BECE Best-6 Aggregate Performance Engine
 * Shared reusable engine for calculating projected BECE aggregates across
 * report card compilers, printed PDFs, Parent Portal, and school analytics.
 * 
 * Takes the exact grades calculated by the school's custom grading system for the 
 * 4 Core Subjects + Best 2 Electives and adds their grade values together.
 */

// Default Core Subjects for Ghanaian BECE / GES System
export const DEFAULT_CORE_SUBJECTS = [
  'English Language',
  'Mathematics',
  'Integrated Science',
  'Social Studies'
];

// Default Grade Point Mapping (A1=1 to F9=9)
export const DEFAULT_GRADE_POINTS = {
  'A1': 1, 'A+': 1, 'A': 1,
  'B2': 2, 'B+': 2, 'B': 2,
  'B3': 3,
  'C4': 4, 'C+': 4, 'C': 4,
  'C5': 5,
  'C6': 6,
  'D7': 7, 'D+': 7, 'D': 7,
  'E8': 8, 'E': 8,
  'F9': 9, 'F': 9
};

// Default Performance Levels
export const DEFAULT_PERFORMANCE_LEVELS = [
  { min: 6,  max: 9,   label: 'Outstanding',       color: '#10B981', bg: '#ECFDF5', badgeClass: 'badge-success' },
  { min: 10, max: 18,  label: 'Excellent',         color: '#2563eb', bg: '#EFF6FF', badgeClass: 'badge-info' },
  { min: 19, max: 30,  label: 'Very Good',         color: '#2563eb', bg: '#EFF6FF', badgeClass: 'badge-primary' },
  { min: 31, max: 36,  label: 'Good',              color: '#F59E0B', bg: '#FFFBEB', badgeClass: 'badge-warning' },
  { min: 37, max: 45,  label: 'Satisfactory',      color: '#F59E0B', bg: '#FFFBEB', badgeClass: 'badge-warning' },
  { min: 46, max: 999, label: 'Needs Improvement', color: '#EF4444', bg: '#FEF2F2', badgeClass: 'badge-danger' }
];

/**
 * Extracts the grade point (numeric value) directly from a school's assigned grade string.
 * Respects the school's existing grading system without re-evaluating raw mark thresholds.
 *
 * @param {string|number} grade - The grade already assigned on the report card (e.g. 'A1', 'B2', 'C4', 1, 2)
 * @param {number} totalScore - Raw score (used only for fallback tie-breaking)
 * @param {Array} gradingScale - Optional custom school grading scale
 * @returns {number} The numeric grade point value (1 to 9)
 */
export const calculateGradePoints = (grade, totalScore = null, gradingScale = null) => {
  if (grade === null || grade === undefined || grade === '' || grade === '—' || grade === '-') {
    return 9; // Fallback for un-graded subject
  }

  const strGrade = String(grade).trim().toUpperCase();

  // 1. Check if grade contains an explicit trailing/embedded digit (e.g. 'A1' -> 1, 'B2' -> 2, 'B3' -> 3, 'C4' -> 4, 'C5' -> 5, 'C6' -> 6, 'D7' -> 7, 'E8' -> 8, 'F9' -> 9)
  const matchDigit = strGrade.match(/\d+/);
  if (matchDigit) {
    const pt = parseInt(matchDigit[0], 10);
    if (pt >= 1 && pt <= 9) return pt;
  }

  // 2. Check if grade itself is a number 1..9
  const isNum = parseInt(strGrade, 10);
  if (!isNaN(isNum) && isNum >= 1 && isNum <= 9) {
    return isNum;
  }

  // 3. Check custom school grading scale if tier has an explicit point property
  if (Array.isArray(gradingScale)) {
    const tier = gradingScale.find(t => String(t.grade).trim().toUpperCase() === strGrade);
    if (tier && (tier.point || tier.gradePoint)) {
      return Number(tier.point || tier.gradePoint);
    }
  }

  // 4. Standard letter grade fallback mapping
  if (DEFAULT_GRADE_POINTS[strGrade] !== undefined) {
    return DEFAULT_GRADE_POINTS[strGrade];
  }

  return 9; // Default fallback point
};

/**
 * Determines the performance level label based on total aggregate score
 */
export const calculatePerformanceLevel = (aggregate, customLevels = null) => {
  const levels = Array.isArray(customLevels) && customLevels.length > 0
    ? customLevels
    : DEFAULT_PERFORMANCE_LEVELS;

  const numAgg = Number(aggregate);
  if (isNaN(numAgg) || numAgg <= 0) {
    return { label: 'Pending', color: '#64748b', bg: '#f1f5f9', badgeClass: 'badge-neutral' };
  }

  for (const tier of levels) {
    if (numAgg >= tier.min && numAgg <= tier.max) {
      return tier;
    }
  }

  return levels[levels.length - 1];
};

/**
 * Sorts and selects the best 2 elective subjects (lowest grade points / highest total score)
 */
export const selectBestElectiveSubjects = (electiveSubjects = []) => {
  if (!Array.isArray(electiveSubjects)) return [];

  const sorted = [...electiveSubjects].sort((a, b) => {
    // 1. Primary: Lowest Grade Points (1 is better than 9)
    if (a.gradePoint !== b.gradePoint) {
      return a.gradePoint - b.gradePoint;
    }
    // 2. Secondary: Highest Total Score (100 is better than 0)
    return (b.totalScore || 0) - (a.totalScore || 0);
  });

  return sorted.slice(0, 2);
};

/**
 * Normalizes subject names for fuzzy matching against core subject list
 */
const normalizeSubjectName = (name = '') => {
  return String(name)
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
};

/**
 * Checks if a subject matches any of the configured core subjects
 */
const isCoreSubject = (subjectName, configuredCores = DEFAULT_CORE_SUBJECTS) => {
  const normName = normalizeSubjectName(subjectName);
  
  return configuredCores.some(core => {
    const normCore = normalizeSubjectName(core);
    if (normName === normCore) return true;
    
    // Fuzzy matching keywords
    if (normCore.includes('english') && normName.includes('english')) return true;
    if (normCore.includes('math') && normName.includes('math')) return true;
    if (normCore.includes('science') && (normName.includes('science') || normName.includes('integratedscience'))) return true;
    if (normCore.includes('social') && (normName.includes('social') || normName.includes('socialstudies'))) return true;
    
    return false;
  });
};

/**
 * Calculates the Best-6 BECE Aggregate for a learner directly using the grades assigned
 * by the school's grading system for 4 Core Subjects + Best 2 Electives.
 * 
 * @param {Array} subjectResults - Array of subject objects: [{ subjectName, grade, totalScore }, ...]
 * @param {Object} schoolSettings - Optional custom school settings
 * @returns {Object} Full aggregate breakdown
 */
export const calculateBest6Aggregate = (subjectResults = [], schoolSettings = null) => {
  const enabled = schoolSettings?.enableBest6Aggregate !== false;
  
  if (!enabled || !Array.isArray(subjectResults) || subjectResults.length === 0) {
    return {
      enabled: false,
      aggregate_score: null,
      performance_level: { label: 'N/A', color: '#64748b', bg: '#f1f5f9' },
      best6_subjects: [],
      core_subjects: [],
      elective_subjects: [],
      best6_total_marks: 0,
      best6_average: 0,
      is_complete: false,
      missing_core_count: 0
    };
  }

  const configuredCores = Array.isArray(schoolSettings?.coreSubjects) && schoolSettings.coreSubjects.length > 0
    ? schoolSettings.coreSubjects
    : DEFAULT_CORE_SUBJECTS;

  // Extract grade points directly from the school's existing subject grades
  const processedSubjects = subjectResults.map(item => {
    const name = item.subjectName || item.name || 'Subject';
    const totalScore = item.totalScore !== undefined && item.totalScore !== null
      ? Number(item.totalScore)
      : (item.total !== undefined ? Number(item.total) : 0);
    const grade = item.grade || '—';
    const gradePoint = calculateGradePoints(grade, totalScore, schoolSettings?.gradingScale);
    const isCore = isCoreSubject(name, configuredCores);

    return {
      subjectName: name,
      grade,
      totalScore,
      gradePoint,
      isCore
    };
  });

  // Separate Core and Elective Subjects
  const coreSubjects = processedSubjects.filter(s => s.isCore);
  const electiveSubjects = processedSubjects.filter(s => !s.isCore);

  // Select top 2 Best Electives (lowest grade points)
  const bestElectives = selectBestElectiveSubjects(electiveSubjects);

  // Group Best 6 Subjects (4 Core + 2 Best Electives)
  const best6Subjects = [...coreSubjects, ...bestElectives];

  // Simply add the 6 grade point numbers together!
  const totalGradePoints = best6Subjects.reduce((sum, s) => sum + (s.gradePoint || 9), 0);
  const totalBest6Marks = best6Subjects.reduce((sum, s) => sum + (s.totalScore || 0), 0);
  const averageBest6Marks = best6Subjects.length > 0
    ? Math.round((totalBest6Marks / best6Subjects.length) * 10) / 10
    : 0;

  const performanceLevel = calculatePerformanceLevel(totalGradePoints, schoolSettings?.performanceLevels);
  const missingCoreCount = Math.max(0, 4 - coreSubjects.length);
  const isComplete = coreSubjects.length >= 4 && bestElectives.length >= 2;

  return {
    enabled: true,
    aggregate_score: totalGradePoints,
    performance_level: performanceLevel,
    best6_subjects: best6Subjects,
    core_subjects: coreSubjects,
    elective_subjects: bestElectives,
    best6_total_marks: totalBest6Marks,
    best6_average: averageBest6Marks,
    is_complete: isComplete,
    missing_core_count: missingCoreCount,
    disclaimer: 'Projected BECE Aggregate calculated by adding the school grades of the 4 Core + Best 2 Electives.'
  };
};

export default {
  calculateGradePoints,
  calculatePerformanceLevel,
  selectBestElectiveSubjects,
  calculateBest6Aggregate,
  DEFAULT_CORE_SUBJECTS,
  DEFAULT_GRADE_POINTS,
  DEFAULT_PERFORMANCE_LEVELS
};
