update public.plans
set seats=4, updated_at=now()
where app_id <> 'zeus' and seats=1;
