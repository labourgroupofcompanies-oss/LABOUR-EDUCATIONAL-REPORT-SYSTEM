/**
 * Ghanaian Language Management Utilities
 * Handles learner language options (Twi, Ewe, Ga, Fante, etc.)
 * Filters subject entry lists and terminal report card rows.
 */

export const GHANAIAN_LANGUAGE_OPTIONS = [
  { id: 'twi',     label: '🇬🇭 Twi' },
  { id: 'ewe',     label: '🇬🇭 Ewe' },
  { id: 'ga',      label: '🇬🇭 Ga' },
  { id: 'fante',   label: '🇬🇭 Fante' },
  { id: 'nzema',   label: '🇬🇭 Nzema' },
  { id: 'dagbani', label: '🇬🇭 Dagbani' },
  { id: 'none',    label: '🚫 N/A' },
];

/**
 * Normalizes language string
 */
export const getLearnerLanguage = (learner) => {
  const raw = learner?.ghanaianLanguage || learner?.ghanaian_language || learner?.language;
  if (!raw) return 'twi'; // Default to Twi if unspecified
  const clean = String(raw).trim().toLowerCase();
  return clean || 'twi';
};

/**
 * Checks if a subject is a specific Ghanaian language subject
 */
export const getSubjectLanguageType = (subjectName) => {
  if (!subjectName) return null;
  const s = String(subjectName).trim().toLowerCase();
  
  if (s.includes('ewe') || s.includes('eʋe') || s.includes('eʋegbe')) return 'ewe';
  if (s.includes('twi') || s.includes('asante') || s.includes('akuapem')) return 'twi';
  if (s.includes('fante')) return 'fante';
  if (s.includes('nzema')) return 'nzema';
  if (s.includes('dagbani')) return 'dagbani';
  if (s.includes('ga') && !s.includes('organ') && !s.includes('gar')) return 'ga';

  return null;
};

/**
 * Filters class subjects for a specific learner's report card.
 * Hides Twi for an Ewe learner, hides Ewe for a Twi learner, etc.
 * If learner has language 'none', hides ALL language-specific subjects.
 */
export const filterSubjectsForLearner = (subjectsList = [], learner = {}) => {
  if (!Array.isArray(subjectsList)) return [];
  const learnerLang = getLearnerLanguage(learner);

  return subjectsList.filter(subj => {
    const subjName = subj?.name || subj?.subjectName || '';
    const subjLang = getSubjectLanguageType(subjName);

    // If it's not a specific local language subject, keep it for all learners
    if (!subjLang) return true;

    // If learner is set to 'none' (N/A), exclude ALL language-specific subjects
    if (learnerLang === 'none') return false;

    // If it is a specific local language subject, keep it ONLY if it matches the learner's language
    return subjLang === learnerLang;
  });
};

/**
 * Filters learner list for a specific subject score entry portal.
 * Shows ONLY Ewe learners when Ewe score entry is open, ONLY Twi learners for Twi score entry, etc.
 * Learners with language 'none' are excluded from ALL language-specific score portals.
 */
export const filterLearnersForSubject = (learnersList = [], subject = {}) => {
  if (!Array.isArray(learnersList)) return [];
  const subjName = subject?.name || subject?.subjectName || '';
  const subjLang = getSubjectLanguageType(subjName);

  // If the subject is general (Math, English, Science, etc.), include all learners
  if (!subjLang) return learnersList;

  // If the subject is language-specific (Twi/Ewe/Ga/Fante), include only learners matching that option
  return learnersList.filter(learner => {
    const learnerLang = getLearnerLanguage(learner);
    // Exclude learners with 'none' language from ALL specific language subjects
    if (learnerLang === 'none') return false;
    return learnerLang === subjLang;
  });
};

/**
 * Gets a human-friendly label for a language id
 */
export const getLanguageLabel = (langId) => {
  const clean = (langId || 'twi').toString().trim().toLowerCase();
  const opt = GHANAIAN_LANGUAGE_OPTIONS.find(o => o.id === clean);
  return opt ? opt.label : '🇬🇭 Twi';
};

/**
 * Gets the clean language name without emojis
 */
export const getLanguageName = (langId) => {
  const clean = (langId || 'twi').toString().trim().toLowerCase();
  switch (clean) {
    case 'twi': return 'Twi';
    case 'ewe': return 'Ewe';
    case 'ga': return 'Ga';
    case 'fante': return 'Fante';
    case 'nzema': return 'Nzema';
    case 'dagbani': return 'Dagbani';
    case 'none': return 'N/A';
    default: return 'Twi';
  }
};

/**
 * Formats subject name for display on terminal report cards.
 * If the school's subject catalog uses a generic name like "Ghanaian Language",
 * it appends the student's chosen language e.g. "Ghanaian Language (Twi)".
 */
export const formatSubjectNameForLearner = (subjectName, learner) => {
  if (!subjectName) return '';
  const s = String(subjectName).trim();
  const sLower = s.toLowerCase();
  
  const isGenericLanguageSubject = 
    sLower === 'ghanaian language' || 
    sLower === 'ghanaian language & culture' || 
    sLower === 'ghanaian language and culture' || 
    sLower === 'local language' ||
    sLower === 'gh language';

  if (isGenericLanguageSubject) {
    const lang = getLearnerLanguage(learner);
    if (lang === 'none') return s;
    const langName = getLanguageName(lang);
    return `${s} (${langName})`;
  }

  return s;
};
