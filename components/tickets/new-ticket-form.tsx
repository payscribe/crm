"use client";

import { useMemo, useState } from "react";
import { SubmitButton } from "@/components/ui/submit-button";
import {
  ticketAccountStatuses,
  ticketCategories,
  ticketChannels,
  ticketInteractionModes,
  ticketPriorities
} from "@/lib/constants/tickets";
import type { Business } from "@/lib/types/businesses";
import type { TicketCategory, TicketStatus } from "@/lib/types/tickets";
import type { StaffUser } from "@/lib/types/users";

type NewTicketFormProps = {
  action: (formData: FormData) => void | Promise<void>;
  businesses: Business[];
  staffMembers: StaffUser[];
  subCategoriesByCategory: Record<TicketCategory, string[]>;
};

const inputClass =
  "mt-2 w-full rounded border border-neutral-300 px-3 py-2 text-sm outline-none transition focus:border-payscribe-blue focus:ring-2 focus:ring-payscribe-blue/20 disabled:bg-neutral-100 disabled:text-neutral-500";
const selectClass =
  "mt-2 w-full rounded border border-neutral-300 bg-white px-3 py-2 text-sm outline-none transition focus:border-payscribe-blue focus:ring-2 focus:ring-payscribe-blue/20 disabled:bg-neutral-100 disabled:text-neutral-500";

