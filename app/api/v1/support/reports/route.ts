import {
  corsHeaders,
  normalizeMerchantId,
  normalizeText,
  supportJson,
  supportOptions
} from "@/lib/support/api";

export const dynamic = "force-dynamic";

const reportTypes = new Set(["overview", "transactions", "cards", "accounts"]);
const fixedPeriods = new Set(["7d", "30d", "90d"]);

type ReportMeta = {
  bid?: string | number;
  period?: {
    from?: string;
    to?: string;
  };
  type?: string;
};

function isDateOnly(value: string | null) {
  return Boolean(value && /^\d{4}-\d{2}-\d{2}$/.test(value));
}

function parseReportPayload(payload: unknown) {
  if (typeof payload === "string") {
    return payload.trim();
  }

  if (!payload || typeof payload !== "object") {
    return null;
  }

  const record = payload as Record<string, unknown>;
  const candidates = [
    record.report,
    record.data,
    record.text,
    record.message,
    record.content
  ];

  const match = candidates.find((candidate) => typeof candidate === "string");
  if (typeof match === "string") {
    return match.trim();
  }

  if (record.data && typeof record.data === "object") {
    return parseReportPayload(record.data);
  }

  return null;
}

function parseReportMeta(payload: unknown): ReportMeta | null {
  if (!payload || typeof payload !== "object") {
    return null;
  }

  const record = payload as Record<string, unknown>;

  if (record.meta && typeof record.meta === "object") {
    return record.meta as ReportMeta;
  }

  if (record.data && typeof record.data === "object") {
    return parseReportMeta(record.data);
  }

  return null;
}

function periodLabelFromMeta(meta: ReportMeta | null, fallback: string) {
  const from = meta?.period?.from;
  const to = meta?.period?.to;

  if (from && to) {
    return `${from} to ${to}`;
  }

  return fallback;
}

