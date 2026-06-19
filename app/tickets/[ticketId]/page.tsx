import { AppShell } from "@/components/app-shell";
import { AddTicketNoteForm } from "@/components/tickets/add-ticket-note-form";
import { CloseTicketForm } from "@/components/tickets/close-ticket-form";
import { StatusAlert } from "@/components/ui/status-alert";
import { SubmitButton } from "@/components/ui/submit-button";
import { getCurrentUserContext } from "@/lib/auth/current-user";
import type { Business } from "@/lib/types/businesses";
import {
  ticketAccountStatuses,
  editableTicketStatuses,
  ticketCategories,
  ticketChannels,
  ticketInteractionModes,
  ticketPriorities
} from "@/lib/constants/tickets";
import { formatDate } from "@/lib/format/date";
import { hasModulePermission } from "@/lib/permissions/checks";
import { getHistoricalAwareTicketSubCategoryOptionsByCategory } from "@/lib/settings/managed-options";
import type { Ticket, TicketNote } from "@/lib/types/tickets";
import type { StaffUser } from "@/lib/types/users";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { addTicketNote, updateTicket } from "../actions";

type TicketDetailPageProps = {
  params: {
    ticketId: string;
  };
  searchParams?: {
    error?: string;
    success?: string;
  };
};

function isSlaBreached(ticket: Ticket) {
  return (
    Boolean(ticket.sla_deadline) &&
    new Date().getTime() > new Date(ticket.sla_deadline as string).getTime() &&
    ticket.status !== "Closed"
  );
}

