-- Payscribe CRM - Step 30: Scalable realtime broadcasts for ticket conversations.
-- Broadcast is Supabase's recommended realtime mechanism for database changes.

create or replace function public.broadcast_ticket_note_change()
returns trigger
security definer
set search_path = ''
language plpgsql
as $$
begin
  perform realtime.broadcast_changes(
    'ticket-conversation:' || coalesce(new.ticket_id, old.ticket_id)::text,
    tg_op,
    tg_op,
    tg_table_name,
    tg_table_schema,
    new,
    old
  );
  return null;
end;
$$;

drop trigger if exists broadcast_ticket_note_change_trigger on public.ticket_notes;
create trigger broadcast_ticket_note_change_trigger
after insert or update or delete on public.ticket_notes
for each row execute function public.broadcast_ticket_note_change();

create or replace function public.broadcast_ticket_status_change()
returns trigger
security definer
set search_path = ''
language plpgsql
as $$
begin
  if new.status is distinct from old.status
    or new.resolution_notes is distinct from old.resolution_notes then
    perform realtime.broadcast_changes(
      'ticket-conversation:' || new.ticket_id::text,
      tg_op,
      tg_op,
      tg_table_name,
      tg_table_schema,
      new,
      old
    );
  end if;
  return null;
end;
$$;

drop trigger if exists broadcast_ticket_status_change_trigger on public.tickets;
create trigger broadcast_ticket_status_change_trigger
after update on public.tickets
for each row execute function public.broadcast_ticket_status_change();
