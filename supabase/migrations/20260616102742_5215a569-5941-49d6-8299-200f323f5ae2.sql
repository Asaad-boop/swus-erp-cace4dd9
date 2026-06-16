
REVOKE EXECUTE ON FUNCTION public.seed_default_coa(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.create_journal_entry(uuid, date, text, jsonb, text, uuid, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.void_journal_entry(uuid, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_trial_balance(uuid, date) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_pl_v2(uuid, date, date) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_balance_sheet(uuid, date) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_general_ledger(uuid, uuid, date, date) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.seed_default_coa(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_journal_entry(uuid, date, text, jsonb, text, uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.void_journal_entry(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_trial_balance(uuid, date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_pl_v2(uuid, date, date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_balance_sheet(uuid, date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_general_ledger(uuid, uuid, date, date) TO authenticated;
