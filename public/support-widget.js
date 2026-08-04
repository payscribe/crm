(function () {
	"use strict";

	var currentScript = document.currentScript;
	var scriptOrigin = currentScript
		? new URL(currentScript.src).origin
		: window.location.origin;
	var config = window.PayscribeSupportConfig || {};
	var merchantId =
		(currentScript && currentScript.getAttribute("data-merchant-id")) ||
		config.merchantId ||
		config.merchant_id ||
		"";
	var apiBase =
		(currentScript && currentScript.getAttribute("data-api-base")) ||
		config.apiBase ||
		scriptOrigin;
	var logoUrl =
		(currentScript && currentScript.getAttribute("data-logo-url")) ||
		config.logoUrl ||
		scriptOrigin.replace(/\/$/, "") + "/payscribe-logo.png";
	var sessionId =
		"sw_" +
		Date.now().toString(36) +
		"_" +
		Math.random().toString(36).slice(2, 12);

	if (window.PayscribeSupportWidgetLoaded) {
		return;
	}
	window.PayscribeSupportWidgetLoaded = true;

	function createElement(tag, className, text) {
		var element = document.createElement(tag);
		if (className) {
			element.className = className;
		}
		if (text) {
			element.textContent = text;
		}
		return element;
	}

	function request(path, options) {
		var method = (options && options.method) || "GET";
		var hasBody = Boolean(options && options.body);
		var maxAttempts = method === "GET" ? 2 : 1;

		function attempt(attemptNumber) {
			var controller = typeof AbortController !== "undefined"
				? new AbortController()
				: null;
			var timeout = controller
				? window.setTimeout(function () {
					controller.abort();
				}, 10000)
				: null;

			return fetch(apiBase.replace(/\/$/, "") + path, {
				method: method,
				headers: hasBody ? { "Content-Type": "application/json" } : undefined,
				body: hasBody ? JSON.stringify(options.body) : undefined,
				signal: controller ? controller.signal : undefined,
			})
				.then(function (response) {
					return response.json().then(function (body) {
						if (!response.ok) {
							var message = body && body.error ? body.error : "Request failed";
							var error = new Error(message);
							error.status = response.status;
							throw error;
						}
						return body;
					});
				})
				.catch(function (error) {
					var retryable = !error.status || error.status === 429 || error.status >= 500;
					if (retryable && attemptNumber < maxAttempts) {
						return new Promise(function (resolve) {
							window.setTimeout(resolve, 500);
						}).then(function () {
							return attempt(attemptNumber + 1);
						});
					}
					throw error;
				})
				.finally(function () {
					if (timeout !== null) {
						window.clearTimeout(timeout);
					}
				});
		}

		return attempt(1);
	}

	function buildApiUrl(path) {
		return apiBase.replace(/\/$/, "") + path;
	}

	function logSession(step, extra) {
		if (!merchantId) {
			return Promise.resolve();
		}

		return request("/api/v1/support/sessions", {
			method: "POST",
			body: {
				session_id: sessionId,
				merchant_id: merchantId,
				last_step_completed: step,
				completed: Boolean(extra && extra.completed),
				ticket_reference: extra && extra.ticket_reference,
				metadata: extra || {},
			},
		}).catch(function () {
			return null;
		});
	}

	function formatSupportDate(value) {
		if (!value) {
			return "Not available";
		}

		var date = new Date(value);
		if (Number.isNaN(date.getTime())) {
			return value;
		}

		try {
			return new Intl.DateTimeFormat(undefined, {
				dateStyle: "medium",
				timeStyle: "short",
			}).format(date);
		} catch (error) {
			return date.toLocaleString();
		}
	}

	var style = createElement("style");
	style.textContent =
		".ps-support-button{position:fixed;right:20px;bottom:20px;z-index:2147483000;display:grid;place-items:center;width:58px;height:58px;border:0;border-radius:999px;background:#3362b0;color:#fff;padding:0;box-shadow:0 12px 30px rgba(17,17,17,.22);cursor:pointer}" +
		".ps-support-button svg{width:27px;height:27px;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}" +
		".ps-support-panel{position:fixed;right:20px;bottom:78px;z-index:2147483000;width:min(380px,calc(100vw - 32px));max-height:min(620px,calc(100vh - 104px));overflow:auto;border:1px solid #e5e5e5;border-radius:12px;background:#fff;color:#111;font:14px/1.45 system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;box-shadow:0 18px 45px rgba(17,17,17,.18)}" +
		".ps-support-header{display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid #eee;padding:14px 16px}" +
		".ps-support-brand{display:flex;align-items:center;gap:10px;min-width:0}.ps-support-logo{display:block;width:128px;height:auto;max-height:40px;object-fit:contain;object-position:left center;flex:0 0 auto;background:transparent!important;border-radius:0!important;padding:0!important}.ps-support-title{font-weight:700;color:#333;white-space:nowrap}.ps-support-close{border:0;background:transparent;font-size:22px;line-height:1;cursor:pointer;color:#555}" +
		".ps-support-body{padding:16px}.ps-support-body p{margin:0 0 12px}.ps-support-muted{color:#666;font-size:12px}.ps-support-actions{display:flex;flex-wrap:wrap;align-items:center;gap:10px;margin-top:12px}.ps-support-actions button{flex:1 1 150px;min-height:44px}.ps-support-actions .ps-support-link{flex:0 0 auto;min-height:auto}.ps-support-menu{display:grid;gap:10px;margin-top:12px}.ps-support-option{appearance:none!important;display:flex!important;align-items:center!important;justify-content:space-between!important;gap:12px!important;width:100%!important;box-sizing:border-box!important;border:1px solid #e8e8e8!important;border-radius:8px!important;background:#fff!important;color:#222!important;text-align:left!important;padding:12px!important;cursor:pointer!important;font:inherit!important}.ps-support-option:hover{border-color:#3362b0!important;background:#f8fbff!important}.ps-support-option-copy{display:block}.ps-support-option-title{display:block;font-weight:700;margin-bottom:3px}.ps-support-option-desc{display:block;color:#666;font-size:12px;line-height:1.35}.ps-support-option-arrow{color:#3362b0;font-weight:800}.ps-support-field{display:grid;gap:6px;margin-bottom:12px}.ps-support-field[hidden]{display:none!important}.ps-support-label{font-size:12px;font-weight:700;color:#444}" +
		".ps-support-input,.ps-support-select,.ps-support-textarea{width:100%;box-sizing:border-box;border:1px solid #d4d4d4;border-radius:8px;background:#fff;padding:10px 11px;font:14px system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;outline:none}" +
		".ps-support-date-row{display:grid;grid-template-columns:1fr 1fr;gap:10px}.ps-support-report{border:1px solid #eee;border-radius:8px;background:#fafafa;color:#222;margin:12px 0;padding:12px;white-space:pre-wrap;font:13px/1.55 system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-height:330px;overflow:auto}" +
		".ps-support-responses{display:grid;gap:10px;margin:14px 0}.ps-support-response-title{font-weight:700;color:#222;margin:0}.ps-support-response{border:1px solid #e8e8e8;border-radius:8px;background:#fafafa;padding:10px}.ps-support-response-meta{display:flex;justify-content:space-between;gap:10px;color:#666;font-size:12px;margin-bottom:6px}.ps-support-response-body{white-space:pre-wrap;color:#222;font-size:13px;line-height:1.5}" +
		".ps-support-textarea{min-height:110px;resize:vertical}.ps-support-primary,.ps-support-secondary{border:0;border-radius:8px;padding:10px 12px;font-weight:700;cursor:pointer}.ps-support-link{border:0;background:transparent;color:#3362b0;padding:8px 0;font-weight:700;cursor:pointer}" +
		".ps-support-primary{background:#3362b0;color:#fff}.ps-support-secondary{background:#f5f5f5;color:#222}.ps-support-error{border:1px solid #fecaca;background:#fef2f2;color:#991b1b;border-radius:8px;padding:10px;margin-bottom:12px}" +
		".ps-support-success{border:1px solid #bbf7d0;background:#f0fdf4;color:#166534;border-radius:8px;padding:10px;margin-bottom:12px}.ps-support-review{border:1px solid #eee;border-radius:8px;background:#fafafa;padding:10px;margin:12px 0}.ps-support-review div{margin:5px 0}";
	document.head.appendChild(style);

	var button = createElement("button", "ps-support-button");
	button.setAttribute("aria-label", "Open Payscribe support");
	button.innerHTML =
		'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4z"></path><path d="M8 9h8"></path><path d="M8 13h5"></path></svg>';
	var panel = createElement("section", "ps-support-panel");
	panel.setAttribute("aria-live", "polite");
	panel.hidden = true;

	var header = createElement("div", "ps-support-header");
	var brand = createElement("div", "ps-support-brand");
	var logo = createElement("img", "ps-support-logo");
	logo.src = logoUrl;
	logo.alt = "Payscribe";
	brand.appendChild(logo);
	header.appendChild(brand);
	var close = createElement("button", "ps-support-close", "x");
	close.setAttribute("aria-label", "Close support widget");
	header.appendChild(close);
	var body = createElement("div", "ps-support-body");
	panel.appendChild(header);
	panel.appendChild(body);
	document.body.appendChild(button);
	document.body.appendChild(panel);

	var state = {
		services: [],
		service_id: "",
		transaction_id: "",
		description: "",
		ticket_reference: "",
		report_period: "",
		report_from: "",
		report_to: "",
		report_type: "",
		report_text: "",
		report_meta: null,
	};

	function clearBody() {
		while (body.firstChild) {
			body.removeChild(body.firstChild);
		}
	}

	function showError(message) {
		var error = createElement("div", "ps-support-error", message);
		body.insertBefore(error, body.firstChild);
	}

	function formatReportMeta(meta) {
		if (!meta || typeof meta !== "object") {
			return "";
		}

		var parts = [];
		if (meta.type) {
			parts.push(String(meta.type).replace(/^\w/, function (char) {
				return char.toUpperCase();
			}));
		}

		if (meta.period && meta.period.from && meta.period.to) {
			parts.push(meta.period.from + " to " + meta.period.to);
		}

		if (meta.bid) {
			parts.push("Merchant " + meta.bid);
		}

		return parts.join(" - ");
	}

	function renderIntro() {
		clearBody();
		body.appendChild(createElement("p", "", "How can we help?"));
		var actions = createElement("div", "ps-support-menu");
		var report = createElement("button", "ps-support-option");
		var track = createElement("button", "ps-support-option");
		// var getReport = createElement("button", "ps-support-option");
		var reportCopy = createElement("span", "ps-support-option-copy");
		reportCopy.appendChild(
			createElement("span", "ps-support-option-title", "Report a new issue"),
		);
		report.appendChild(reportCopy);
		report.appendChild(createElement("span", "ps-support-option-arrow", ">"));
		var trackCopy = createElement("span", "ps-support-option-copy");
		trackCopy.appendChild(
			createElement("span", "ps-support-option-title", "Track a ticket"),
		);
		track.appendChild(trackCopy);
		track.appendChild(createElement("span", "ps-support-option-arrow", ">"));
		// var reportInsightCopy = createElement("span", "ps-support-option-copy");
		// reportInsightCopy.appendChild(
		// 	createElement("span", "ps-support-option-title", "Get report"),
		// );
		// getReport.appendChild(reportInsightCopy);
		// getReport.appendChild(createElement("span", "ps-support-option-arrow", ">"));
		report.onclick = function () {
			logSession("report_issue_started");
			renderServiceStep();
		};
		track.onclick = function () {
			logSession("track_ticket_started");
			renderStatusCheck("");
		};
		// getReport.onclick = function () {
		// 	logSession("merchant_report_started");
		// 	renderReportPeriodStep();
		// };
		actions.appendChild(report);
		actions.appendChild(track);
		// actions.appendChild(getReport);
		body.appendChild(actions);
	}

	function renderHelp() {
		clearBody();
		body.appendChild(
			createElement(
				"p",
				"",
				"You can check your dashboard help resources or contact your account manager if you need anything else.",
			),
		);
		var restart = createElement(
			"button",
			"ps-support-secondary",
			"Start again",
		);
		restart.onclick = renderIntro;
		body.appendChild(restart);
	}

	function renderBackToIntro() {
		var back = createElement("button", "ps-support-link", "Back");
		back.onclick = renderIntro;
		return back;
	}

	function renderServiceStep() {
		clearBody();
		body.appendChild(createElement("p", "", "Tell us what this is about."));
		var field = createElement("div", "ps-support-field");
		var select = createElement("select", "ps-support-select");
		select.appendChild(new Option("Select a service", ""));
		state.services.forEach(function (service) {
			select.appendChild(new Option(service.name, service.service_id));
		});
		select.value = state.service_id;
		field.appendChild(createElement("label", "ps-support-label", "Service"));
		field.appendChild(select);
		body.appendChild(field);
		var next = createElement("button", "ps-support-primary", "Continue");
		next.onclick = function () {
			if (!select.value) {
				showError("Select a service to continue.");
				return;
			}
			state.service_id = select.value;
			logSession("service_selected", { service_id: state.service_id });
			renderTransactionStep();
		};
		var actions = createElement("div", "ps-support-actions");
		actions.appendChild(next);
		actions.appendChild(renderBackToIntro());
		body.appendChild(actions);
	}

	function renderTransactionStep() {
		clearBody();
		body.appendChild(
			createElement("p", "", "Do you have a related transaction ID?"),
		);
		var field = createElement("div", "ps-support-field");
		var input = createElement("input", "ps-support-input");
		input.placeholder = "Transaction ID, optional";
		input.value = state.transaction_id;
		field.appendChild(createElement("label", "ps-support-label", "Transaction ID"));
		field.appendChild(input);
		body.appendChild(field);
		var next = createElement("button", "ps-support-primary", "Continue");
		next.onclick = function () {
			state.transaction_id = input.value.trim();
			logSession("transaction_step_completed", {
				has_transaction_id: Boolean(state.transaction_id),
			});
			renderDescriptionStep();
		};
		var actions = createElement("div", "ps-support-actions");
		actions.appendChild(next);
		actions.appendChild(renderBackToIntro());
		body.appendChild(actions);
	}

	function renderDescriptionStep() {
		clearBody();
		body.appendChild(createElement("p", "", "Please describe the issue."));
		var field = createElement("div", "ps-support-field");
		var textarea = createElement("textarea", "ps-support-textarea");
		textarea.placeholder = "Add the key details support needs to investigate.";
		textarea.value = state.description;
		field.appendChild(createElement("label", "ps-support-label", "Issue details"));
		field.appendChild(textarea);
		body.appendChild(field);
		var next = createElement("button", "ps-support-primary", "Review");
		next.onclick = function () {
			state.description = textarea.value.trim();
			if (state.description.length < 10) {
				showError("Describe the issue in at least 10 characters.");
				return;
			}
			logSession("description_completed");
			renderReview();
		};
		var actions = createElement("div", "ps-support-actions");
		actions.appendChild(next);
		actions.appendChild(renderBackToIntro());
		body.appendChild(actions);
	}

	function renderReview() {
		clearBody();
		var service = state.services.find(function (item) {
			return item.service_id === state.service_id;
		});
		body.appendChild(createElement("p", "", "Review your support request."));
		var review = createElement("div", "ps-support-review");
		review.appendChild(createElement("div", "", "Merchant: " + merchantId));
		review.appendChild(
			createElement(
				"div",
				"",
				"Service: " + (service ? service.name : state.service_id),
			),
		);
		review.appendChild(
			createElement(
				"div",
				"",
				"Transaction: " + (state.transaction_id || "Not provided"),
			),
		);
		review.appendChild(createElement("div", "", "Issue: " + state.description));
		body.appendChild(review);
		var submit = createElement("button", "ps-support-primary", "Submit ticket");
		submit.onclick = function () {
			submit.disabled = true;
			submit.textContent = "Submitting...";
			request("/api/v1/support/tickets", {
				method: "POST",
				body: {
					merchant_id: merchantId,
					service_id: state.service_id,
					transaction_id: state.transaction_id || null,
					description: state.description,
					attachments: [],
					session_id: sessionId,
				},
			})
				.then(function (result) {
					state.ticket_reference = result.ticket_reference;
					logSession("submitted", {
						completed: true,
						ticket_reference: result.ticket_reference,
					});
					renderConfirmation(result);
				})
				.catch(function (error) {
					submit.disabled = false;
					submit.textContent = "Submit ticket";
					showError(error.message || "Ticket submission failed.");
				});
		};
		var back = createElement("button", "ps-support-secondary", "Edit details");
		back.onclick = renderDescriptionStep;
		var actions = createElement("div", "ps-support-actions");
		actions.appendChild(submit);
		actions.appendChild(back);
		body.appendChild(actions);
	}

	function renderConfirmation(result) {
		clearBody();
		body.appendChild(
			createElement(
				"div",
				"ps-support-success",
				"Ticket created: " + result.ticket_reference,
			),
		);
		body.appendChild(
			createElement(
				"p",
				"",
				"Support will follow up using the contact details on your merchant account.",
			),
		);
		var status = createElement(
			"button",
			"ps-support-secondary",
			"Check ticket status",
		);
		status.onclick = function () {
			renderStatusCheck(result.ticket_reference);
		};
		body.appendChild(status);
	}

	function renderStatusCheck(defaultReference) {
		clearBody();
		body.appendChild(createElement("p", "", "Enter your ticket reference."));
		var field = createElement("div", "ps-support-field");
		var input = createElement("input", "ps-support-input");
		input.placeholder = "TKT-...";
		input.value = defaultReference || state.ticket_reference || "";
		field.appendChild(createElement("label", "ps-support-label", "Ticket reference"));
		field.appendChild(input);
		body.appendChild(field);
		var check = createElement("button", "ps-support-primary", "Check status");
		check.onclick = function () {
			var reference = input.value.trim();
			if (!reference) {
				showError("Ticket reference is required.");
				return;
			}
			request(
				"/api/v1/support/tickets/" +
					encodeURIComponent(reference) +
					"?merchant_id=" +
					encodeURIComponent(merchantId),
			)
				.then(function (result) {
					clearBody();
					body.appendChild(
						createElement(
							"div",
							"ps-support-success",
							"Status: " + result.status,
						),
					);
					body.appendChild(
						createElement(
							"p",
							"ps-support-muted",
							"Last updated: " + formatSupportDate(result.last_updated),
						),
					);
					if (Array.isArray(result.responses) && result.responses.length > 0) {
						var responses = createElement("div", "ps-support-responses");
						responses.appendChild(
							createElement("div", "ps-support-response-title", "Responses"),
						);
						result.responses.forEach(function (response) {
							var item = createElement("div", "ps-support-response");
							var meta = createElement("div", "ps-support-response-meta");
							meta.appendChild(
								createElement("span", "", response.author || "Support"),
							);
							meta.appendChild(
								createElement(
									"span",
									"",
									formatSupportDate(response.created_at),
								),
							);
							item.appendChild(meta);
							item.appendChild(
								createElement(
									"div",
									"ps-support-response-body",
									response.body || "",
								),
							);
							responses.appendChild(item);
						});
						body.appendChild(responses);
					} else if (result.last_agent_note) {
						var responseFallback = createElement("div", "ps-support-responses");
						responseFallback.appendChild(
							createElement("div", "ps-support-response-title", "Response"),
						);
						var fallbackItem = createElement("div", "ps-support-response");
						fallbackItem.appendChild(
							createElement(
								"div",
								"ps-support-response-body",
								result.last_agent_note,
							),
						);
						responseFallback.appendChild(fallbackItem);
						body.appendChild(responseFallback);
					}
					var again = createElement(
						"button",
						"ps-support-secondary",
						"Check another ticket",
					);
					again.onclick = function () {
						renderStatusCheck("");
					};
					body.appendChild(again);
				})
				.catch(function (error) {
					showError(error.message || "Could not fetch ticket status.");
				});
		};
		var actions = createElement("div", "ps-support-actions");
		actions.appendChild(check);
		actions.appendChild(renderBackToIntro());
		body.appendChild(actions);
	}

	function renderReportPeriodStep() {
		clearBody();
		body.appendChild(createElement("p", "", "Generate a business report."));

		var periodField = createElement("div", "ps-support-field");
		var period = createElement("select", "ps-support-select");
		period.appendChild(new Option("Last 7 days", "7d"));
		period.appendChild(new Option("Last 30 days", "30d"));
		period.appendChild(new Option("Last 90 days", "90d"));
		period.appendChild(new Option("Custom range", "custom"));
		period.value = state.report_period || "30d";
		periodField.appendChild(createElement("label", "ps-support-label", "Period"));
		periodField.appendChild(period);
		body.appendChild(periodField);

		var customField = createElement("div", "ps-support-field");
		var row = createElement("div", "ps-support-date-row");
		var from = createElement("input", "ps-support-input");
		var to = createElement("input", "ps-support-input");
		from.type = "date";
		to.type = "date";
		from.value = state.report_from;
		to.value = state.report_to;
		row.appendChild(from);
		row.appendChild(to);
		customField.appendChild(createElement("label", "ps-support-label", "Custom date range"));
		customField.appendChild(row);
		body.appendChild(customField);

		var typeField = createElement("div", "ps-support-field");
		var type = createElement("select", "ps-support-select");
		type.appendChild(new Option("Overview", "overview"));
		type.appendChild(new Option("Transactions", "transactions"));
		type.appendChild(new Option("Cards", "cards"));
		type.appendChild(new Option("Accounts", "accounts"));
		type.value = state.report_type || "overview";
		typeField.appendChild(createElement("label", "ps-support-label", "Report type"));
		typeField.appendChild(type);
		body.appendChild(typeField);

		function syncCustomVisibility() {
			customField.hidden = period.value !== "custom";
			if (period.value !== "custom") {
				from.value = "";
				to.value = "";
			}
		}

		period.onchange = syncCustomVisibility;
		syncCustomVisibility();

		var next = createElement("button", "ps-support-primary", "Generate report");
		next.onclick = function () {
			state.report_period = period.value;
			state.report_type = type.value;
			state.report_from = "";
			state.report_to = "";

			if (state.report_period === "custom" && (!from.value || !to.value)) {
				showError("Select both start and end dates.");
				return;
			}

			if (state.report_period === "custom" && from.value > to.value) {
				showError("Start date must be before end date.");
				return;
			}

			if (state.report_period === "custom") {
				state.report_from = from.value;
				state.report_to = to.value;
			}

			logSession("merchant_report_filters_selected", {
				period: state.report_period,
				from: state.report_from,
				to: state.report_to,
				type: state.report_type,
			});
			fetchMerchantReport();
		};

		var actions = createElement("div", "ps-support-actions");
		actions.appendChild(next);
		actions.appendChild(renderBackToIntro());
		body.appendChild(actions);
	}

	function renderReportTypeStep() {
		renderReportPeriodStep();
	}

	function reportQueryParams(format) {
		var params = new URLSearchParams();
		params.set("merchant_id", merchantId);
		params.set("period", state.report_period);
		params.set("type", state.report_type);

		if (state.report_period === "custom") {
			params.set("from", state.report_from);
			params.set("to", state.report_to);
		}

		if (format) {
			params.set("format", format);
		}

		return params.toString();
	}

	function fetchMerchantReport() {
		clearBody();
		body.appendChild(createElement("p", "", "Preparing your report..."));

		request("/api/v1/support/reports?" + reportQueryParams())
			.then(function (result) {
				state.report_text = result.report || "";
				state.report_meta = result.meta || null;
				renderReportInline();
			})
			.catch(function (error) {
				clearBody();
				showError(error.message || "Could not generate report.");
				var actions = createElement("div", "ps-support-actions");
				actions.appendChild(renderBackToIntro());
				body.appendChild(actions);
			});
	}

	function renderReportReady() {
		renderReportInline();
	}

	function renderReportInline() {
		clearBody();
		body.appendChild(
			createElement("div", "ps-support-success", "Report ready"),
		);
		var meta = formatReportMeta(state.report_meta);
		if (meta) {
			body.appendChild(createElement("p", "ps-support-muted", meta));
		}
		body.appendChild(
			createElement(
				"div",
				"ps-support-report",
				state.report_text || "No report content was returned.",
			),
		);

		var pdf = createElement("button", "ps-support-primary", "Export PDF");
		pdf.onclick = function () {
			window.open(
				buildApiUrl("/api/v1/support/reports?" + reportQueryParams("pdf")),
				"_blank",
				"noopener",
			);
		};

		var actions = createElement("div", "ps-support-actions");
		actions.appendChild(pdf);
		actions.appendChild(renderBackToIntro());
		body.appendChild(actions);
	}

	function openWidget() {
		panel.hidden = false;
		button.hidden = true;
		if (!merchantId) {
			clearBody();
			showError("Support widget merchant ID is missing.");
			return;
		}
		clearBody();
		body.appendChild(createElement("p", "", "Loading support..."));
		request("/api/v1/support/services")
			.then(function (services) {
				state.services = services;
				logSession("opened");
				renderIntro();
			})
			.catch(function (error) {
				if (window.console && typeof window.console.error === "function") {
					window.console.error("Payscribe support failed to load", error);
				}
				clearBody();
				showError(
					"Support is temporarily unavailable. Please try again shortly.",
				);
			});
	}

	button.onclick = openWidget;
	close.onclick = function () {
		panel.hidden = true;
		button.hidden = false;
	};

	window.PayscribeSupportWidget = {
		open: openWidget,
	};
})();
