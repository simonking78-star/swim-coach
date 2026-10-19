-- A-070 tenancy test finding: a club_admin could see any user_roles row
-- whose club is NULL (today, exactly Simon's own superadmin row), because
-- app_private.can() treats a NULL target-row club as a wildcard match for
-- any caller. Scope this one policy so a null-club row only shows via the
-- caller's own row, not via the generic admin-permission check.
alter policy rbac_select on public.user_roles
  using ((user_id = auth.uid()) OR (club is not null AND app_private.can('admin', false, club)));
