"use client";

import { deletePermissionTemplate } from "@/app/settings/actions";
import { SubmitButton } from "@/components/ui/submit-button";

type DeleteTemplateFormProps = {
  templateId: string;
  templateName: string;
};

export function DeleteTemplateForm({
  templateId,
  templateName
}: DeleteTemplateFormProps) {
  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    if (
      !window.confirm(
        `Delete permission template "${templateName}"? Existing staff permissions will not be changed.`
      )
    ) {
      event.preventDefault();
    }
  }

  return (
    <form action={deletePermissionTemplate} onSubmit={handleSubmit}>
      <input type="hidden" name="template_id" value={templateId} />
      <SubmitButton
        variant="outline"
        size="sm"
        pendingText="Deleting..."
        className="border-red-300 text-red-700 hover:border-red-400 hover:bg-red-50 hover:text-red-800"
      >
        Delete
      </SubmitButton>
    </form>
  );
}
