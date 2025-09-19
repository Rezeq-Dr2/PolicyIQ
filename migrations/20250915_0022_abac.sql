-- ABAC: user attributes and evidence domain tagging
alter table users add column if not exists department text;
alter table users add column if not exists data_domains text[];
alter table evidence_items add column if not exists data_domain text;

-- app.enforce_abac flag function
create or replace function app.enforce_abac()
returns boolean
language sql
stable
as $$
  select coalesce(nullif(current_setting('app.enforce_abac', true), '')::boolean, false);
$$;

-- Optional: tighten evidence_items RLS to check domain when ABAC is enabled
drop policy if exists evidence_items_rls on evidence_items;
create policy evidence_items_rls on evidence_items using (
  app.allow_org(organization_id)
  and (
    not app.enforce_abac()
    or exists (
      select 1 from users u where u.id = current_setting('app.user_id', true)::uuid and u.organization_id = evidence_items.organization_id and (
        u.data_domains is null or evidence_items.data_domain is null or evidence_items.data_domain = any(u.data_domains)
      )
    )
  )
) with check (
  app.allow_org(organization_id)
);


