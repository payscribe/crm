import { AppShell } from "@/components/app-shell";
import {
	bulkUploadBusinesses,
	createBusiness,
	syncBusinessesFromCrm,
} from "@/app/businesses/actions";
import { EmptyTableRow } from "@/components/ui/empty-table-row";
import { FormModal } from "@/components/ui/form-modal";
import { MetricCard } from "@/components/ui/metric-card";
import { PageHeader } from "@/components/ui/page-header";
import { StatusAlert } from "@/components/ui/status-alert";
import { SubmitButton } from "@/components/ui/submit-button";
import { getCurrentUserContext } from "@/lib/auth/current-user";
import {
	businessLifecycleStages,
	kybStatuses,
} from "@/lib/constants/businesses";
import { formatNaira } from "@/lib/format/currency";
import { formatDate } from "@/lib/format/date";
import { hasModulePermission } from "@/lib/permissions/checks";
import type {
	Business,
	BusinessLifecycleStage,
	BusinessSyncRun,
} from "@/lib/types/businesses";
import type { StaffUser } from "@/lib/types/users";
import Link from "next/link";
import { redirect } from "next/navigation";

type BusinessesPageProps = {
	searchParams?: {
		q?: string;
		stage?: string;
		kyb?: string;
		limit?: string;
		page?: string;
		error?: string;
		success?: string;
	};
};

function daysSince(value: string | null) {
	if (!value) {
		return "No transaction";
	}

	const oneDay = 1000 * 60 * 60 * 24;
	const diff = Date.now() - new Date(value).getTime();
	const days = Math.max(0, Math.floor(diff / oneDay));
	return `${days} day${days === 1 ? "" : "s"}`;
}

