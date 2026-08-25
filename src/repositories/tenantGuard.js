/**
 * Enterprise Multi-Tenant Guard
 * Validates that every operation contains a valid, non-null school context.
 */
export const assertSchoolContext = (schoolId, actionName = 'Database Operation') => {
  if (!schoolId || String(schoolId).trim() === '' || schoolId === 'null' || schoolId === 'undefined') {
    const errorMsg = `[TENANT GUARD FAILURE] ${actionName} rejected: Valid schoolId context is missing or unauthenticated.`;
    console.error(errorMsg);
    throw new Error(errorMsg);
  }
  return String(schoolId).trim();
};
