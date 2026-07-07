"use server";

import { getCurrentUserContext } from "@/lib/auth/current-user";
import {
	businessLifecycleStages,
	kybStatuses,
} from "@/lib/constants/businesses";
import { hasModulePermission } from "@/lib/permissions/checks";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
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

function parseOptionalDate(value: string | null | undefined) {
	const text = String(value ?? "").trim();

	if (!text) {
		return null;
	}

	const date = new Date(text.replace(" ", "T"));
	return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function parseOptionalNumber(value: string | number | null | undefined) {
	if (value === null || value === undefined || value === "") {
		return null;
	}

	const parsed = Number(value);
	return Number.isFinite(parsed) ? parsed : null;
}

function cleanExternalText(value: unknown) {
	const text = String(value ?? "").trim();
	return text.length > 0 ? text : null;
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

	if (
		!hasModulePermission(currentUser, permissions, "Businesses", "can_create")
	) {
		redirect(
			"/businesses?error=You%20do%20not%20have%20permission%20to%20create%20businesses",
		);
	}

	const businessName = requiredText(formData, "business_name");
	const email = requiredText(formData, "email")?.toLowerCase();

	if (!businessName || !email) {
		redirect(
			"/businesses?error=Business%20name%20and%20email%20are%20required",
		);
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
				optionalText(formData.get("lifecycle_stage")),
			),
			notes: optionalText(formData.get("notes")),
			owner_name: optionalText(formData.get("owner_name")),
			phone: optionalText(formData.get("phone")),
			registration_date: optionalText(formData.get("registration_date")),
		})
		.select("business_id")
		.single<{ business_id: string }>();

	if (error) {
		redirect(`/businesses?error=${encodeURIComponent(error.message)}`);
	}

	revalidatePath("/businesses");
	redirect(
		`/businesses?success=Business%20${createdBusiness.business_id}%20created`,
	);
}

export async function bulkUploadBusinesses(formData: FormData) {
	const { supabase, currentUser, permissions } = await getCurrentUserContext();

	if (
		!hasModulePermission(currentUser, permissions, "Businesses", "can_create")
	) {
		redirect(
			"/businesses?error=You%20do%20not%20have%20permission%20to%20create%20businesses",
		);
	}

	const file = formData.get("csv_file");

	if (!(file instanceof File) || file.size === 0) {
		redirect("/businesses?error=Please%20upload%20a%20CSV%20file");
	}

	const rows = parseCsv(await file.text());
	const [headers, ...bodyRows] = rows;

	if (!headers || bodyRows.length === 0) {
		redirect(
			"/businesses?error=CSV%20must%20include%20a%20header%20and%20at%20least%20one%20row",
		);
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
			phone: get("phone"),
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
			records.map((record) => record.email),
		)
		.returns<Array<{ email: string }>>();
	const existingEmails = new Set(
		(existingBusinesses ?? []).map((business) => business.email.toLowerCase()),
	);
	const newRecords = records.filter(
		(record) => !existingEmails.has(record.email),
	);
	skipped += records.length - newRecords.length;

	if (newRecords.length === 0) {
		redirect(
			`/businesses?success=No%20new%20businesses%20imported,%20${skipped}%20skipped`,
		);
	}

	const { error } = await supabase.from("businesses").insert(newRecords);

	if (error) {
		redirect(`/businesses?error=${encodeURIComponent(error.message)}`);
	}

	revalidatePath("/businesses");
	redirect(
		`/businesses?success=${newRecords.length}%20business(es)%20imported,%20${skipped}%20skipped`,
	);
}

type ExternalCrmBusiness = {
	id: string;
	uid: string | null;
	owner_email: string | null;
	business_email: string | null;
	name: string | null;
	trade_name: string | null;
	dir_name: string | null;
	dir_phone: string | null;
	address: string | null;
	industry: string | null;
	entity_type: string | null;
	status: string | null;
	country_code: string | null;
	risk_score: string | number | null;
	risk_level: string | null;
	insert_date: string | null;
	last_modified: string | null;
	approved_date: string | null;
	kyc_submitted_at: string | null;
	kyc_approved_at: string | null;
	description: string | null;
	url: string | null;
};

type ExternalCrmBusinessResponse = {
	ok: boolean;
	data?: ExternalCrmBusiness[];
	meta?: {
		page?: number;
		limit?: number;
		total?: number;
		pages?: number;
	};
};

type ExistingBusinessMatch = {
	business_id: string;
	email: string;
	external_business_id: string | null;
};

