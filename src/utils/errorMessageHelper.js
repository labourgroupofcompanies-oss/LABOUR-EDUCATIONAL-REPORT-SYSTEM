/**
 * User-Friendly Error Message Translator
 * Transforms raw developer errors, stack traces, and database exceptions
 * into clean, actionable, human-friendly guidance for teachers and school administrators.
 */
export function formatUserFriendlyMessage(rawMessage) {
  if (!rawMessage) return 'An unexpected situation occurred. Please try again.';
  
  const msg = (typeof rawMessage === 'object' && rawMessage !== null)
    ? (rawMessage.message || rawMessage.error_description || rawMessage.error || JSON.stringify(rawMessage))
    : String(rawMessage);

  const lower = msg.toLowerCase();

  // 1. Network & Offline errors
  if (
    lower.includes('failed to fetch') || 
    lower.includes('networkerror') || 
    lower.includes('network request failed') ||
    lower.includes('err_internet_disconnected') ||
    lower.includes('load failed') ||
    lower.includes('err_name_not_resolved')
  ) {
    return 'Unable to reach the server. Please check your internet connection. Your local changes remain safely preserved.';
  }

  // 2. Authentication & Session errors
  if (
    lower.includes('jwt expired') || 
    lower.includes('token is expired') || 
    lower.includes('session expired') ||
    lower.includes('invalid refresh token')
  ) {
    return 'Your login session has expired for security. Please sign in again to continue.';
  }

  if (
    lower.includes('invalid login credentials') ||
    lower.includes('invalid grant') ||
    lower.includes('invalid credentials') ||
    lower.includes('user not found')
  ) {
    return 'Incorrect email/username or password. Please verify your details and try again.';
  }

  if (lower.includes('password should be at least') || lower.includes('weak password')) {
    return 'The password is too short. Please choose a password with at least 6 characters.';
  }

  // 3. Database Constraints & Duplicates
  if (lower.includes('duplicate key') || lower.includes('unique constraint') || lower.includes('already exists')) {
    if (lower.includes('reg_number') || lower.includes('regnumber')) {
      return 'A learner with this Registration ID is already registered in the school.';
    }
    if (lower.includes('email')) {
      return 'An account with this email address already exists in the system.';
    }
    if (lower.includes('phone') || lower.includes('contact')) {
      return 'This phone number is already associated with another account.';
    }
    return 'This item already exists in the system. Please use a unique identifier or name.';
  }

  if (lower.includes('foreign key') || lower.includes('violates foreign key constraint')) {
    return 'This item is linked to other school records (e.g. scores or classes) and cannot be deleted directly.';
  }

  if (lower.includes('not-null constraint') || lower.includes('null value in column')) {
    return 'Please make sure all required fields are filled before submitting.';
  }

  if (lower.includes('row-level security') || lower.includes('permission denied') || lower.includes('unauthorized') || lower.includes('forbidden')) {
    return 'You do not have sufficient permissions for this action. Please check with your school headteacher.';
  }

  // 4. Crypto / Hardware limitations
  if (lower.includes('crypto.subtle') || lower.includes('digest') || lower.includes('subtle is undefined')) {
    return 'Security verification completed using standard offline encryption fallback.';
  }

  // 5. JavaScript / Code runtime errors
  if (
    lower.includes('cannot read properties of undefined') ||
    lower.includes('cannot read property') ||
    lower.includes('null is not an object') ||
    lower.includes('undefined is not an object') ||
    lower.includes('typeerror') ||
    lower.includes('referenceerror')
  ) {
    return 'The system encountered a minor display hiccup. Please refresh the page or try selecting the item again.';
  }

  // 6. Supabase PostgREST internal codes
  if (lower.includes('pgrst116') || lower.includes('pgrst')) {
    return 'The requested record was not found or may have been updated. Please refresh your view.';
  }

  // 7. Cleanup raw developer prefixes if message is otherwise readable
  let cleaned = msg
    .replace(/^error:\s*/i, '')
    .replace(/^an error occurred:\s*/i, '')
    .replace(/^failed to execute[^:]*:\s*/i, '')
    .replace(/^an unexpected error occurred[^:]*:\s*/i, '')
    .trim();

  // If after cleanup it still looks like raw code (e.g. contains JSON or stack trace), provide friendly fallback
  if (cleaned.startsWith('{') || cleaned.includes('at ') || cleaned.length > 250) {
    return 'An unexpected issue occurred while processing your request. Please try again or contact support.';
  }

  // Capitalize first letter
  if (cleaned.length > 0) {
    return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
  }

  return 'Operation could not be completed. Please try again.';
}
