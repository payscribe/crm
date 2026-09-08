"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { formatDate } from "@/lib/format/date";
import Image from "next/image";
import type { TicketNote } from "@/lib/types/tickets";
import type { StaffUser } from "@/lib/types/users";
import { AddTicketNoteForm } from "./add-ticket-note-form";

function attachmentSize(bytes: number) {
  return bytes >= 1024 * 1024
    ? `${(bytes / (1024 * 1024)).toFixed(1)} MB`
    : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

function canPreviewAttachment(mimeType: string) {
  return mimeType.startsWith("image/") || mimeType === "application/pdf" || mimeType === "text/plain";
}

type TicketConversationProps = {
  action: (formData: FormData) => void | Promise<void>;
  canReply: boolean;
  initialMessages: TicketNote[];
  staffMembers: StaffUser[];
  ticketId: string;
};

export function TicketConversation({
  action,
  canReply,
  initialMessages,
  staffMembers,
  ticketId
}: TicketConversationProps) {
  const [messages, setMessages] = useState(initialMessages);
  const [open, setOpen] = useState(false);
  const [unread, setUnread] = useState(0);
  const [liveState, setLiveState] = useState<"connecting" | "live" | "reconnecting">("connecting");
  const endRef = useRef<HTMLDivElement>(null);
  const openRef = useRef(false);
  const staffById = useMemo(
    () => new Map(staffMembers.map((staff) => [staff.user_id, staff.full_name])),
    [staffMembers]
  );

  useEffect(() => {
    setMessages(initialMessages);
  }, [initialMessages]);

  useEffect(() => {
    openRef.current = open;
    if (open) setUnread(0);

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }

    if (open) {
      document.body.style.overflow = "hidden";
      window.addEventListener("keydown", onKeyDown);
    }
    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  useEffect(() => {
    const stream = new EventSource(
      `/api/tickets/${encodeURIComponent(ticketId)}/stream`
    );

    function addMessage(incoming: TicketNote) {
      setMessages((current) => {
        if (current.some((message) => message.note_id === incoming.note_id)) {
          return current;
        }
        if (!openRef.current) setUnread((count) => count + 1);
        return [...current, incoming];
      });
    }

    stream.onopen = () => setLiveState("connecting");
    stream.addEventListener("ready", () => setLiveState("live"));
    stream.addEventListener("snapshot", (event) => {
      try {
        const snapshot = JSON.parse(event.data) as TicketNote[];
        snapshot.forEach(addMessage);
        setLiveState("live");
      } catch {
        setLiveState("reconnecting");
      }
    });
    stream.onmessage = (event) => {
      try {
        addMessage(JSON.parse(event.data) as TicketNote);
        setLiveState("live");
      } catch {
        setLiveState("reconnecting");
      }
    };
    stream.onerror = () => setLiveState("reconnecting");

    return () => {
      stream.close();
    };
  }, [ticketId]);

  useEffect(() => {
    if (open) endRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [messages.length, open]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Open ticket conversation"
        className="fixed bottom-6 right-6 z-40 grid h-14 w-14 place-items-center rounded-full bg-payscribe-blue text-white shadow-xl transition hover:scale-105 hover:bg-[#254f93] focus:outline-none focus:ring-4 focus:ring-payscribe-blue/25"
      >
        <svg viewBox="0 0 24 24" aria-hidden="true" className="h-7 w-7 fill-none stroke-current" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4z" />
          <path d="M8 9h8M8 13h5" />
        </svg>
        {unread > 0 ? (
          <span className="absolute -right-1 -top-1 grid min-h-6 min-w-6 place-items-center rounded-full border-2 border-white bg-red-600 px-1 text-[10px] font-bold text-white">
            {unread > 99 ? "99+" : unread}
          </span>
        ) : null}
      </button>

      {open ? (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/35" role="presentation">
          <button type="button" aria-label="Close conversation" className="absolute inset-0 h-full w-full cursor-default" onClick={() => setOpen(false)} />
          <aside role="dialog" aria-modal="true" aria-label="Ticket conversation" className="relative flex h-full w-full max-w-xl flex-col bg-white shadow-2xl">
            <div className="flex items-start justify-between gap-4 border-b border-neutral-200 px-5 py-4">
              <div>
                <h3 className="text-base font-semibold text-neutral-950">Ticket Conversation</h3>
                <p className="mt-1 flex items-center gap-2 text-xs text-neutral-500">
                  {ticketId}
                  <span className={`h-2 w-2 rounded-full ${liveState === "live" ? "bg-emerald-500" : liveState === "reconnecting" ? "bg-amber-500" : "bg-neutral-400"}`} />
                  {liveState === "live" ? "Live" : liveState === "reconnecting" ? "Reconnecting" : "Connecting"}
                </p>
              </div>
              <button type="button" onClick={() => setOpen(false)} className="grid h-9 w-9 place-items-center rounded-full border border-neutral-200 text-xl text-neutral-600 hover:border-payscribe-blue hover:text-payscribe-blue" aria-label="Close conversation">
                ×
              </button>
            </div>

            <div className="flex-1 space-y-4 overflow-y-auto bg-neutral-50/70 px-4 py-5 sm:px-6">
        {messages.length === 0 ? (
          <div className="rounded border border-dashed border-neutral-300 bg-white px-4 py-8 text-center text-sm text-neutral-500">
            No replies yet. Send the first message to the customer.
          </div>
        ) : null}
        {messages.map((message) => {
          const isCustomer = message.sender_type === "customer";
          const author = isCustomer
            ? message.sender_name ?? "Customer"
            : message.sender_name ?? (message.created_by ? staffById.get(message.created_by) : null) ?? "Support";

          return (
            <div key={message.note_id} className={`flex ${isCustomer ? "justify-start" : "justify-end"}`}>
              <div className={`max-w-[85%] rounded-2xl px-4 py-3 shadow-sm sm:max-w-[70%] ${
                isCustomer
                  ? "rounded-bl-sm border border-neutral-200 bg-white text-neutral-800"
                  : "rounded-br-sm bg-payscribe-blue text-white"
              }`}>
                <div className={`mb-1 flex flex-wrap items-center gap-x-2 text-xs ${isCustomer ? "text-neutral-500" : "text-blue-100"}`}>
                  <span className="font-semibold">{author}</span>
                  <span>{formatDate(message.created_at)}</span>
                </div>
                <p className="whitespace-pre-wrap break-words text-sm leading-6">{message.note_body}</p>
                {(message.attachments ?? []).map((attachment) => {
                  const downloadUrl = `/api/tickets/${encodeURIComponent(ticketId)}/attachments/${encodeURIComponent(attachment.id)}`;
                  const previewUrl = `${downloadUrl}?disposition=inline`;
                  const previewable = canPreviewAttachment(attachment.mime_type);
                  return (
                    <div key={attachment.id} className={`mt-2 overflow-hidden rounded-xl border ${isCustomer ? "border-neutral-200 bg-neutral-50" : "border-white/25 bg-white/10"}`}>
                      {previewable ? (
                        <a href={previewUrl} target="_blank" rel="noopener noreferrer" aria-label={`Open ${attachment.name} preview`} className="block bg-white">
                          {attachment.mime_type.startsWith("image/") ? (
                            <Image
                              src={previewUrl}
                              alt={attachment.name}
                              width={640}
                              height={320}
                              unoptimized
                              className="max-h-48 w-full object-cover"
                            />
                          ) : (
                            <iframe src={previewUrl} title={attachment.name} tabIndex={-1} className="pointer-events-none h-32 w-full border-0 bg-white" />
                          )}
                        </a>
                      ) : null}
                      <div className="flex items-center gap-2 px-3 py-2 text-xs">
                        <span className="min-w-0 flex-1 truncate font-semibold">{attachment.name}</span>
                        <span className="shrink-0 opacity-70">{attachmentSize(attachment.size)}</span>
                        {previewable ? <a href={previewUrl} target="_blank" rel="noopener noreferrer" className="font-bold underline">View</a> : null}
                        <a href={downloadUrl} className="font-bold underline" download>Download</a>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
        <div ref={endRef} />
            </div>

            <div className="border-t border-neutral-200 bg-white px-5 pb-5">
        {canReply ? (
          <AddTicketNoteForm action={action} staffMembers={staffMembers} ticketId={ticketId} />
        ) : (
          <p className="pt-4 text-sm text-neutral-500">This conversation is read-only.</p>
        )}
            </div>
          </aside>
        </div>
      ) : null}
    </>
  );
}
