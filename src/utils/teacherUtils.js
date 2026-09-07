/**
 * teacherUtils.js
 * Utility helpers to resolve teacher IDs and assignments across local Dexie and Supabase.
 */

/**
 * Returns a Set of all possible identifier values for a teacher user.
 * This handles differences between:
 * - Supabase Auth UID (user.id)
 * - Locally generated profile UUIDs (p.id)
 * - Staff IDs (user.staffId / p.staff_id)
 * - String vs numeric representations
 * 
 * @param {Object} user Current authenticated user from AuthContext
 * @param {Object} db Dexie database instance
 * @returns {Promise<Set<string|number>>} Set of identifier tokens
 */
export async function getTeacherIdentifierSet(user, db) {
  const ids = new Set();
  if (!user) return ids;

  if (user.id !== undefined && user.id !== null) {
    ids.add(user.id);
    ids.add(String(user.id));
    if (!isNaN(Number(user.id))) ids.add(Number(user.id));
  }
  if (user.staffId) {
    ids.add(user.staffId);
    ids.add(String(user.staffId));
  }

  if (db && db.profiles) {
    try {
      const sId = String(user.schoolId || '');
      const email = user.email ? String(user.email).toLowerCase().trim() : '';
      const staffId = user.staffId ? String(user.staffId).trim() : '';

      const matchingProfiles = await db.profiles
        .filter(p => {
          if (!p) return false;
          if (sId && p.schoolId && String(p.schoolId) !== sId) return false;
          if (p.id && (String(p.id) === String(user.id) || p.id === user.id)) return true;
          if (email && p.email && String(p.email).toLowerCase().trim() === email) return true;
          if (staffId && (p.staffId === staffId || p.staff_id === staffId)) return true;
          return false;
        })
        .toArray();

      for (const p of matchingProfiles) {
        if (p.id !== undefined && p.id !== null) {
          ids.add(p.id);
          ids.add(String(p.id));
          if (!isNaN(Number(p.id))) ids.add(Number(p.id));
        }
        if (p.staffId) {
          ids.add(p.staffId);
          ids.add(String(p.staffId));
        }
        if (p.staff_id) {
          ids.add(p.staff_id);
          ids.add(String(p.staff_id));
        }
      }
    } catch (err) {
      console.warn('[teacherUtils] Error resolving teacher profiles:', err);
    }
  }

  return ids;
}

/**
 * Checks if a teacher assignment belongs to the current user.
 * 
 * @param {Object} assignment Teacher assignment record
 * @param {Set<string|number>} idSet Set of teacher IDs from getTeacherIdentifierSet
 * @param {Object} user Current authenticated user
 * @returns {boolean}
 */
export function isAssignmentForTeacher(assignment, idSet, user) {
  if (!assignment) return false;
  if (user?.schoolId && assignment.schoolId && String(assignment.schoolId) !== String(user.schoolId)) {
    return false;
  }
  if (!idSet || idSet.size === 0) {
    return String(assignment.teacherId) === String(user?.id);
  }
  return idSet.has(assignment.teacherId) ||
         idSet.has(String(assignment.teacherId)) ||
         (!isNaN(Number(assignment.teacherId)) && idSet.has(Number(assignment.teacherId)));
}
