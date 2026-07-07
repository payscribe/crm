import { NextResponse } from "next/server";

const defaultAllowedHeaders = "Content-Type, Authorization";
const defaultAllowedMethods = "GET, POST, OPTIONS";

function allowedOrigins() {
  return [
    process.env.NEXT_PUBLIC_APP_URL,
    ...(process.env.SUPPORT_WIDGET_ALLOWED_ORIGINS ?? "")
      .split(",")
      .map((origin) => origin.trim())
  ].filter(Boolean);
}

export function corsHeaders(request: Request) {
  const requestOrigin = request.headers.get("origin");
  const configuredOrigins = allowedOrigins();
  const allowOrigin =
    requestOrigin && configuredOrigins.includes(requestOrigin)
      ? requestOrigin
      : configuredOrigins.length === 0
        ? "*"
        : configuredOrigins[0] ?? "*";

  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Methods": defaultAllowedMethods,
    "Access-Control-Allow-Headers": defaultAllowedHeaders,
    "Access-Control-Max-Age": "86400",
    Vary: "Origin"
  };
}

export function supportJson(
  request: Request,
  body: unknown,
  init?: ResponseInit
) {
  return NextResponse.json(body, {
    ...init,
    headers: {
      ...corsHeaders(request),
      ...init?.headers
    }
  });
}

export function supportOptions(request: Request) {
  return new NextResponse(null, {
    status: 204,
    headers: corsHeaders(request)
  });
}

export function normalizeText(value: unknown) {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function normalizeMerchantId(value: unknown) {
  return normalizeText(value);
}

export function isValidSessionId(value: string) {
  return /^[A-Za-z0-9._:-]{8,120}$/.test(value);
}

export function isValidTransactionId(value: string) {
  return /^[A-Za-z0-9._:-]{3,120}$/.test(value);
}

export function normalizeAttachments(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 5);
}

export function publicTicketStatus(status: string) {
  return status.toLowerCase();
}
