begin;

-- The public wrappers are SECURITY INVOKER, so authenticated needs EXECUTE on
-- the hardened two-argument private function they delegate to. The legacy
-- private three-argument function must never remain callable after hardening.
revoke all on function private.start_app_trial(uuid,text) from public, anon, authenticated;
grant execute on function private.start_app_trial(uuid,text) to authenticated;

revoke all on function private.start_app_trial(uuid,text,text) from public, anon, authenticated;

commit;