export default async function TicketDetailPage({
  params,
  searchParams
}: TicketDetailPageProps) {
  const { supabase, currentUser, permissions } = await getCurrentUserContext();

  if (!hasModulePermission(currentUser, permissions, "Tickets", "can_view")) {
    redirect("/");
  }

  const canEdit = hasModulePermission(
    currentUser,
    permissions,
    "Tickets",
    "can_edit"
  );

  const [
    { data: ticket },
    { data: businesses },
    { data: staffMembers },
    { data: ticketNotes },
    subCategoryOptionState
  ] =
    await Promise.all([
      supabase
        .from("tickets")
        .select("*")
        .eq("ticket_id", params.ticketId)
        .single<Ticket>(),
      supabase
        .from("businesses")
        .select("*")
        .order("business_name", { ascending: true })
        .returns<Business[]>(),
      supabase
        .from("users")
        .select("*")
        .eq("status", "Active")
        .order("full_name", { ascending: true })
        .returns<StaffUser[]>(),
      supabase
        .from("ticket_notes")
        .select("*")
        .eq("ticket_id", params.ticketId)
        .order("created_at", { ascending: false })
        .returns<TicketNote[]>(),
      supabase
        .from("tickets")
        .select("issue_category, sub_category")
        .eq("ticket_id", params.ticketId)
        .single<{ issue_category: Ticket["issue_category"]; sub_category: string | null }>()
        .then(({ data }) =>
          getHistoricalAwareTicketSubCategoryOptionsByCategory(
            supabase,
            data?.issue_category ?? "Complaint",
            data?.sub_category ?? null
          )
        )
    ]);

  if (!ticket) {
    notFound();
  }

  const businessById = new Map(
    (businesses ?? []).map((business) => [
      business.business_id,
      business.business_name
    ])
  );
  const staffById = new Map(
    (staffMembers ?? []).map((staffMember) => [
      staffMember.user_id,
      staffMember.full_name
    ])
  );
  const disabled = !canEdit || ticket.status === "Closed";
  const inputClass =
    "mt-2 w-full rounded border border-neutral-300 px-3 py-2 text-sm outline-none transition focus:border-payscribe-blue focus:ring-2 focus:ring-payscribe-blue/20 disabled:bg-neutral-100 disabled:text-neutral-500";
  const selectClass =
    "mt-2 w-full rounded border border-neutral-300 bg-white px-3 py-2 text-sm outline-none transition focus:border-payscribe-blue focus:ring-2 focus:ring-payscribe-blue/20 disabled:bg-neutral-100 disabled:text-neutral-500";

  return (
    <AppShell currentUser={currentUser} permissions={permissions}>
      <section>
        <div className="flex flex-col gap-4 border-b border-neutral-200 pb-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-wide text-payscribe-blue">
              {ticket.ticket_id}
            </p>
            <h2 className="mt-2 text-2xl font-semibold tracking-normal text-neutral-950">
              {ticket.subject}
            </h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-neutral-600">
              {ticket.business_id
                ? businessById.get(ticket.business_id) ?? ticket.business_id
                : "Unmatched email"}{" "}
              -
              assigned to{" "}
              {ticket.assigned_to
                ? staffById.get(ticket.assigned_to) ?? "Unknown"
                : "Unassigned"}
            </p>
          </div>
          <Link
            href="/tickets"
            className="rounded border border-neutral-300 bg-white px-4 py-2 text-sm font-semibold text-neutral-800 transition hover:border-payscribe-blue hover:text-payscribe-blue"
          >
            Back to Tickets
          </Link>
        </div>

        <StatusAlert type="error" message={searchParams?.error} />
        <StatusAlert type="success" message={searchParams?.success} />

        <div className="mt-6 grid gap-4 md:grid-cols-4">
          <div className="rounded border border-neutral-200 bg-white p-5">
            <p className="text-sm font-medium text-neutral-500">Priority</p>
            <p className="mt-2 text-xl font-semibold text-neutral-950">
              {ticket.priority}
            </p>
          </div>
          <div className="rounded border border-neutral-200 bg-white p-5">
            <p className="text-sm font-medium text-neutral-500">Status</p>
            <p className="mt-2 text-xl font-semibold text-neutral-950">
              {ticket.status}
            </p>
          </div>
          <div className="rounded border border-neutral-200 bg-white p-5">
            <p className="text-sm font-medium text-neutral-500">
              SLA deadline
            </p>
            <p className="mt-2 text-xl font-semibold text-neutral-950">
              {formatDate(ticket.sla_deadline)}
            </p>
          </div>
          <div className="rounded border border-neutral-200 bg-white p-5">
            <p className="text-sm font-medium text-neutral-500">SLA state</p>
            <p
              className={`mt-2 text-xl font-semibold ${
                isSlaBreached(ticket) ? "text-red-700" : "text-neutral-950"
              }`}
            >
              {isSlaBreached(ticket) ? "Breached" : "Within SLA"}
            </p>
          </div>
        </div>

        {!canEdit ? (
          <div className="mt-6 rounded border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            You can view this record, but you do not have edit permission for
            Tickets.
          </div>
        ) : null}

        {ticket.status === "Closed" ? (
          <div className="mt-6 rounded border border-neutral-200 bg-neutral-100 px-4 py-3 text-sm text-neutral-700">
            This ticket is closed and cannot be edited.
          </div>
        ) : null}

        {ticket.source === "Email" ? (
          <div className="mt-6 rounded border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-900">
            <div className="font-semibold">Email ticket</div>
            <div className="mt-1">
              Sender: {ticket.customer_name ?? "Unknown"}{" "}
              {ticket.customer_email ? `<${ticket.customer_email}>` : ""}
            </div>
            {!ticket.business_id ? (
              <div className="mt-1">
                This email has not been matched to a business. Select the
                correct business below and save the ticket.
              </div>
            ) : null}
          </div>
        ) : null}

        <form
          action={updateTicket}
          className="mt-6 rounded border border-neutral-200 bg-white p-5"
        >
          <input type="hidden" name="ticket_id" value={ticket.ticket_id} />

          <div>
            <h3 className="text-base font-semibold text-neutral-950">
              Ticket Details
            </h3>
          </div>

          <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            <label className="block">
              <span className="text-sm font-medium text-neutral-800">
                Business
              </span>
              <select
                required
                disabled={disabled}
                name="business_id"
                defaultValue={ticket.business_id ?? ""}
                className={selectClass}
              >
                <option value="">Select business</option>
                {(businesses ?? []).map((business) => (
                  <option key={business.business_id} value={business.business_id}>
                    {business.business_name}
                  </option>
                ))}
              </select>
            </label>

            <label className="block">
              <span className="text-sm font-medium text-neutral-800">
                Reported by
              </span>
              <input
                disabled={disabled}
                name="reported_by"
                defaultValue={ticket.reported_by ?? ""}
                className={inputClass}
              />
            </label>

            <label className="block">
              <span className="text-sm font-medium text-neutral-800">
                Mode
              </span>
              <select
                required
                disabled={disabled}
                name="interaction_mode"
                defaultValue={ticket.interaction_mode ?? "Inbound"}
                className={selectClass}
              >
                {ticketInteractionModes.map((mode) => (
                  <option key={mode} value={mode}>
                    {mode}
                  </option>
                ))}
              </select>
            </label>

            <label className="block">
              <span className="text-sm font-medium text-neutral-800">
                Channel
              </span>
              <select
                required
                disabled={disabled}
                name="channel_received"
                defaultValue={ticket.channel_received}
                className={selectClass}
              >
                {ticketChannels.map((channel) => (
                  <option key={channel} value={channel}>
                    {channel}
                  </option>
                ))}
              </select>
            </label>

            <label className="block">
              <span className="text-sm font-medium text-neutral-800">
                Category
              </span>
              <select
                required
                disabled={disabled}
                name="issue_category"
                defaultValue={ticket.issue_category}
                className={selectClass}
              >
                {ticketCategories.map((category) => (
                  <option key={category} value={category}>
                    {category}
                  </option>
                ))}
              </select>
            </label>

            <label className="block">
              <span className="text-sm font-medium text-neutral-800">
                Sub category
              </span>
              <select
                disabled={disabled}
                name="sub_category"
                defaultValue={ticket.sub_category ?? ""}
                className={selectClass}
              >
                <option value="">Not set</option>
                {ticketCategories.map((category) => (
                  <optgroup key={category} label={category}>
                    {(subCategoryOptionState.optionsByCategory[category] ?? []).map(
                      (subCategory) => {
                        const isInactive =
                          ticket.issue_category === category &&
                          ticket.sub_category === subCategory &&
                          !(
                            subCategoryOptionState.activeOptionsByCategory[
                              category
                            ] ?? []
                          ).includes(subCategory);

                        return (
                        <option
                          key={`${category}:${subCategory}`}
                          value={subCategory}
                        >
                          {subCategory}
                          {isInactive ? " (Inactive)" : ""}
                        </option>
                        );
                      }
                    )}
                  </optgroup>
                ))}
              </select>
            </label>

            <label className="block">
              <span className="text-sm font-medium text-neutral-800">
                Priority
              </span>
              <select
                required
                disabled={disabled}
                name="priority"
                defaultValue={ticket.priority}
                className={selectClass}
              >
                {ticketPriorities.map((priority) => (
                  <option key={priority} value={priority}>
                    {priority}
                  </option>
                ))}
              </select>
            </label>

            <label className="block">
              <span className="text-sm font-medium text-neutral-800">
                Assigned to
              </span>
              <select
                required={ticket.status !== "Closed"}
                disabled={disabled}
                name="assigned_to"
                defaultValue={ticket.assigned_to ?? ""}
                className={selectClass}
              >
                <option value="">Unassigned</option>
                {(staffMembers ?? []).map((staffMember) => (
                  <option key={staffMember.user_id} value={staffMember.user_id}>
                    {staffMember.full_name}
                  </option>
                ))}
              </select>
            </label>

            <label className="block">
              <span className="text-sm font-medium text-neutral-800">
                Status
              </span>
              <select
                required
                disabled={disabled}
                name="status"
                defaultValue={ticket.status}
                className={selectClass}
              >
                {editableTicketStatuses.map((status) => (
                  <option key={status} value={status}>
                    {status}
                  </option>
                ))}
              </select>
            </label>

            <label className="block">
              <span className="text-sm font-medium text-neutral-800">
                Account status
              </span>
              <select
                required
                disabled={disabled}
                name="account_status"
                defaultValue={ticket.account_status ?? "NA"}
                className={selectClass}
              >
                {ticketAccountStatuses.map((status) => (
                  <option key={status} value={status}>
                    {status}
                  </option>
                ))}
              </select>
            </label>

            <label className="block md:col-span-2">
              <span className="text-sm font-medium text-neutral-800">
                Subject
              </span>
              <input
                required
                disabled={disabled}
                name="subject"
                defaultValue={ticket.subject}
                className={inputClass}
              />
            </label>

          </div>

          <label className="mt-5 block">
            <span className="text-sm font-medium text-neutral-800">
              Description
            </span>
            <textarea
              required
              disabled={disabled}
              name="issue_description"
              rows={4}
              defaultValue={ticket.issue_description}
              className="mt-2 w-full rounded border border-neutral-300 px-3 py-2 text-sm outline-none transition focus:border-payscribe-blue focus:ring-2 focus:ring-payscribe-blue/20 disabled:bg-neutral-100 disabled:text-neutral-500"
            />
          </label>

          <label className="mt-5 flex items-center gap-2 text-sm text-neutral-700">
            <input
              disabled={disabled}
              type="checkbox"
              name="recurring_issue"
              defaultChecked={ticket.recurring_issue}
              className="h-4 w-4 accent-payscribe-blue"
            />
            <span>Recurring issue for product team attention</span>
          </label>

          {canEdit && ticket.status !== "Closed" ? (
            <div className="mt-5 flex justify-end">
              <SubmitButton pendingText="Updating ticket...">
                Update Ticket
              </SubmitButton>
            </div>
          ) : null}
        </form>

        {ticket.status === "Closed" || ticket.resolution_notes ? (
          <div className="mt-6 rounded border border-neutral-200 bg-white p-5">
            <h3 className="text-base font-semibold text-neutral-950">
              Resolution
            </h3>
            <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-neutral-700">
              {ticket.resolution_notes ?? "No resolution recorded."}
            </p>
          </div>
        ) : null}

        {ticket.status !== "Closed" ? (
          <div className="mt-6 rounded border border-neutral-200 bg-white p-5">
            <div>
              <h3 className="text-base font-semibold text-neutral-950">
                Close Ticket
              </h3>
              <p className="mt-1 text-sm text-neutral-600">
                Closing requires confirmation and removes the ticket from active
                SLA monitoring.
              </p>
            </div>
            <div className="mt-5">
              <CloseTicketForm ticketId={ticket.ticket_id} canEdit={canEdit} />
            </div>
          </div>
        ) : null}

        <div className="mt-6 rounded border border-neutral-200 bg-white p-5">
          <div className="flex flex-col gap-2 border-b border-neutral-200 pb-4 md:flex-row md:items-end md:justify-between">
            <div>
              <h3 className="text-base font-semibold text-neutral-950">
                Note Trail
              </h3>
              <p className="mt-1 text-sm text-neutral-600">
                Internal updates added while the ticket is active.
              </p>
            </div>
          </div>

          {canEdit && ticket.status !== "Closed" ? (
            <AddTicketNoteForm
              action={addTicketNote}
              staffMembers={staffMembers ?? []}
              ticketId={ticket.ticket_id}
            />
          ) : null}

          <div className="mt-5 divide-y divide-neutral-200 rounded border border-neutral-200">
            {(ticketNotes ?? []).map((note) => (
              <div key={note.note_id} className="p-4">
                <div className="flex flex-col gap-1 text-xs text-neutral-500 md:flex-row md:items-center md:justify-between">
                  <span className="font-semibold text-neutral-700">
                    {staffById.get(note.created_by) ?? "Team member"}
                  </span>
                  <span>{formatDate(note.created_at)}</span>
                </div>
                <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-neutral-700">
                  {note.note_body}
                </p>
              </div>
            ))}

            {(ticketNotes ?? []).length === 0 ? (
              <div className="p-4 text-sm text-neutral-600">
                No notes have been added yet.
              </div>
            ) : null}
          </div>
        </div>
      </section>
    </AppShell>
  );
}
