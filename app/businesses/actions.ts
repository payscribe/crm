"use server";

import { getCurrentUserContext } from "@/lib/auth/current-user";
import {
  businessLifecycleStages,
  kybStatuses
} from "@/lib/constants/businesses";
import { hasModulePermission } from "@/lib/permissions/checks";
import type { BusinessLifecycleStage, KybStatus } from "@/lib/types/businesses";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

function optionalText(value: FormDataEntryValue | null) {
  const text = String(value ?? "").trim();
  return text.length > 0 ? text : null;
}

function requiredText(formData: FormData, key: string) {
  return optionalText(formData.get(key));
}

function validLifecycleStage(value: string | null): BusinessLifecycleStage {
  return businessLifecycleStages.includes(value as BusinessLifecycleStage)
    ? (value as BusinessLifecycleStage)
    : "Registered";
}

function validKybStatus(value: string | null): KybStatus {
  return kybStatuses.includes(value as KybStatus)
    ? (value as KybStatus)
    : "Not Submitted";
}

function parseCsv(text: string) {
  const rows: string[][] = [];
  let current = "";
  let row: string[] = [];
  let inQuotes = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];

    if (char === '"' && inQuotes && next === '"') {
      current += '"';
      index += 1;
    } else if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === "," && !inQuotes) {
      row.push(current.trim());
      current = "";
    } else if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && next === "\n") {
        index += 1;
      }
      row.push(current.trim());
      if (row.some(Boolean)) {
        rows.push(row);
      }
      current = "";
      row = [];
    } else {
      current += char;
    }
  }

  row.push(current.trim());
  if (row.some(Boolean)) {
    rows.push(row);
  }

  return rows;
}

function normalizeHeader(header: string) {
  return header.trim().toLowerCase().replace(/\s+/g, "_");
}

async function staffIdByEmail(email: string | null) {
  if (!email) {
    return null;
  }

  const { supabase } = await getCurrentUserContext();
  const { data } = await supabase
    .from("users")
    .select("user_id")
    .ilike("email", email)
    .maybeSingle<{ user_id: string }>();

  return data?.user_id ?? null;
}

export async function createBusiness(formData: FormData) {
  const { supabase, currentUser, permissions } = await getCurrentUserContext();

  if (!hasModulePermission(currentUser, permissions, "Businesses", "can_create")) {
    redirect("/businesses?error=You%20do%20not%20have%20permission%20to%20create%20businesses");
  }

  const businessName = requiredText(formData, "business_name");
  const email = requiredText(formData, "email")?.toLowerCase();

  if (!businessName || !email) {
    redirect("/businesses?error=Business%20name%20and%20email%20are%20required");
  }

  const assignedCsOwner = optionalText(formData.get("assigned_cs_owner"));

  const { data: createdBusiness, error } = await supabase
    .from("businesses")
    .insert({
      assigned_cs_owner: assignedCsOwner,
      business_name: businessName,
      email,
      kyb_status: validKybStatus(optionalText(formData.get("kyb_status"))),
      lifecycle_stage: validLifecycleStage(
        optionalText(formData.get("lifecycle_stage"))
      ),
      notes: optionalText(formData.get("notes")),
      owner_name: optionalText(formData.get("owner_name")),
      phone: optionalText(formData.get("phone")),
      registration_date: optionalText(formData.get("registration_date"))
    })
    .select("business_id")
    .single<{ business_id: string }>();

  if (error) {
    redirect(`/businesses?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath("/businesses");
  redirect(
    `/businesses?success=Business%20${createdBusiness.business_id}%20created`
  );
}

export async function bulkUploadBusinesses(formData: FormData) {
  const { supabase, currentUser, permissions } = await getCurrentUserContext();

  if (!hasModulePermission(currentUser, permissions, "Businesses", "can_create")) {
    redirect("/businesses?error=You%20do%20not%20have%20permission%20to%20create%20businesses");
  }

  const file = formData.get("csv_file");

  if (!(file instanceof File) || file.size === 0) {
    redirect("/businesses?error=Please%20upload%20a%20CSV%20file");
  }

  const rows = parseCsv(await file.text());
  const [headers, ...bodyRows] = rows;

  if (!headers || bodyRows.length === 0) {
    redirect("/businesses?error=CSV%20must%20include%20a%20header%20and%20at%20least%20one%20row");
  }

  const headerMap = headers.map(normalizeHeader);
  const records = [];
  let skipped = 0;

  for (const row of bodyRows) {
    const get = (key: string) => row[headerMap.indexOf(key)]?.trim() || null;
    const businessName = get("business_name");
    const email = get("email")?.toLowerCase();

    if (!businessName || !email) {
      skipped += 1;
      continue;
    }

    records.push({
      assigned_cs_owner: await staffIdByEmail(get("assigned_cs_owner_email")),
      business_name: businessName,
      email,
      kyb_status: validKybStatus(get("kyb_status")),
      lifecycle_stage: validLifecycleStage(get("lifecycle_stage")),
      notes: get("notes"),
      owner_name: get("owner_name"),
      phone: get("phone")
    });
  }

  if (records.length === 0) {
    redirect("/businesses?error=No%20valid%20business%20rows%20found");
  }

  const { data: existingBusinesses } = await supabase
    .from("businesses")
    .select("email")
    .in(
      "email",
      records.map((record) => record.email)
    )
    .returns<Array<{ email: string }>>();
  const existingEmails = new Set(
    (existingBusinesses ?? []).map((business) => business.email.toLowerCase())
  );
  const newRecords = records.filter((record) => !existingEmails.has(record.email));
  skipped += records.length - newRecords.length;

  if (newRecords.length === 0) {
    redirect(
      `/businesses?success=No%20new%20businesses%20imported,%20${skipped}%20skipped`
    );
  }

  const { error } = await supabase.from("businesses").insert(newRecords);

  if (error) {
    redirect(`/businesses?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath("/businesses");
  redirect(
    `/businesses?success=${newRecords.length}%20business(es)%20imported,%20${skipped}%20skipped`
  );
}