export function NewTicketForm({
  action,
  businesses,
  staffMembers,
  subCategoriesByCategory
}: NewTicketFormProps) {
  const [status, setStatus] = useState<TicketStatus>("Open");
  const [category, setCategory] = useState<TicketCategory>("Complaint");
  const [priority, setPriority] = useState("Medium");
  const [businessQuery, setBusinessQuery] = useState("");
  const [selectedBusinessId, setSelectedBusinessId] = useState("");
  const [isBusinessLookupOpen, setIsBusinessLookupOpen] = useState(false);
  const isClosed = status === "Closed";
  const subCategories = useMemo(
    () => subCategoriesByCategory[category] ?? [],
    [category, subCategoriesByCategory]
  );
  const selectedBusiness = useMemo(
    () =>
      businesses.find((business) => business.business_id === selectedBusinessId) ??
      null,
    [businesses, selectedBusinessId]
  );
  const matchingBusinesses = useMemo(() => {
    const query = businessQuery.trim().toLowerCase();

    if (!query) {
      return businesses.slice(0, 8);
    }

    return businesses
      .filter((business) =>
        [
          business.business_id,
          business.business_name,
          business.email,
          business.phone ?? "",
          business.owner_name ?? ""
        ]
          .join(" ")
          .toLowerCase()
          .includes(query)
      )
      .slice(0, 8);
  }, [businessQuery, businesses]);

  return (
    <form action={action}>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <div className="relative block">
          <span className="text-sm font-medium text-neutral-800">Business</span>
          <input type="hidden" name="business_id" value={selectedBusinessId} />
          <input
            required
            value={businessQuery}
            onChange={(event) => {
              setBusinessQuery(event.target.value);
              setSelectedBusinessId("");
              setIsBusinessLookupOpen(true);
            }}
            onFocus={() => setIsBusinessLookupOpen(true)}
            placeholder="Search business name, ID, email, or phone"
            className={inputClass}
            autoComplete="off"
          />
          {isBusinessLookupOpen && !selectedBusinessId ? (
            <div className="absolute z-20 mt-1 max-h-64 w-full overflow-y-auto rounded border border-neutral-200 bg-white shadow-lg">
              {matchingBusinesses.map((business) => (
                <button
                  key={business.business_id}
                  type="button"
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => {
                    setSelectedBusinessId(business.business_id);
                    setBusinessQuery(
                      `${business.business_name} (${business.business_id})`
                    );
                    setIsBusinessLookupOpen(false);
                  }}
                  className="block w-full border-b border-neutral-100 px-3 py-2 text-left text-sm transition last:border-b-0 hover:bg-blue-50"
                >
                  <span className="font-semibold text-neutral-900">
                    {business.business_name}
                  </span>
                  <span className="mt-1 block text-xs text-neutral-500">
                    {business.business_id}
                    {business.email ? ` - ${business.email}` : ""}
                  </span>
                </button>
              ))}
              {matchingBusinesses.length === 0 ? (
                <div className="px-3 py-2 text-sm text-neutral-500">
                  No matching businesses found.
                </div>
              ) : null}
            </div>
          ) : null}
          <p className="mt-2 text-xs text-neutral-500">
            {selectedBusiness
              ? `Selected: ${selectedBusiness.business_name}`
              : "Select a business from the lookup results before submitting."}
          </p>
        </div>

        <label className="block">
          <span className="text-sm font-medium text-neutral-800">Status</span>
          <select
            required
            name="status"
            value={status}
            onChange={(event) => setStatus(event.target.value as TicketStatus)}
            className={selectClass}
          >
            <option value="Open">Open</option>
            <option value="Closed">Closed</option>
          </select>
        </label>

        <label className="block">
          <span className="text-sm font-medium text-neutral-800">Priority</span>
          <select
            required
            name="priority"
            value={isClosed ? "Low" : priority}
            onChange={(event) => setPriority(event.target.value)}
            disabled={isClosed}
            className={selectClass}
          >
            {ticketPriorities.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
          {isClosed ? <input type="hidden" name="priority" value="Low" /> : null}
        </label>

        <label className="block">
          <span className="text-sm font-medium text-neutral-800">Mode</span>
          <select required name="interaction_mode" className={selectClass}>
            {ticketInteractionModes.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="text-sm font-medium text-neutral-800">Channel</span>
          <select required name="channel_received" className={selectClass}>
            <option value="">Select channel</option>
            {ticketChannels.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="text-sm font-medium text-neutral-800">
            Account status
          </span>
          <select required name="account_status" defaultValue="NA" className={selectClass}>
            {ticketAccountStatuses.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="text-sm font-medium text-neutral-800">Category</span>
          <select
            required
            name="issue_category"
            value={category}
            onChange={(event) => setCategory(event.target.value as TicketCategory)}
            className={selectClass}
          >
            {ticketCategories.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="text-sm font-medium text-neutral-800">Sub category</span>
          <select required name="sub_category" className={selectClass}>
            {subCategories.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="text-sm font-medium text-neutral-800">Assigned to</span>
          <select
            required={!isClosed}
            disabled={isClosed}
            name="assigned_to"
            className={selectClass}
          >
            <option value="">
              {isClosed ? "Not required for closed tickets" : "Select team member"}
            </option>
            {staffMembers.map((staffMember) => (
              <option key={staffMember.user_id} value={staffMember.user_id}>
                {staffMember.full_name}
              </option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="text-sm font-medium text-neutral-800">Reported by</span>
          <input name="reported_by" className={inputClass} />
        </label>

        <label className="block md:col-span-2">
          <span className="text-sm font-medium text-neutral-800">Subject</span>
          <input required name="subject" className={inputClass} />
        </label>
      </div>

      <label className="mt-5 block">
        <span className="text-sm font-medium text-neutral-800">Description</span>
        <textarea required name="issue_description" rows={4} className={inputClass} />
      </label>

      {isClosed ? (
        <label className="mt-5 block">
          <span className="text-sm font-medium text-neutral-800">
            Resolution
          </span>
          <textarea
            required
            name="resolution_notes"
            rows={3}
            className={inputClass}
          />
        </label>
      ) : null}

      <label className="mt-5 flex items-center gap-2 text-sm text-neutral-700">
        <input
          type="checkbox"
          name="recurring_issue"
          className="h-4 w-4 accent-payscribe-blue"
        />
        <span>Recurring issue for product team attention</span>
      </label>

      {isClosed ? (
        <div className="mt-5 rounded border border-neutral-200 bg-neutral-50 px-4 py-3 text-sm text-neutral-700">
          Closed tickets require a resolution note and are saved with Low
          priority, no assignee, no SLA escalation, and no Slack notification.
        </div>
      ) : null}

      <div className="mt-5 flex justify-end">
        <SubmitButton pendingText="Submitting ticket...">
          Submit Ticket
        </SubmitButton>
      </div>
    </form>
  );
}