function pdfEscape(value: string) {
  return value.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

function wrapText(text: string, maxLength: number) {
  const lines: string[] = [];
  const paragraphs = text.replace(/\r\n/g, "\n").split("\n");

  for (const paragraph of paragraphs) {
    const words = paragraph.trim().split(/\s+/).filter(Boolean);

    if (words.length === 0) {
      lines.push("");
      continue;
    }

    let line = "";
    for (const word of words) {
      const next = line ? `${line} ${word}` : word;
      if (next.length > maxLength && line) {
        lines.push(line);
        line = word;
      } else {
        line = next;
      }
    }

    if (line) {
      lines.push(line);
    }
  }

  return lines;
}

function createTextPdf({
  merchantId,
  periodLabel,
  report,
  type
}: {
  merchantId: string;
  periodLabel: string;
  report: string;
  type: string;
}) {
  const lines = [
    "Payscribe Merchant Report",
    `Merchant: ${merchantId}`,
    `Type: ${type}`,
    `Period: ${periodLabel}`,
    `Generated: ${new Date().toLocaleString("en-US", { timeZone: "Africa/Lagos" })}`,
    "",
    ...wrapText(report, 92)
  ];
  const pages: string[][] = [];
  const linesPerPage = 42;

  for (let index = 0; index < lines.length; index += linesPerPage) {
    pages.push(lines.slice(index, index + linesPerPage));
  }

  const objects: string[] = [];
  const pageObjectNumbers: number[] = [];

  objects.push("<< /Type /Catalog /Pages 2 0 R >>");
  objects.push("");
  objects.push("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");

  for (const pageLines of pages) {
    const contentObjectNumber = objects.length + 2;
    const pageObjectNumber = objects.length + 1;
    pageObjectNumbers.push(pageObjectNumber);

    const content =
      "BT\n/F1 11 Tf\n14 TL\n72 760 Td\n" +
      pageLines
        .map((line, index) => `${index === 0 ? "" : "T*"}(${pdfEscape(line)}) Tj`)
        .join("\n") +
      "\nET";

    objects.push(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R >> >> /Contents ${contentObjectNumber} 0 R >>`
    );
    objects.push(`<< /Length ${Buffer.byteLength(content, "utf8")} >>\nstream\n${content}\nendstream`);
  }

  objects[1] = `<< /Type /Pages /Kids [${pageObjectNumbers
    .map((number) => `${number} 0 R`)
    .join(" ")}] /Count ${pageObjectNumbers.length} >>`;

  let pdf = "%PDF-1.4\n";
  const offsets = [0];

  objects.forEach((object, index) => {
    offsets.push(Buffer.byteLength(pdf, "utf8"));
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });

  const xrefOffset = Buffer.byteLength(pdf, "utf8");
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  offsets.slice(1).forEach((offset) => {
    pdf += `${String(offset).padStart(10, "0")} 00000 n \n`;
  });
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;

  return Buffer.from(pdf, "utf8");
}

function reportFileName(type: string, periodLabel: string) {
  return `payscribe-${type}-report-${periodLabel.replace(/[^a-z0-9-]/gi, "-")}.pdf`;
}

export async function OPTIONS(request: Request) {
  return supportOptions(request);
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const merchantId = normalizeMerchantId(url.searchParams.get("merchant_id"));
  const period = normalizeText(url.searchParams.get("period"));
  const type = normalizeText(url.searchParams.get("type"))?.toLowerCase() ?? null;
  const from = normalizeText(url.searchParams.get("from"));
  const to = normalizeText(url.searchParams.get("to"));
  const format = normalizeText(url.searchParams.get("format")) ?? "json";
  const crmSecret = process.env.CRM_SECRET?.trim();

  if (!merchantId) {
    return supportJson(request, { error: "merchant_id is required" }, { status: 400 });
  }

  if (!type || !reportTypes.has(type)) {
    return supportJson(request, { error: "Valid report type is required" }, { status: 400 });
  }

  if (!period || (!fixedPeriods.has(period) && period !== "custom")) {
    return supportJson(request, { error: "Valid report period is required" }, { status: 400 });
  }

  if (period === "custom" && (!isDateOnly(from) || !isDateOnly(to))) {
    return supportJson(
      request,
      { error: "from and to dates are required for custom reports" },
      { status: 400 }
    );
  }

  if (!crmSecret) {
    return supportJson(request, { error: "CRM_SECRET is not configured" }, { status: 500 });
  }

  const crmUrl = new URL(`https://app.payscribe.ng/crm/report/${encodeURIComponent(merchantId)}`);
  crmUrl.searchParams.set("period", period);
  crmUrl.searchParams.set("type", type);

  if (period === "custom" && from && to) {
    crmUrl.searchParams.set("from", from);
    crmUrl.searchParams.set("to", to);
  }

  let response: Response;

  try {
    response = await fetch(crmUrl, {
      headers: {
        Authorization: `Bearer ${crmSecret}`,
        Accept: "application/json, text/plain"
      },
      cache: "no-store"
    });
  } catch (error) {
    console.error("CRM report request failed", {
      merchantId,
      period,
      type,
      message: error instanceof Error ? error.message : "Unknown fetch error"
    });
    return supportJson(
      request,
      { error: "Could not reach CRM report service" },
      { status: 502 }
    );
  }

  const responseText = await response.text();
  let parsedPayload: unknown = responseText;

  try {
    parsedPayload = JSON.parse(responseText);
  } catch {
    parsedPayload = responseText;
  }

  if (!response.ok) {
    const message =
      parseReportPayload(parsedPayload) || `CRM report request failed with status ${response.status}`;
    return supportJson(request, { error: message }, { status: response.status });
  }

  const report = parseReportPayload(parsedPayload);
  const meta = parseReportMeta(parsedPayload);

  if (!report) {
    return supportJson(request, { error: "CRM report response was empty" }, { status: 502 });
  }

  const fallbackPeriodLabel = period === "custom" && from && to ? `${from} to ${to}` : period;
  const periodLabel = periodLabelFromMeta(meta, fallbackPeriodLabel);

  if (format === "pdf") {
    const pdf = createTextPdf({
      merchantId: String(meta?.bid ?? merchantId),
      periodLabel,
      report,
      type: meta?.type ?? type
    });

    return new Response(pdf, {
      headers: {
        ...corsHeaders(request),
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${reportFileName(type, periodLabel)}"`
      }
    });
  }

  return supportJson(request, {
    merchant_id: merchantId,
    period,
    from,
    to,
    type,
    meta,
    report
  });
}