function parsePositiveInt(value: string | undefined, fallback: number) {
	const parsed = Number(value);
	return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

export default async function BusinessesPage({
	searchParams,
}: BusinessesPageProps) {
	const { supabase, currentUser, permissions } = await getCurrentUserContext();

	if (
		!hasModulePermission(currentUser, permissions, "Businesses", "can_view")
	) {
		redirect("/");
	}

	const query = searchParams?.q?.trim() ?? "";
	const stage = searchParams?.stage ?? "";
	const kyb = searchParams?.kyb ?? "";
	const pageSize = Math.min(
		200,
		parsePositiveInt(searchParams?.limit, 50),
	);
	const currentPage = parsePositiveInt(searchParams?.page, 1);
	const fromIndex = (currentPage - 1) * pageSize;
	const toIndex = fromIndex + pageSize - 1;
	const canCreateBusinesses = hasModulePermission(
		currentUser,
		permissions,
		"Businesses",
		"can_create",
	);

	let businessesQuery = supabase
		.from("businesses")
		.select("*", { count: "exact" });

	if (query) {
		businessesQuery = businessesQuery.or(
			`business_name.ilike.%${query}%,owner_name.ilike.%${query}%,email.ilike.%${query}%,business_id.ilike.%${query}%`,
		);
	}

	if (businessLifecycleStages.includes(stage as BusinessLifecycleStage)) {
		businessesQuery = businessesQuery.eq("lifecycle_stage", stage);
	}

	if (kybStatuses.includes(kyb as never)) {
		businessesQuery = businessesQuery.eq("kyb_status", kyb);
	}

	const [
		{ data: businesses, count: businessCount },
		{ data: staffMembers },
		{ data: latestSyncRun },
	] = await Promise.all([
		businessesQuery
			.order("created_at", { ascending: false })
			.range(fromIndex, toIndex)
			.returns<Business[]>(),
		supabase
			.from("users")
			.select("*")
			.eq("status", "Active")
			.order("full_name", { ascending: true })
			.returns<StaffUser[]>(),
		supabase
			.from("business_sync_runs")
			.select("*")
			.order("started_at", { ascending: false })
			.limit(1)
			.maybeSingle<BusinessSyncRun>(),
	]);

	const records = businesses ?? [];
	const totalBusinesses = businessCount ?? 0;
	const totalPages = Math.max(1, Math.ceil(totalBusinesses / pageSize));
	const safeCurrentPage = Math.min(currentPage, totalPages);
	const displayStart = totalBusinesses === 0 ? 0 : fromIndex + 1;
	const displayEnd = Math.min(fromIndex + records.length, totalBusinesses);
	const paginationParams = new URLSearchParams();

	if (query) {
		paginationParams.set("q", query);
	}

	if (stage) {
		paginationParams.set("stage", stage);
	}

	if (kyb) {
		paginationParams.set("kyb", kyb);
	}

	paginationParams.set("limit", String(pageSize));
	const pageHref = (page: number) => {
		const params = new URLSearchParams(paginationParams);
		params.set("page", String(page));
		return `/businesses?${params.toString()}`;
	};
	const staffById = new Map(
		(staffMembers ?? []).map((staffMember) => [
			staffMember.user_id,
			staffMember.full_name,
		]),
	);

	const stageCounts = businessLifecycleStages.map((stageName) => ({
		stage: stageName,
		count: records.filter((business) => business.lifecycle_stage === stageName)
			.length,
	}));

	const atRiskBusinesses = records.filter(
		(business) => business.lifecycle_stage === "At Risk",
	);
	const todayDate = new Date().toISOString().slice(0, 10);
	const lastSyncDate = latestSyncRun?.completed_at
		? new Date(latestSyncRun.completed_at).toISOString().slice(0, 10)
		: "2024-01-01";

	const inactive30Days = records.filter((business) => {
		if (!business.last_transaction_date) {
			return false;
		}

		const diff =
			Date.now() - new Date(business.last_transaction_date).getTime();
		return Math.floor(diff / (1000 * 60 * 60 * 24)) >= 30;
	});

	// console.log(businesses);

	return (
		<AppShell currentUser={currentUser} permissions={permissions}>
			<section>
				<PageHeader
					eyebrow='Businesses'
					title='Business Lifecycle'
					description='Track registered businesses from KYB through activation, risk, and churn.'
					actions={
						<>
							<Link
								href='/businesses/attention'
								className='rounded border border-neutral-300 bg-white px-4 py-2 text-sm font-semibold text-neutral-800 transition hover:border-payscribe-blue hover:text-payscribe-blue'
							>
								Attention Center
							</Link>
							<Link
								href='/businesses/pipeline'
								className='rounded bg-payscribe-blue px-4 py-2 text-sm font-semibold text-white'
							>
								Pipeline View
							</Link>
							{canCreateBusinesses ? (
								<>
									<FormModal
										buttonLabel='Sync Businesses'
										title='Sync Businesses'
										description='Fetch businesses from the CRM API and reconcile them with this CRM.'
										size='default'
									>
										<form action={syncBusinessesFromCrm} className='grid gap-4'>
											<div className='grid gap-4 md:grid-cols-2'>
												<label className='block'>
													<span className='text-sm font-medium text-neutral-800'>
														From
													</span>
													<input
														name='from'
														type='date'
														defaultValue={lastSyncDate}
														className='mt-2 w-full rounded border border-neutral-300 px-3 py-2 text-sm outline-none transition focus:border-payscribe-blue focus:ring-2 focus:ring-payscribe-blue/20'
													/>
												</label>
												<label className='block'>
													<span className='text-sm font-medium text-neutral-800'>
														To
													</span>
													<input
														name='to'
														type='date'
														defaultValue={todayDate}
														className='mt-2 w-full rounded border border-neutral-300 px-3 py-2 text-sm outline-none transition focus:border-payscribe-blue focus:ring-2 focus:ring-payscribe-blue/20'
													/>
												</label>
												<label className='block'>
													<span className='text-sm font-medium text-neutral-800'>
														Status
													</span>
													<select
														name='status'
														defaultValue=''
														className='mt-2 w-full rounded border border-neutral-300 bg-white px-3 py-2 text-sm outline-none transition focus:border-payscribe-blue focus:ring-2 focus:ring-payscribe-blue/20'
													>
														<option value=''>All statuses</option>
														<option value='active'>Active</option>
														<option value='pending'>Pending</option>
														<option value='suspended'>Suspended</option>
													</select>
												</label>
												<label className='block'>
													<span className='text-sm font-medium text-neutral-800'>
														Country
													</span>
													<select
														name='country'
														defaultValue=''
														className='mt-2 w-full rounded border border-neutral-300 bg-white px-3 py-2 text-sm outline-none transition focus:border-payscribe-blue focus:ring-2 focus:ring-payscribe-blue/20'
													>
														<option value=''>All countries</option>
														<option value='NG'>NG</option>
														<option value='KE'>KE</option>
														<option value='UG'>UG</option>
													</select>
												</label>
												<label className='block md:col-span-2'>
													<span className='text-sm font-medium text-neutral-800'>
														Search
													</span>
													<input
														name='q'
														placeholder='Name, email, or phone'
														className='mt-2 w-full rounded border border-neutral-300 px-3 py-2 text-sm outline-none transition focus:border-payscribe-blue focus:ring-2 focus:ring-payscribe-blue/20'
													/>
												</label>
												<label className='block'>
													<span className='text-sm font-medium text-neutral-800'>
														Sort
													</span>
													<select
														name='sort'
														defaultValue='joined'
														className='mt-2 w-full rounded border border-neutral-300 bg-white px-3 py-2 text-sm outline-none transition focus:border-payscribe-blue focus:ring-2 focus:ring-payscribe-blue/20'
													>
														<option value='joined'>Joined</option>
														<option value='risk_score'>Risk score</option>
														<option value='approved'>Approved</option>
													</select>
												</label>
												<label className='block'>
													<span className='text-sm font-medium text-neutral-800'>
														Order
													</span>
													<select
														name='order'
														defaultValue='desc'
														className='mt-2 w-full rounded border border-neutral-300 bg-white px-3 py-2 text-sm outline-none transition focus:border-payscribe-blue focus:ring-2 focus:ring-payscribe-blue/20'
													>
														<option value='desc'>Descending</option>
														<option value='asc'>Ascending</option>
													</select>
												</label>
												<label className='block'>
													<span className='text-sm font-medium text-neutral-800'>
														Page
													</span>
													<input
														name='page'
														type='number'
														min='1'
														defaultValue='1'
														className='mt-2 w-full rounded border border-neutral-300 px-3 py-2 text-sm outline-none transition focus:border-payscribe-blue focus:ring-2 focus:ring-payscribe-blue/20'
													/>
												</label>
												<label className='block'>
													<span className='text-sm font-medium text-neutral-800'>
														Limit
													</span>
													<input
														name='limit'
														type='number'
														min='1'
														max='500'
														defaultValue='100'
														className='mt-2 w-full rounded border border-neutral-300 px-3 py-2 text-sm outline-none transition focus:border-payscribe-blue focus:ring-2 focus:ring-payscribe-blue/20'
													/>
												</label>
											</div>
											<div className='flex justify-end'>
												<SubmitButton pendingText='Syncing businesses...'>
													Run Sync
												</SubmitButton>
											</div>
										</form>
									</FormModal>
									<FormModal
										buttonLabel='Add Business'
										title='Add Business'
										description='Create a business record manually while the platform database connection is not active.'
										size='default'
									>
										<form action={createBusiness} className='grid gap-4'>
											<label className='block'>
												<span className='text-sm font-medium text-neutral-800'>
													Business name
												</span>
												<input
													required
													name='business_name'
													className='mt-2 w-full rounded border border-neutral-300 px-3 py-2 text-sm outline-none transition focus:border-payscribe-blue focus:ring-2 focus:ring-payscribe-blue/20'
												/>
											</label>
											<div className='grid gap-4 md:grid-cols-2'>
												<label className='block'>
													<span className='text-sm font-medium text-neutral-800'>
														Owner name
													</span>
													<input
														name='owner_name'
														className='mt-2 w-full rounded border border-neutral-300 px-3 py-2 text-sm outline-none transition focus:border-payscribe-blue focus:ring-2 focus:ring-payscribe-blue/20'
													/>
												</label>
												<label className='block'>
													<span className='text-sm font-medium text-neutral-800'>
														Email
													</span>
													<input
														required
														name='email'
														type='email'
														className='mt-2 w-full rounded border border-neutral-300 px-3 py-2 text-sm outline-none transition focus:border-payscribe-blue focus:ring-2 focus:ring-payscribe-blue/20'
													/>
												</label>
												<label className='block'>
													<span className='text-sm font-medium text-neutral-800'>
														Phone
													</span>
													<input
														name='phone'
														className='mt-2 w-full rounded border border-neutral-300 px-3 py-2 text-sm outline-none transition focus:border-payscribe-blue focus:ring-2 focus:ring-payscribe-blue/20'
													/>
												</label>
												<label className='block'>
													<span className='text-sm font-medium text-neutral-800'>
														Registration date
													</span>
													<input
														name='registration_date'
														type='date'
														className='mt-2 w-full rounded border border-neutral-300 px-3 py-2 text-sm outline-none transition focus:border-payscribe-blue focus:ring-2 focus:ring-payscribe-blue/20'
													/>
												</label>
												<label className='block'>
													<span className='text-sm font-medium text-neutral-800'>
														Lifecycle stage
													</span>
													<select
														name='lifecycle_stage'
														defaultValue='Registered'
														className='mt-2 w-full rounded border border-neutral-300 bg-white px-3 py-2 text-sm outline-none transition focus:border-payscribe-blue focus:ring-2 focus:ring-payscribe-blue/20'
													>
														{businessLifecycleStages.map((item) => (
															<option key={item} value={item}>
																{item}
															</option>
														))}
													</select>
												</label>
												<label className='block'>
													<span className='text-sm font-medium text-neutral-800'>
														KYB status
													</span>
													<select
														name='kyb_status'
														defaultValue='Not Submitted'
														className='mt-2 w-full rounded border border-neutral-300 bg-white px-3 py-2 text-sm outline-none transition focus:border-payscribe-blue focus:ring-2 focus:ring-payscribe-blue/20'
													>
														{kybStatuses.map((item) => (
															<option key={item} value={item}>
																{item}
															</option>
														))}
													</select>
												</label>
												<label className='block md:col-span-2'>
													<span className='text-sm font-medium text-neutral-800'>
														CS owner
													</span>
													<select
														name='assigned_cs_owner'
														className='mt-2 w-full rounded border border-neutral-300 bg-white px-3 py-2 text-sm outline-none transition focus:border-payscribe-blue focus:ring-2 focus:ring-payscribe-blue/20'
													>
														<option value=''>Unassigned</option>
														{(staffMembers ?? []).map((staffMember) => (
															<option
																key={staffMember.user_id}
																value={staffMember.user_id}
															>
																{staffMember.full_name}
															</option>
														))}
													</select>
												</label>
											</div>
											<label className='block'>
												<span className='text-sm font-medium text-neutral-800'>
													Notes
												</span>
												<textarea
													name='notes'
													rows={3}
													className='mt-2 w-full rounded border border-neutral-300 px-3 py-2 text-sm outline-none transition focus:border-payscribe-blue focus:ring-2 focus:ring-payscribe-blue/20'
												/>
											</label>
											<div className='flex justify-end'>
												<SubmitButton pendingText='Creating business...'>
													Create Business
												</SubmitButton>
											</div>
										</form>
									</FormModal>
									<FormModal
										buttonLabel='Bulk Upload'
										title='Bulk Upload Businesses'
										description='Upload a CSV to create many business records at once.'
										size='default'
									>
										<form action={bulkUploadBusinesses} className='grid gap-4'>
											<div className='rounded border border-neutral-200 bg-neutral-50 p-3 text-xs leading-5 text-neutral-700'>
												Required columns: <strong>business_name,email</strong>.
												Optional columns: owner_name, phone, lifecycle_stage,
												kyb_status, assigned_cs_owner_email, notes.
											</div>
											<input
												required
												type='file'
												name='csv_file'
												accept='.csv,text/csv'
												className='rounded border border-neutral-300 px-3 py-2 text-sm'
											/>
											<div className='flex justify-end'>
												<SubmitButton pendingText='Uploading...'>
													Upload CSV
												</SubmitButton>
											</div>
										</form>
									</FormModal>
								</>
							) : null}
						</>
					}
				/>

				<StatusAlert type='error' message={searchParams?.error} />
				<StatusAlert type='success' message={searchParams?.success} />

				{latestSyncRun ? (
					<div className='mt-4 rounded border border-neutral-200 bg-white px-4 py-3 text-sm text-neutral-700'>
						<span className='font-semibold text-neutral-950'>
							Last sync:
						</span>{" "}
						{formatDate(latestSyncRun.completed_at ?? latestSyncRun.started_at)}
						{" · "}
						{latestSyncRun.status}
						{" · "}
						{latestSyncRun.records_created} created,{" "}
						{latestSyncRun.records_updated} updated,{" "}
						{latestSyncRun.records_skipped} skipped
					</div>
				) : null}

				<div className='mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4'>
					{stageCounts.map((item) => (
						<MetricCard
							key={item.stage}
							label={item.stage}
							value={item.count}
							density='compact'
						/>
					))}
				</div>

				<div className='mt-4 grid gap-4 md:grid-cols-2'>
					<MetricCard
						label='At Risk Businesses'
						value={atRiskBusinesses.length}
					/>
					<MetricCard
						label='No Transaction for 30+ Days'
						value={inactive30Days.length}
					/>
				</div>

				<div className='mt-6 rounded border border-neutral-200 bg-white p-4'>
					<form className='grid gap-3 lg:grid-cols-[1fr_220px_220px_auto]'>
						<input type='hidden' name='limit' value={pageSize} />
						<input
							name='q'
							defaultValue={query}
							placeholder='Search by name, owner, email, or ID'
							className='rounded border border-neutral-300 px-3 py-2 text-sm outline-none transition focus:border-payscribe-blue focus:ring-2 focus:ring-payscribe-blue/20'
						/>
						<select
							name='stage'
							defaultValue={stage}
							className='rounded border border-neutral-300 bg-white px-3 py-2 text-sm outline-none transition focus:border-payscribe-blue focus:ring-2 focus:ring-payscribe-blue/20'
						>
							<option value=''>All lifecycle stages</option>
							{businessLifecycleStages.map((item) => (
								<option key={item} value={item}>
									{item}
								</option>
							))}
						</select>
						<select
							name='kyb'
							defaultValue={kyb}
							className='rounded border border-neutral-300 bg-white px-3 py-2 text-sm outline-none transition focus:border-payscribe-blue focus:ring-2 focus:ring-payscribe-blue/20'
						>
							<option value=''>All KYB statuses</option>
							{kybStatuses.map((item) => (
								<option key={item} value={item}>
									{item}
								</option>
							))}
						</select>
						<SubmitButton variant='dark' pendingText='Filtering...'>
							Filter
						</SubmitButton>
					</form>
				</div>

				<div className='mt-6 overflow-hidden rounded border border-neutral-200 bg-white'>
					<div className='flex flex-col gap-3 border-b border-neutral-200 px-4 py-3 text-sm text-neutral-700 lg:flex-row lg:items-center lg:justify-between'>
						<div>
							Showing {displayStart} to {displayEnd} of {totalBusinesses}{" "}
							businesses
						</div>
						<form className='flex items-center gap-2'>
							<input type='hidden' name='q' value={query} />
							<input type='hidden' name='stage' value={stage} />
							<input type='hidden' name='kyb' value={kyb} />
							<input type='hidden' name='page' value='1' />
							<label
								htmlFor='business-page-size'
								className='text-sm font-medium text-neutral-700'
							>
								Rows per page
							</label>
							<select
								id='business-page-size'
								name='limit'
								defaultValue={pageSize}
								className='rounded border border-neutral-300 bg-white px-3 py-2 text-sm outline-none transition focus:border-payscribe-blue focus:ring-2 focus:ring-payscribe-blue/20'
							>
								{[25, 50, 100, 200].map((item) => (
									<option key={item} value={item}>
										{item}
									</option>
								))}
							</select>
							<SubmitButton
								variant='secondary'
								size='sm'
								pendingText='Applying...'
							>
								Apply
							</SubmitButton>
						</form>
					</div>
					<div className='overflow-x-auto'>
						<table className='min-w-full divide-y divide-neutral-200 text-sm'>
							<thead className='bg-neutral-50 text-left text-xs font-semibold uppercase tracking-wide text-neutral-500'>
								<tr>
									<th className='px-4 py-3'>Business</th>
									<th className='px-4 py-3'>Lifecycle</th>
									<th className='px-4 py-3'>KYB</th>
									<th className='px-4 py-3'>CS Owner</th>
									<th className='px-4 py-3'>Last Transaction</th>
									<th className='px-4 py-3'>Volume</th>
								</tr>
							</thead>
							<tbody className='divide-y divide-neutral-200'>
								{records.map((business) => (
									<tr key={business.business_id}>
										<td className='px-4 py-4'>
											<div className='font-semibold text-neutral-950'>
												<Link
													href={`/businesses/${business.business_id}`}
													className='text-payscribe-blue hover:underline'
												>
													{business.business_name}
												</Link>
											</div>
											<div className='mt-1 text-xs text-neutral-500'>
												{business.business_id} - {business.email}
											</div>
										</td>
										<td className='px-4 py-4'>
											<span className='rounded border border-neutral-200 px-2 py-1 text-xs font-semibold text-neutral-700'>
												{business.lifecycle_stage}
											</span>
										</td>
										<td className='px-4 py-4 text-neutral-700'>
											{business.kyb_status}
										</td>
										<td className='px-4 py-4 text-neutral-700'>
											{business.assigned_cs_owner
												? (staffById.get(business.assigned_cs_owner) ??
													"Unknown")
												: "Unassigned"}
										</td>
										<td className='px-4 py-4 text-neutral-700'>
											<div>{formatDate(business.last_transaction_date)}</div>
											<div className='mt-1 text-xs text-neutral-500'>
												{daysSince(business.last_transaction_date)}
											</div>
										</td>
										<td className='px-4 py-4 text-neutral-700'>
											<div>
												{formatNaira(business.current_transaction_volume)}
											</div>
											<div className='mt-1 text-xs text-neutral-500'>
												Limit: {formatNaira(business.transaction_limit_amount)}
											</div>
										</td>
									</tr>
								))}

								{records.length === 0 ? (
									<EmptyTableRow colSpan={6} message='No businesses found.' />
								) : null}
							</tbody>
						</table>
					</div>
					<div className='flex flex-col gap-3 border-t border-neutral-200 px-4 py-3 text-sm text-neutral-700 sm:flex-row sm:items-center sm:justify-between'>
						<div>
							Page {safeCurrentPage} of {totalPages}
						</div>
						<div className='flex items-center gap-2'>
							<Link
								href={pageHref(Math.max(1, safeCurrentPage - 1))}
								aria-disabled={safeCurrentPage <= 1}
								className={`rounded border px-3 py-2 font-semibold transition ${
									safeCurrentPage <= 1
										? "pointer-events-none border-neutral-200 text-neutral-400"
										: "border-neutral-300 text-neutral-800 hover:border-payscribe-blue hover:text-payscribe-blue"
								}`}
							>
								Previous
							</Link>
							{Array.from({ length: Math.min(5, totalPages) }, (_, index) => {
								const startPage = Math.min(
									Math.max(1, safeCurrentPage - 2),
									Math.max(1, totalPages - 4),
								);
								const pageNumber = startPage + index;

								return (
									<Link
										key={pageNumber}
										href={pageHref(pageNumber)}
										aria-current={
											pageNumber === safeCurrentPage ? "page" : undefined
										}
										className={`rounded border px-3 py-2 font-semibold transition ${
											pageNumber === safeCurrentPage
												? "border-payscribe-blue bg-blue-50 text-payscribe-blue"
												: "border-neutral-300 text-neutral-800 hover:border-payscribe-blue hover:text-payscribe-blue"
										}`}
									>
										{pageNumber}
									</Link>
								);
							})}
							<Link
								href={pageHref(Math.min(totalPages, safeCurrentPage + 1))}
								aria-disabled={safeCurrentPage >= totalPages}
								className={`rounded border px-3 py-2 font-semibold transition ${
									safeCurrentPage >= totalPages
										? "pointer-events-none border-neutral-200 text-neutral-400"
										: "border-neutral-300 text-neutral-800 hover:border-payscribe-blue hover:text-payscribe-blue"
								}`}
							>
								Next
							</Link>
						</div>
					</div>
				</div>
			</section>
		</AppShell>
	);
}
