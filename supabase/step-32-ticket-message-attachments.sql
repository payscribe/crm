-- Payscribe CRM - Step 32: Private attachments on ticket conversation messages.

alter table public.ticket_notes
  add column if not exists attachments jsonb not null default '[]'::jsonb;

alter table public.ticket_notes
  drop constraint if exists ticket_notes_attachments_array_check;

alter table public.ticket_notes
  add constraint ticket_notes_attachments_array_check
  check (jsonb_typeof(attachments) = 'array' and jsonb_array_length(attachments) <= 1);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'ticket-attachments',
  'ticket-attachments',
  false,
  5242880,
  array[
    'image/jpeg', 'image/png', 'image/webp', 'application/pdf', 'text/plain',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ]
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;
