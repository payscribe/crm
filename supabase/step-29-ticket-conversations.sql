-- Payscribe CRM - Step 29: Bidirectional widget ticket conversations.
-- Extends the existing ticket note trail so historical CRM notes remain messages.

alter table public.ticket_notes
  alter column created_by drop not null,
  add column if not exists sender_type text not null default 'agent',
  add column if not exists sender_name text,
  add column if not exists client_message_id text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'ticket_notes_sender_type_check'
  ) then
    alter table public.ticket_notes
      add constraint ticket_notes_sender_type_check
      check (sender_type in ('agent', 'customer', 'system'));
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'tickets'
  ) then
    alter publication supabase_realtime add table public.tickets;
  end if;
end $$;

create unique index if not exists idx_ticket_notes_client_message
on public.ticket_notes (ticket_id, client_message_id)
where client_message_id is not null;

create index if not exists idx_ticket_notes_conversation
on public.ticket_notes (ticket_id, created_at asc);

-- Required for authenticated CRM clients to receive new messages immediately.
do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'ticket_notes'
  ) then
    alter publication supabase_realtime add table public.ticket_notes;
  end if;
end $$;