function buildBusinessSyncFilters(formData: FormData) {
	const today = new Date().toISOString().slice(0, 10);
	const from = optionalText(formData.get("from")) ?? "2024-01-01";
	const to = optionalText(formData.get("to")) ?? today;
	const status = optionalText(formData.get("status"));
	const country = optionalText(formData.get("country"));
	const q = optionalText(formData.get("q"));
	const sort = optionalText(formData.get("sort"));
	const order = optionalText(formData.get("order")) ?? "desc";
	const page = Math.max(1, Number(optionalText(formData.get("page")) ?? 1));
	const rawLimit = Number(optionalText(formData.get("limit")) ?? 100);
	const limit = Math.min(500, Math.max(1, rawLimit));

	return {
		from,
		to,
		status,
		country,
		q,
		sort,
		order,
		page,
		limit,
	};
}

function externalStatusToLifecycleStage(
	status: string | null,
	kycSubmittedAt: string | null,
): BusinessLifecycleStage {
	if (status === "active") {
		return "Active";
	}

	if (status === "suspended") {
		return "Suspended";
	}

	if (status === "pending" && kycSubmittedAt) {
		return "KYB Pending";
	}

	return "Registered";
}

function externalStatusToKybStatus(
	status: string | null,
	approvedAt: string | null,
	kycSubmittedAt: string | null,
): KybStatus {
	if (status === "active" || approvedAt) {
		return "Approved";
	}

	if (kycSubmittedAt) {
		return "Submitted";
	}

	return "Not Submitted";
}

function mapExternalBusinessToCrmBusiness(record: ExternalCrmBusiness) {
	const externalBusinessId = cleanExternalText(record.id);
	const ownerEmail = cleanExternalText(record.owner_email)?.toLowerCase();
	const businessEmail = cleanExternalText(record.business_email)?.toLowerCase();
	const email = businessEmail ?? ownerEmail;
	const businessName =
		cleanExternalText(record.name) ??
		cleanExternalText(record.trade_name) ??
		email ??
		(externalBusinessId ? `External business ${externalBusinessId}` : null);
	const approvedAt =
		parseOptionalDate(record.kyc_approved_at) ??
		parseOptionalDate(record.approved_date);
	const kycSubmittedAt = parseOptionalDate(record.kyc_submitted_at);
	const status = cleanExternalText(record.status)?.toLowerCase() ?? null;
	const notes = [
		cleanExternalText(record.description),
		cleanExternalText(record.url)
			? `Website: ${cleanExternalText(record.url)}`
			: null,
		cleanExternalText(record.address)
			? `Address: ${cleanExternalText(record.address)}`
			: null,
		cleanExternalText(record.industry)
			? `Industry: ${cleanExternalText(record.industry)}`
			: null,
		cleanExternalText(record.entity_type)
			? `Entity type: ${cleanExternalText(record.entity_type)}`
			: null,
	]
		.filter(Boolean)
		.join("\n");

	if (!externalBusinessId || !email || !businessName) {
		return null;
	}

	return {
		business_name: businessName,
		country_code: cleanExternalText(record.country_code),
		email,
		external_business_id: externalBusinessId,
		external_last_modified: parseOptionalDate(record.last_modified),
		external_status: status,
		external_uid: cleanExternalText(record.uid),
		kyb_approval_date: approvedAt,
		kyb_status: externalStatusToKybStatus(status, approvedAt, kycSubmittedAt),
		kyb_submission_date: kycSubmittedAt,
		lifecycle_stage: externalStatusToLifecycleStage(status, kycSubmittedAt),
		notes: notes || null,
		owner_name: cleanExternalText(record.dir_name),
		phone: cleanExternalText(record.dir_phone),
		registration_date: parseOptionalDate(record.insert_date),
		risk_level: cleanExternalText(record.risk_level),
		risk_score: parseOptionalNumber(record.risk_score),
	};
}

