-- Migration: Add secure parent portal phone verification RPC
-- Date: 2026-05-22

CREATE OR REPLACE FUNCTION public.get_learners_by_guardian_contact(p_contact TEXT)
RETURNS TABLE (
  id UUID,
  school_id TEXT,
  reg_number TEXT,
  full_name TEXT,
  gender TEXT,
  class_id INTEGER,
  photo_url TEXT,
  guardian_name TEXT,
  guardian_relation TEXT,
  guardian_contact_1 TEXT,
  guardian_contact_2 TEXT,
  guardian_profession TEXT,
  guardian_location TEXT
) AS $$
DECLARE
  v_clean_contact TEXT;
BEGIN
  -- Extract last 9 digits of the search contact, removing any non-digits
  v_clean_contact := substring(regexp_replace(p_contact, '[^0-9]', '', 'g') from '([0-9]{9})$');
  
  IF v_clean_contact IS NULL OR length(v_clean_contact) < 9 THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT 
    l.id,
    l.school_id,
    l.reg_number,
    l.full_name,
    l.gender,
    l.class_id,
    l.photo_url,
    l.guardian_name,
    l.guardian_relation,
    l.guardian_contact_1,
    l.guardian_contact_2,
    l.guardian_profession,
    l.guardian_location
  FROM 
    public.report_learners l
  WHERE 
    substring(regexp_replace(COALESCE(l.guardian_contact_1, ''), '[^0-9]', '', 'g') from '([0-9]{9})$') = v_clean_contact
    OR substring(regexp_replace(COALESCE(l.guardian_contact_2, ''), '[^0-9]', '', 'g') from '([0-9]{9})$') = v_clean_contact;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
