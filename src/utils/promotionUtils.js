/**
 * Promotion Utility Helpers for Ghana Educational System & Labour Edu
 */

/**
 * Find next class in Ghanaian school progression sequence
 * @param {string|number} currentClassId
 * @param {Array} allClasses
 * @returns {object|string|null} Next class object or 'Alumni' or null
 */
export const getNextClassForPromotion = (currentClassId, allClasses = []) => {
  if (!currentClassId || !allClasses || allClasses.length === 0) return null;

  const current = allClasses.find(c => String(c.id) === String(currentClassId));
  if (!current) return null;

  const hierarchyPatterns = [
    /creche/i,
    /nursery\s*1/i, /nursery\s*2/i,
    /kg\s*1/i, /kindergarten\s*1/i,
    /kg\s*2/i, /kindergarten\s*2/i,
    /basic\s*1|primary\s*1|class\s*1/i,
    /basic\s*2|primary\s*2|class\s*2/i,
    /basic\s*3|primary\s*3|class\s*3/i,
    /basic\s*4|primary\s*4|class\s*4/i,
    /basic\s*5|primary\s*5|class\s*5/i,
    /basic\s*6|primary\s*6|class\s*6/i,
    /basic\s*7|jhs\s*1|j\.h\.s\s*1/i,
    /basic\s*8|jhs\s*2|j\.h\.s\s*2/i,
    /basic\s*9|jhs\s*3|j\.h\.s\s*3/i,
    /shs\s*1|s\.h\.s\s*1/i,
    /shs\s*2|s\.h\.s\s*2/i,
    /shs\s*3|s\.h\.s\s*3/i
  ];

  const curName = (current.name || '').trim();
  const hierarchyIndex = hierarchyPatterns.findIndex(pattern => pattern.test(curName));

  if (hierarchyIndex !== -1 && hierarchyIndex < hierarchyPatterns.length - 1) {
    const nextPattern = hierarchyPatterns[hierarchyIndex + 1];
    const matchedNext = allClasses.find(c => nextPattern.test(c.name));
    if (matchedNext) return matchedNext;
  }

  // Match by number (e.g. "Basic 5" -> 5 -> next 6)
  const numMatch = curName.match(/\d+/);
  if (numMatch) {
    const currentNum = parseInt(numMatch[0], 10);
    const nextNum = currentNum + 1;
    const prefix = curName.replace(/\d+.*/, '').trim();
    const matchedByNum = allClasses.find(c => {
      const cNumMatch = (c.name || '').match(/\d+/);
      const cPrefix = (c.name || '').replace(/\d+.*/, '').trim();
      return (
        cNumMatch &&
        parseInt(cNumMatch[0], 10) === nextNum &&
        (cPrefix.toLowerCase() === prefix.toLowerCase() || prefix === '')
      );
    });
    if (matchedByNum) return matchedByNum;
  }

  // Fallback: next higher class in natural sorted array
  const sorted = [...allClasses].sort((a, b) =>
    (a.name || '').localeCompare(b.name || '', undefined, { numeric: true })
  );
  const curIdx = sorted.findIndex(c => String(c.id) === String(currentClassId));
  if (curIdx !== -1 && curIdx < sorted.length - 1) {
    return sorted[curIdx + 1];
  }

  return 'Alumni';
};

/**
 * Parses and formats the promotion decision string into a user-friendly object
 * Handles: Promotion, Promotion on Probation, Repeating current class, Graduation (Alumni)
 *
 * @param {string|number} promotedVal - e.g. "12", "12_probation", "11", "Alumni", "Basic 8"
 * @param {string|number} currentClassId - e.g. "11"
 * @param {Array} classes - list of class objects { id, name }
 * @returns {object|null} { text, type, badge, icon, color }
 */
export const formatPromotionDecision = (promotedVal, currentClassId, classes = []) => {
  if (!promotedVal) return null;
  const str = String(promotedVal).trim();
  if (!str || str === '—' || str === '-') return null;

  // Case 1: Alumni / Graduation
  if (str.toLowerCase() === 'alumni' || str.toLowerCase() === 'graduate') {
    return {
      type: 'graduated',
      text: 'Graduated / Completed (Alumni)',
      badge: 'Graduated',
      icon: 'fa-user-graduate',
      color: '#10B981'
    };
  }

  const isProbation = str.endsWith('_probation');
  const cleanId = str.replace('_probation', '');

  // Case 2: Repeating current class
  if (currentClassId && String(cleanId) === String(currentClassId)) {
    const currentClassObj = classes?.find(c => String(c.id) === String(currentClassId));
    const className = currentClassObj?.name || `Class ${currentClassId}`;
    return {
      type: 'repeat',
      text: `Repeat ${className}`,
      badge: 'Repeating',
      icon: 'fa-redo',
      color: '#D97706'
    };
  }

  // Case 3: Promotion to another class (regular or probation)
  const targetClassObj = classes?.find(c => String(c.id) === String(cleanId));
  const targetClassName = targetClassObj?.name || (isNaN(Number(cleanId)) ? cleanId : `Class ${cleanId}`);

  if (isProbation) {
    return {
      type: 'probation',
      text: `Promoted to ${targetClassName} (On Probation)`,
      badge: 'On Probation',
      icon: 'fa-exclamation-triangle',
      color: '#D97706'
    };
  }

  return {
    type: 'promoted',
    text: `Promoted to ${targetClassName}`,
    badge: 'Promoted',
    icon: 'fa-trophy',
    color: '#2563EB'
  };
};