export async function syncBusinessesFromCrm(formData: FormData) {
	const { currentUser, permissions } = await getCurrentUserContext();

	if (
		!hasModulePermission(currentUser, permissions, "Businesses", "can_create")
	) {
		redirect(
			"/businesses?error=You%20do%20not%20have%20permission%20to%20sync%20businesses",
		);
	}

	const crmSecret = process.env.CRM_SECRET;

	if (!crmSecret) {
		redirect("/businesses?error=CRM_SECRET%20is%20not%20configured");
	}

	const filters = buildBusinessSyncFilters(formData);
	const searchParams = new URLSearchParams();

	Object.entries(filters).forEach(([key, value]) => {
		if (value !== null && value !== undefined && value !== "") {
			searchParams.set(key, String(value));
		}
	});

	const url = `https://app.payscribe.ng/crm/businesses?${searchParams.toString()}`;
	const supabaseAdmin = createSupabaseAdminClient();
	const { data: syncRun, error: syncRunError } = await supabaseAdmin
		.from("business_sync_runs")
		.insert({
			created_by: currentUser.user_id,
			filters,
			status: "Running",
		})
		.select("sync_id")
		.single<{ sync_id: string }>();

	if (syncRunError || !syncRun) {
		redirect(
			`/businesses?error=${encodeURIComponent(syncRunError?.message ?? "Could not create sync run")}`,
		);
	}

	let response: Response;
	let payload: ExternalCrmBusinessResponse;

	try {
		response = await fetch(url, {
			method: "GET",
			headers: {
				Authorization: `Bearer ${crmSecret}`,
			},
			cache: "no-store",
		});
		payload = (await response.json()) as ExternalCrmBusinessResponse;
	} catch (error) {
		const message =
			error instanceof Error ? error.message : "CRM sync request failed";
		await supabaseAdmin
			.from("business_sync_runs")
			.update({
				completed_at: new Date().toISOString(),
				error_message: message,
				status: "Failed",
			})
			.eq("sync_id", syncRun.sync_id);
		redirect(`/businesses?error=${encodeURIComponent(message)}`);
	}

	console.log("CRM businesses sync response", {
		filters,
		meta: payload.meta,
		ok: payload.ok,
		records: payload.data?.length ?? 0,
		status: response.status,
	});

	if (!response.ok || !payload.ok || !Array.isArray(payload.data)) {
		const message = `CRM sync failed with status ${response.status}`;
		await supabaseAdmin
			.from("business_sync_runs")
			.update({
				completed_at: new Date().toISOString(),
				error_message: message,
				records_returned: payload.data?.length ?? 0,
				status: "Failed",
			})
			.eq("sync_id", syncRun.sync_id);
		redirect(`/businesses?error=${encodeURIComponent(message)}`);
	}

	const mappedRecords = payload.data
		.map(mapExternalBusinessToCrmBusiness)
		.filter((record): record is NonNullable<typeof record> => Boolean(record));
	const skipped = payload.data.length - mappedRecords.length;
	const externalIds = mappedRecords.map((record) => record.external_business_id);
	const emails = mappedRecords.map((record) => record.email);
	const [{ data: byExternalId }, { data: byEmail }] = await Promise.all([
		externalIds.length > 0
			? supabaseAdmin
					.from("businesses")
					.select("business_id, email, external_business_id")
					.in("external_business_id", externalIds)
					.returns<ExistingBusinessMatch[]>()
			: Promise.resolve({ data: [] as ExistingBusinessMatch[] }),
		emails.length > 0
			? supabaseAdmin
					.from("businesses")
					.select("business_id, email, external_business_id")
					.in("email", emails)
					.returns<ExistingBusinessMatch[]>()
			: Promise.resolve({ data: [] as ExistingBusinessMatch[] }),
	]);
	const existingByExternalId = new Map(
		(byExternalId ?? [])
			.filter((business) => business.external_business_id)
			.map((business) => [business.external_business_id as string, business]),
	);
	const existingByEmail = new Map(
		(byEmail ?? []).map((business) => [business.email.toLowerCase(), business]),
	);
	let created = 0;
	let updated = 0;
	let failed = skipped;

	for (const mappedRecord of mappedRecords) {
		const existing =
			existingByExternalId.get(mappedRecord.external_business_id) ??
			existingByEmail.get(mappedRecord.email);

		if (existing) {
			const { error } = await supabaseAdmin
				.from("businesses")
				.update(mappedRecord)
				.eq("business_id", existing.business_id);

			if (error) {
				failed += 1;
			} else {
				updated += 1;
				existingByExternalId.set(mappedRecord.external_business_id, {
					...existing,
					external_business_id: mappedRecord.external_business_id,
				});
			}

			continue;
		}

		const { error } = await supabaseAdmin.from("businesses").insert({
			...mappedRecord,
			business_id: mappedRecord.external_business_id,
		});

		if (error) {
			failed += 1;
		} else {
			created += 1;
		}
	}

	await supabaseAdmin
		.from("business_sync_runs")
		.update({
			completed_at: new Date().toISOString(),
			records_created: created,
			records_returned: payload.data.length,
			records_skipped: failed,
			records_updated: updated,
			status: "Completed",
		})
		.eq("sync_id", syncRun.sync_id);

	revalidatePath("/businesses");
	redirect(
		`/businesses?success=CRM%20sync%20complete:%20${created}%20created,%20${updated}%20updated,%20${failed}%20skipped`,
	);
}
