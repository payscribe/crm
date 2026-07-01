"use client";

const HEADERS = [
  "full_name",
  "phone",
  "business_name",
  "email",
  "source",
  "referral_source_name",
  "product_interest",
  "stage",
  "status",
  "assigned_to_email",
  "next_followup_date",
  "last_message_summary",
  "notes"
];

const EXAMPLE_ROW = [
  "John Doe",
  "08012345678",
  "Acme Ltd",
  "john@acme.com",
  "Referral",
  "Jane Smith",
  "USD Virtual Card",
  "New",
  "Warm",
  "staff@payscribe.com",
  "2026-07-15",
  "Met at conference",
  "Follow up next week"
];

export function DownloadTemplateButton() {
  function handleDownload() {
    const csv = [HEADERS.join(","), EXAMPLE_ROW.join(",")].join("\r\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "leads-import-template.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <button
      type="button"
      onClick={handleDownload}
      className="text-xs font-semibold text-payscribe-blue hover:underline"
    >
      Download template
    </button>
  );
}
