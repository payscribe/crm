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
		var isFormData = hasBody && typeof FormData !== "undefined" && options.body instanceof FormData;
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
				headers: hasBody && !isFormData ? { "Content-Type": "application/json" } : undefined,
				body: hasBody ? (isFormData ? options.body : JSON.stringify(options.body)) : undefined,
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

	function ticketSessionStorageKey(ticketReference) {
		return "payscribe_support_ticket_session:" + merchantId + ":" + ticketReference;
	}

	function rememberTicketSession(ticketReference) {
		try {
			window.localStorage.setItem(ticketSessionStorageKey(ticketReference), sessionId);
		} catch (error) {
			// The in-memory session remains available when storage is blocked.
		}
	}

	function sessionForTicket(ticketReference) {
		try {
			return window.localStorage.getItem(ticketSessionStorageKey(ticketReference)) || sessionId;
		} catch (error) {
			return sessionId;
		}
	}

	var style = createElement("style");
	style.textContent =
		".ps-support-panel[hidden],.ps-support-button[hidden]{display:none!important}" +
		".ps-support-button{position:fixed;right:20px;bottom:20px;z-index:2147483000;display:grid;place-items:center;width:58px;height:58px;border:0;border-radius:999px;background:#3362b0;color:#fff;padding:0;box-shadow:0 12px 30px rgba(17,17,17,.22);cursor:pointer}" +
		".ps-support-button svg{width:27px;height:27px;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}" +
		".ps-support-panel{position:fixed;right:20px;bottom:88px;z-index:2147483000;display:flex;flex-direction:column;width:min(390px,calc(100vw - 32px));height:auto;max-height:min(640px,calc(100dvh - 112px));overflow:hidden;border:1px solid #e5e7eb;border-radius:18px;background:#fff;color:#111827;font:14px/1.45 system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;box-shadow:0 24px 64px rgba(15,23,42,.2)}.ps-support-panel.ps-support-panel-chat{height:min(640px,calc(100dvh - 112px))}" +
		".ps-support-header{display:flex;flex:0 0 auto;align-items:center;justify-content:space-between;border-bottom:1px solid #eef0f3;padding:15px 18px;background:#fff}" +
		".ps-support-brand{display:flex;align-items:center;gap:10px;min-width:0}.ps-support-logo{display:block;width:128px;height:auto;max-height:38px;object-fit:contain;object-position:left center;flex:0 0 auto;background:transparent!important;border-radius:0!important;padding:0!important}.ps-support-title{font-weight:700;color:#333;white-space:nowrap}.ps-support-close{appearance:none!important;display:grid!important;box-sizing:border-box!important;width:34px!important;min-width:34px!important;height:34px!important;min-height:34px!important;place-items:center!important;margin:0!important;border:0!important;border-radius:999px!important;background:#f3f4f6!important;padding:0!important;cursor:pointer!important;color:#64748b!important;line-height:1!important;box-shadow:none!important;transform:none!important;transition:.2s}.ps-support-close:hover{background:#e5e7eb!important;color:#111827!important}.ps-support-close svg{display:block!important;width:16px!important;height:16px!important;margin:0!important;fill:none!important;stroke:currentColor!important;stroke-width:2.25!important;stroke-linecap:round!important;pointer-events:none}" +
		".ps-support-body{flex:1;min-height:0;overflow:auto;padding:16px}.ps-support-body.ps-support-body-chat{display:flex;overflow:hidden;padding:0}.ps-support-body p{margin:0 0 12px}.ps-support-muted{color:#666;font-size:12px}.ps-support-actions{display:flex;flex-wrap:wrap;align-items:center;gap:10px;margin-top:12px}.ps-support-actions button{flex:1 1 150px;min-height:44px}.ps-support-actions .ps-support-link{flex:0 0 auto;min-height:auto}.ps-support-menu{display:grid;gap:10px;margin-top:12px}.ps-support-option{appearance:none!important;display:flex!important;align-items:center!important;justify-content:space-between!important;gap:12px!important;width:100%!important;box-sizing:border-box!important;border:1px solid #e8e8e8!important;border-radius:8px!important;background:#fff!important;color:#222!important;text-align:left!important;padding:12px!important;cursor:pointer!important;font:inherit!important}.ps-support-option:hover{border-color:#3362b0!important;background:#f8fbff!important}.ps-support-option-copy{display:block}.ps-support-option-title{display:block;font-weight:700;margin-bottom:3px}.ps-support-option-desc{display:block;color:#666;font-size:12px;line-height:1.35}.ps-support-option-arrow{color:#3362b0;font-weight:800}.ps-support-field{display:grid;gap:6px;margin-bottom:12px}.ps-support-field[hidden]{display:none!important}.ps-support-label{font-size:12px;font-weight:700;color:#444}" +
		".ps-support-input,.ps-support-select,.ps-support-textarea{width:100%;box-sizing:border-box;border:1px solid #d4d4d4;border-radius:8px;background:#fff;padding:10px 11px;font:14px system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;outline:none}" +
		".ps-support-date-row{display:grid;grid-template-columns:1fr 1fr;gap:10px}.ps-support-report{border:1px solid #eee;border-radius:8px;background:#fafafa;color:#222;margin:12px 0;padding:12px;white-space:pre-wrap;font:13px/1.55 system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-height:330px;overflow:auto}" +
		".ps-support-chat{display:flex;flex:1;min-height:0;width:100%;flex-direction:column;background:#f8fafc}.ps-support-chat-status{display:flex;flex:0 0 auto;align-items:center;justify-content:space-between;gap:8px;border-bottom:1px solid #e5e7eb;background:#fff;padding:11px 16px}.ps-support-chat-status strong{font-size:12px;color:#374151}.ps-support-live{display:inline-flex;align-items:center;gap:5px;color:#15803d;font-size:11px;font-weight:600}.ps-support-live:before{content:'';width:7px;height:7px;border-radius:50%;background:#22c55e;box-shadow:0 0 0 3px rgba(34,197,94,.12)}.ps-support-messages{display:flex;flex:1;min-height:0;flex-direction:column;gap:12px;overflow-y:auto;padding:16px;scroll-behavior:smooth}.ps-support-message{max-width:82%;border-radius:16px;padding:10px 12px;box-shadow:0 1px 2px rgba(15,23,42,.06)}.ps-support-message-agent{align-self:flex-start;border:1px solid #e5e7eb;border-bottom-left-radius:5px;background:#fff;color:#1f2937}.ps-support-message-customer{align-self:flex-end;border-bottom-right-radius:5px;background:#3362b0;color:#fff}.ps-support-message-meta{display:flex;justify-content:space-between;gap:12px;margin-bottom:5px;font-size:10px;opacity:.72}.ps-support-message-body{white-space:pre-wrap;overflow-wrap:anywhere;font-size:13px;line-height:1.5}.ps-support-attachment{margin-top:9px;overflow:hidden;border:1px solid rgba(255,255,255,.28);border-radius:11px;color:inherit;font-size:11px}.ps-support-message-agent .ps-support-attachment{border-color:#e5e7eb}.ps-support-attachment-preview{display:block;height:128px;background:#fff;color:#222;text-decoration:none}.ps-support-attachment-preview img,.ps-support-attachment-preview iframe{display:block;width:100%;height:100%;border:0;object-fit:cover}.ps-support-attachment-preview iframe{pointer-events:none}.ps-support-attachment-info{display:flex;flex-wrap:wrap;align-items:center;gap:6px;padding:8px}.ps-support-attachment-name{min-width:0;flex:1 1 100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-weight:700}.ps-support-attachment-action{display:inline-flex;border-radius:6px;background:rgba(255,255,255,.14);padding:3px 7px;color:inherit;font-weight:700;text-decoration:none}.ps-support-message-agent .ps-support-attachment-action{background:#eef2ff;color:#315fae}.ps-support-chat-empty{margin:auto;color:#6b7280;text-align:center;font-size:12px}.ps-support-chat-actions{display:flex;flex:0 0 auto;gap:14px;margin:0!important;border-top:1px solid #eef0f3;background:#fff;padding:8px 16px}.ps-support-chat-actions button{flex:0 0 auto!important;min-height:auto!important;padding:5px 0!important;font-size:12px}.ps-support-composer{display:grid;flex:0 0 auto;grid-template-columns:44px minmax(0,1fr) auto;align-items:end;gap:8px;border-top:1px solid #e5e7eb;background:#fff;padding:12px 14px 14px}.ps-support-composer textarea{display:block;height:44px;min-height:44px;max-height:96px;margin:0;resize:none;border-color:#d1d5db;border-radius:11px;padding:11px 12px;line-height:20px}.ps-support-composer textarea:focus{border-color:#3362b0;box-shadow:0 0 0 3px rgba(51,98,176,.12)}.ps-support-composer>.ps-support-primary{height:44px;min-height:44px;border-radius:11px;padding:0 15px}.ps-support-attach{display:grid;box-sizing:border-box;width:44px;height:44px;place-items:center;margin:0;border:1px solid #d1d5db;border-radius:11px;background:#fff;color:#3362b0;cursor:pointer;transition:.2s}.ps-support-attach:hover{border-color:#3362b0;background:#f5f8ff}.ps-support-attach svg{width:19px;height:19px;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}.ps-support-attach input{display:none}.ps-support-file-name{grid-column:1/-1;overflow:hidden;border-radius:7px;background:#eef2ff;padding:6px 8px;text-overflow:ellipsis;white-space:nowrap;color:#315fae;font-size:11px}" +
		".ps-support-chat>.ps-support-error{flex:0 0 auto;margin:10px 14px 0;padding:9px 11px}.ps-support-message-customer{border:1px solid #c9daf8;background:#e7effc;color:#173b70}.ps-support-message-customer .ps-support-attachment{border-color:#bfd1ef;background:rgba(255,255,255,.42)}.ps-support-message-customer .ps-support-attachment-action{background:#d4e2f8;color:#244f91}.ps-support-composer[hidden]{display:none!important}.ps-support-textarea{min-height:110px;resize:vertical}.ps-support-primary,.ps-support-secondary{border:0;border-radius:8px;padding:10px 12px;font-weight:700;cursor:pointer}.ps-support-link{border:0;background:transparent;color:#3362b0;padding:8px 0;font-weight:700;cursor:pointer}" +
		".ps-support-primary{background:#3362b0;color:#fff}.ps-support-secondary{background:#f5f5f5;color:#222}.ps-support-error{border:1px solid #fecaca;background:#fef2f2;color:#991b1b;border-radius:8px;padding:10px;margin-bottom:12px}" +
		".ps-support-success{border:1px solid #bbf7d0;background:#f0fdf4;color:#166534;border-radius:8px;padding:10px;margin-bottom:12px}.ps-support-review{border:1px solid #eee;border-radius:8px;background:#fafafa;padding:10px;margin:12px 0}.ps-support-review div{margin:5px 0}@media(max-width:520px){.ps-support-panel{right:8px;bottom:76px;width:calc(100vw - 16px);max-height:calc(100dvh - 92px);border-radius:16px}.ps-support-panel.ps-support-panel-chat{height:min(680px,calc(100dvh - 92px))}.ps-support-messages{padding:14px 12px}.ps-support-message{max-width:88%}.ps-support-composer{grid-template-columns:42px minmax(0,1fr) auto;padding:10px 11px 12px}.ps-support-attach,.ps-support-composer textarea,.ps-support-composer>.ps-support-primary{height:42px;min-height:42px}.ps-support-composer>.ps-support-primary{padding:0 13px}}";
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
	var close = createElement("button", "ps-support-close");
	close.type = "button";
	close.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"></path></svg>';
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
		conversation_stream: null,
	};

	function clearBody() {
		if (state.conversation_stream) {
			state.conversation_stream.close();
			state.conversation_stream = null;
		}
		while (body.firstChild) {
			body.removeChild(body.firstChild);
		}
		body.classList.remove("ps-support-body-chat");
		panel.classList.remove("ps-support-panel-chat");
	}

	function showError(message) {
		var existingError = body.querySelector(".ps-support-error");
		if (existingError) existingError.remove();
		var error = createElement("div", "ps-support-error", message);
		var chat = body.querySelector(".ps-support-chat");
		var messages = chat && chat.querySelector(".ps-support-messages");
		if (chat && messages) {
			chat.insertBefore(error, messages);
		} else {
			body.insertBefore(error, body.firstChild);
		}
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
		rememberTicketSession(result.ticket_reference);
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
				"You can continue the conversation with support here.",
			),
		);
		var status = createElement(
			"button",
			"ps-support-secondary",
			"Open conversation",
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
					encodeURIComponent(merchantId) +
					"&session_id=" +
					encodeURIComponent(sessionForTicket(reference)),
			)
				.then(function (result) {
					state.ticket_reference = reference;
					renderConversation(reference, result);
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

	function messageId() {
		return "msg_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 12);
	}

	function renderConversation(ticketReference, initialResult) {
		clearBody();
		body.classList.add("ps-support-body-chat");
		panel.classList.add("ps-support-panel-chat");
		var chat = createElement("div", "ps-support-chat");
		var statusRow = createElement("div", "ps-support-chat-status");
		var statusText = createElement("strong", "", "Ticket " + ticketReference);
		var live = createElement("span", "ps-support-live", "Live");
		statusRow.appendChild(statusText);
		statusRow.appendChild(live);
		chat.appendChild(statusRow);

		var messages = createElement("div", "ps-support-messages");
		chat.appendChild(messages);
		var composer = createElement("div", "ps-support-composer");
		var attachLabel = createElement("label", "ps-support-attach");
		attachLabel.title = "Add attachment";
		attachLabel.setAttribute("aria-label", "Add attachment");
		attachLabel.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M21.4 11.6 12 21a6 6 0 0 1-8.5-8.5l10-10a4 4 0 0 1 5.7 5.7l-10 10a2 2 0 1 1-2.8-2.8l9.3-9.3"></path></svg>';
		var attachmentInput = createElement("input");
		attachmentInput.type = "file";
		attachmentInput.accept = "image/jpeg,image/png,image/webp,application/pdf,text/plain,.doc,.docx";
		attachLabel.appendChild(attachmentInput);
		var reply = createElement("textarea", "ps-support-textarea");
		reply.placeholder = "Reply to support...";
		reply.maxLength = 2000;
		reply.oninput = function () {
			reply.style.height = "44px";
			reply.style.height = Math.min(reply.scrollHeight, 96) + "px";
		};
		var send = createElement("button", "ps-support-primary", "Send");
		composer.appendChild(attachLabel);
		composer.appendChild(reply);
		composer.appendChild(send);
		var fileName = createElement("div", "ps-support-file-name");
		fileName.hidden = true;
		composer.appendChild(fileName);
		attachmentInput.onchange = function () {
			var file = attachmentInput.files && attachmentInput.files[0];
			if (file && file.size > 5 * 1024 * 1024) {
				attachmentInput.value = "";
				showError("Attachments must be no larger than 5 MB.");
				return;
			}
			fileName.textContent = file ? "Attached: " + file.name : "";
			fileName.hidden = !file;
		};
		var actions = createElement("div", "ps-support-actions");
		actions.classList.add("ps-support-chat-actions");
		var another = createElement("button", "ps-support-link", "Open another ticket");
		another.onclick = function () {
			renderStatusCheck("");
		};
		actions.appendChild(another);
		actions.appendChild(renderBackToIntro());
		chat.appendChild(actions);
		chat.appendChild(composer);
		body.appendChild(chat);
		var conversationResult = initialResult || { status: "open", responses: [] };

		function updateConversation(result) {
			conversationResult = result;
			statusText.textContent = "Ticket " + ticketReference + " · " + result.status;
			while (messages.firstChild) {
				messages.removeChild(messages.firstChild);
			}
			var responses = Array.isArray(result.responses) ? result.responses : [];
			if (responses.length === 0) {
				messages.appendChild(
					createElement("div", "ps-support-chat-empty", "No replies yet. Support will respond here."),
				);
			} else {
				responses.forEach(function (response) {
					var customer = response.sender_type === "customer";
					var item = createElement(
						"div",
						"ps-support-message " +
							(customer ? "ps-support-message-customer" : "ps-support-message-agent"),
					);
					var meta = createElement("div", "ps-support-message-meta");
					meta.appendChild(
						createElement("span", "", customer ? "You" : response.author || "Support"),
					);
					meta.appendChild(
						createElement("span", "", formatSupportDate(response.created_at)),
					);
					item.appendChild(meta);
					item.appendChild(
						createElement("div", "ps-support-message-body", response.body || ""),
					);
					(Array.isArray(response.attachments) ? response.attachments : []).forEach(function (attachment) {
						var card = createElement("div", "ps-support-attachment");
						var downloadUrl = buildApiUrl(attachment.url);
						var previewUrl = downloadUrl + "&disposition=inline";
						var previewable = /^image\//.test(attachment.mime_type) || attachment.mime_type === "application/pdf" || attachment.mime_type === "text/plain";
						if (previewable) {
							var preview = createElement("a", "ps-support-attachment-preview");
							preview.href = previewUrl;
							preview.target = "_blank";
							preview.rel = "noopener noreferrer";
							if (/^image\//.test(attachment.mime_type)) {
								var image = createElement("img");
								image.src = previewUrl;
								image.alt = attachment.name;
								preview.appendChild(image);
							} else {
								var frame = createElement("iframe");
								frame.src = previewUrl;
								frame.title = attachment.name;
								preview.appendChild(frame);
							}
							card.appendChild(preview);
						}
						var info = createElement("div", "ps-support-attachment-info");
						info.appendChild(createElement("span", "ps-support-attachment-name", "📎 " + attachment.name));
						if (previewable) {
							var view = createElement("a", "ps-support-attachment-action", "View");
							view.href = previewUrl;
							view.target = "_blank";
							view.rel = "noopener noreferrer";
							info.appendChild(view);
						}
						var download = createElement("a", "ps-support-attachment-action", "Download");
						download.href = downloadUrl;
						download.setAttribute("download", attachment.name);
						info.appendChild(download);
						card.appendChild(info);
						item.appendChild(card);
					});
					messages.appendChild(item);
				});
			}
			messages.scrollTop = messages.scrollHeight;
			composer.hidden = result.status === "closed" || result.can_reply !== true;
		}

		function appendMessage(message) {
			var responses = Array.isArray(conversationResult.responses)
				? conversationResult.responses.slice()
				: [];
			if (responses.some(function (item) { return item.id === message.id; })) {
				return;
			}
			responses.push(message);
			updateConversation(Object.assign({}, conversationResult, { responses: responses }));
		}

		function reconcileConversation() {
			return request(
				"/api/v1/support/tickets/" +
					encodeURIComponent(ticketReference) +
					"?merchant_id=" +
					encodeURIComponent(merchantId) +
					"&session_id=" +
					encodeURIComponent(sessionForTicket(ticketReference)),
			)
				.then(updateConversation)
				.catch(function () {
					live.textContent = "Reconnecting";
				});
		}

		send.onclick = function () {
			var replyBody = reply.value.trim();
			var attachment = attachmentInput.files && attachmentInput.files[0];
			if (!replyBody && !attachment) {
				return;
			}
			send.disabled = true;
			send.textContent = "Sending...";
			var replyData = new FormData();
			replyData.append("merchant_id", merchantId);
			replyData.append("session_id", sessionForTicket(ticketReference));
			replyData.append("body", replyBody);
			replyData.append("client_message_id", messageId());
			if (attachment) replyData.append("attachment", attachment);
			request("/api/v1/support/tickets/" + encodeURIComponent(ticketReference), {
				method: "POST",
				body: replyData,
			})
				.then(function (result) {
					reply.value = "";
					reply.style.height = "44px";
					attachmentInput.value = "";
					fileName.hidden = true;
					if (result && result.message) appendMessage(result.message);
				})
				.catch(function (error) {
					showError(error.message || "Could not send your reply.");
				})
				.finally(function () {
					send.disabled = false;
					send.textContent = "Send";
				});
		};

		updateConversation(conversationResult);
		if (conversationResult.can_reply === true && typeof window.EventSource === "function") {
			var streamUrl =
				buildApiUrl("/api/v1/support/tickets/" + encodeURIComponent(ticketReference) + "/stream") +
				"?merchant_id=" + encodeURIComponent(merchantId) +
				"&session_id=" + encodeURIComponent(sessionForTicket(ticketReference));
			state.conversation_stream = new window.EventSource(streamUrl);
			state.conversation_stream.onopen = function () {
				live.textContent = "Connecting";
			};
			state.conversation_stream.addEventListener("ready", function () {
				live.textContent = "Live";
				reconcileConversation();
			});
			state.conversation_stream.onmessage = function (event) {
				try {
					appendMessage(JSON.parse(event.data));
				} catch (error) {
					// Ignore malformed upstream events and keep the stream connected.
				}
			};
			state.conversation_stream.addEventListener("ticket-status", function (event) {
				try {
					var update = JSON.parse(event.data);
					updateConversation(Object.assign({}, conversationResult, { status: update.status }));
					if (update.message) appendMessage(update.message);
				} catch (error) {
					// EventSource reconnects automatically if the connection is interrupted.
				}
			});
			state.conversation_stream.onerror = function () {
				live.textContent = "Reconnecting";
			};
		} else if (conversationResult.can_reply === true) {
			live.textContent = "Refresh to update";
		} else {
			live.textContent = "Read only";
		}
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
		if (state.conversation_stream) {
			state.conversation_stream.close();
			state.conversation_stream = null;
		}
		panel.hidden = true;
		button.hidden = false;
	};

	window.PayscribeSupportWidget = {
		open: openWidget,
	};
})();
