"use client";

import { updateStaffStatus } from "@/app/settings/actions";
import { SubmitButton } from "@/components/ui/submit-button";
import type { StaffStatus } from "@/lib/types/users";

type StaffStatusFormProps = {
  userId: string;
  fullName: string;
  currentStatus: StaffStatus;
  isSuperAdmin: boolean;
};

export function StaffStatusForm({
  userId,
  fullName,
  currentStatus,
  isSuperAdmin
}: StaffStatusFormProps) {
  const nextStatus = currentStatus === "Active" ? "Inactive" : "Active";

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    if (nextStatus === "Inactive") {
      const confirmed = window.confirm(
        `Deactivating ${fullName} will disable their login immediately and flag all their assigned leads, tickets, businesses, and partner records for reassignment. This cannot be undone without reactivating the account. Confirm?`
      );

      if (!confirmed) {
        event.preventDefault();
      }
    }
  }

  if (isSuperAdmin && nextStatus === "Inactive") {
    return (
      <p className="rounded border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-payscribe-blue">
        Super Admin accounts cannot be deactivated from the UI.
      </p>
    );
  }

  return (
    <form action={updateStaffStatus} onSubmit={handleSubmit}>
      <input type="hidden" name="user_id" value={userId} />
      <input type="hidden" name="status" value={nextStatus} />
      <SubmitButton
        variant={nextStatus === "Inactive" ? "outline" : "primary"}
        pendingText={
          nextStatus === "Inactive" ? "Deactivating..." : "Reactivating..."
        }
        className={
          nextStatus === "Inactive"
            ? "border-red-300 text-red-700 hover:border-red-400 hover:bg-red-50 hover:text-red-800"
            : ""
        }
      >
        {nextStatus === "Inactive" ? "Deactivate Account" : "Reactivate Account"}
      </SubmitButton>
    </form>
  );
}
