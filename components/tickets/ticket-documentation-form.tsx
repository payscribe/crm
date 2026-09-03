"use client";

import { useRef, type FormEvent, type MouseEvent } from "react";
import { SubmitButton } from "@/components/ui/submit-button";

type TicketDocumentationFormProps = {
  action: (formData: FormData) => void | Promise<void>;
  ticketId: string;
  initialTitle: string;
  initialContent?: string;
};

const toolbarActions = [
  { label: "Bold", command: "bold", short: "B" },
  { label: "Italic", command: "italic", short: "I" },
  { label: "Underline", command: "underline", short: "U" },
  { label: "Bulleted list", command: "insertUnorderedList", short: "• List" },
  { label: "Numbered list", command: "insertOrderedList", short: "1. List" }
] as const;

export function TicketDocumentationForm({
  action,
  ticketId,
  initialTitle,
  initialContent = ""
}: TicketDocumentationFormProps) {
  const editorRef = useRef<HTMLDivElement>(null);
  const contentInputRef = useRef<HTMLInputElement>(null);

  function updateFormValue() {
    if (contentInputRef.current) {
      contentInputRef.current.value = editorRef.current?.innerHTML ?? "";
    }
  }

  function format(event: MouseEvent<HTMLButtonElement>, command: string) {
    event.preventDefault();
    editorRef.current?.focus();
    document.execCommand(command);
    updateFormValue();
  }

  function syncContent(_event: FormEvent<HTMLDivElement>) {
    updateFormValue();
  }

  return (
    <form action={action}>
      <input type="hidden" name="ticket_id" value={ticketId} />
      <input
        ref={contentInputRef}
        type="hidden"
        name="content_html"
        defaultValue={initialContent}
      />

      <label className="block">
        <span className="text-sm font-medium text-neutral-800">Title</span>
        <input
          required
          name="title"
          defaultValue={initialTitle}
          placeholder="How this ticket was resolved"
          className="mt-2 w-full rounded border border-neutral-300 px-3 py-2 text-sm outline-none transition focus:border-payscribe-blue focus:ring-2 focus:ring-payscribe-blue/20"
        />
      </label>

      <div className="mt-5">
        <span className="text-sm font-medium text-neutral-800">Documentation</span>
        <div className="mt-2 overflow-hidden rounded border border-neutral-300 focus-within:border-payscribe-blue focus-within:ring-2 focus-within:ring-payscribe-blue/20">
          <div className="flex flex-wrap gap-1 border-b border-neutral-200 bg-neutral-50 p-2">
            {toolbarActions.map((item) => (
              <button
                key={item.command}
                type="button"
                title={item.label}
                aria-label={item.label}
                onMouseDown={(event) => format(event, item.command)}
                className={`min-w-9 rounded border border-neutral-200 bg-white px-2.5 py-1.5 text-sm text-neutral-800 hover:border-payscribe-blue hover:text-payscribe-blue ${
                  item.command === "italic" ? "italic" : item.command === "underline" ? "underline" : item.command === "bold" ? "font-bold" : "font-medium"
                }`}
              >
                {item.short}
              </button>
            ))}
          </div>
          <div
            ref={editorRef}
            role="textbox"
            aria-multiline="true"
            contentEditable
            suppressContentEditableWarning
            onInput={syncContent}
            data-placeholder="Explain the investigation, root cause, resolution steps, and anything useful for similar tickets."
            className="ticket-rich-text-editor min-h-64 px-4 py-3 text-sm leading-7 text-neutral-800 outline-none"
            dangerouslySetInnerHTML={{ __html: initialContent }}
          />
        </div>
      </div>

      <div className="mt-5 flex justify-end">
        <SubmitButton pendingText="Saving documentation...">
          Save Documentation
        </SubmitButton>
      </div>
    </form>
  );
}
