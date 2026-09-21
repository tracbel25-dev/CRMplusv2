create index if not exists ai_lessons_source_feedback_id_idx
  on public.ai_lessons (source_feedback_id)
  where source_feedback_id is not null;
