(function () {
  "use strict";

  var currentScript = document.currentScript;
  var scriptOrigin = currentScript ? new URL(currentScript.src).origin : window.location.origin;
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
    return fetch(apiBase.replace(/\/$/, "") + path, {
      method: (options && options.method) || "GET",
      headers: {
        "Content-Type": "application/json"
      },
      body: options && options.body ? JSON.stringify(options.body) : undefined
    }).then(function (response) {
      return response.json().then(function (body) {
        if (!response.ok) {
          var message = body && body.error ? body.error : "Request failed";
          throw new Error(message);
        }
        return body;
      });
    });
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
        metadata: extra || {}
      }
    }).catch(function () {
      return null;
    });
  }

  var style = createElement("style");
  style.textContent =
    ".ps-support-button{position:fixed;right:20px;bottom:20px;z-index:2147483000;display:grid;place-items:center;width:58px;height:58px;border:0;border-radius:999px;background:#3362b0;color:#fff;padding:0;box-shadow:0 12px 30px rgba(17,17,17,.22);cursor:pointer}" +
    ".ps-support-button svg{width:27px;height:27px;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}" +
    ".ps-support-panel{position:fixed;right:20px;bottom:78px;z-index:2147483000;width:min(380px,calc(100vw - 32px));max-height:min(620px,calc(100vh - 104px));overflow:auto;border:1px solid #e5e5e5;border-radius:12px;background:#fff;color:#111;font:14px/1.45 system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;box-shadow:0 18px 45px rgba(17,17,17,.18)}" +
    ".ps-support-header{display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid #eee;padding:14px 16px}" +
    ".ps-support-title{font-weight:700}.ps-support-close{border:0;background:transparent;font-size:22px;line-height:1;cursor:pointer;color:#555}" +
    ".ps-support-body{padding:16px}.ps-support-body p{margin:0 0 12px}.ps-support-muted{color:#666;font-size:12px}.ps-support-actions{display:grid;gap:8px;margin-top:12px}" +
    ".ps-support-input,.ps-support-select,.ps-support-textarea{width:100%;box-sizing:border-box;border:1px solid #d4d4d4;border-radius:8px;padding:10px 11px;font:14px system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;outline:none}" +
    ".ps-support-textarea{min-height:110px;resize:vertical}.ps-support-primary,.ps-support-secondary{border:0;border-radius:8px;padding:10px 12px;font-weight:700;cursor:pointer}" +
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
  header.appendChild(createElement("div", "ps-support-title", "Payscribe Support"));
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
    ticket_reference: ""
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

  function renderIntro() {
    clearBody();
    body.appendChild(createElement("p", "", "How can we help?"));
    var actions = createElement("div", "ps-support-actions");
    var report = createElement("button", "ps-support-primary", "Report a new issue");
    var track = createElement("button", "ps-support-secondary", "Track a ticket");
    report.onclick = function () {
      logSession("report_issue_started");
      renderServiceStep();
    };
    track.onclick = function () {
      logSession("track_ticket_started");
      renderStatusCheck("");
    };
    actions.appendChild(report);
    actions.appendChild(track);
    body.appendChild(actions);
  }

  function renderHelp() {
    clearBody();
    body.appendChild(createElement("p", "", "You can check your dashboard help resources or contact your account manager if you need anything else."));
    var restart = createElement("button", "ps-support-secondary", "Start again");
    restart.onclick = renderIntro;
    body.appendChild(restart);
  }

  function renderBackToIntro() {
    var back = createElement("button", "ps-support-secondary", "Back");
    back.onclick = renderIntro;
    return back;
  }

  function renderServiceStep() {
    clearBody();
    body.appendChild(createElement("p", "", "Which service is this about?"));
    var select = createElement("select", "ps-support-select");
    select.appendChild(new Option("Select a service", ""));
    state.services.forEach(function (service) {
      select.appendChild(new Option(service.name, service.service_id));
    });
    select.value = state.service_id;
    body.appendChild(select);
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
    body.appendChild(createElement("p", "", "Do you have a related transaction ID?"));
    var input = createElement("input", "ps-support-input");
    input.placeholder = "Transaction ID, optional";
    input.value = state.transaction_id;
    body.appendChild(input);
    var next = createElement("button", "ps-support-primary", "Continue");
    next.onclick = function () {
      state.transaction_id = input.value.trim();
      logSession("transaction_step_completed", {
        has_transaction_id: Boolean(state.transaction_id)
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
    var textarea = createElement("textarea", "ps-support-textarea");
    textarea.placeholder = "Add the key details support needs to investigate.";
    textarea.value = state.description;
    body.appendChild(textarea);
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
    review.appendChild(createElement("div", "", "Service: " + (service ? service.name : state.service_id)));
    review.appendChild(createElement("div", "", "Transaction: " + (state.transaction_id || "Not provided")));
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
          session_id: sessionId
        }
      })
        .then(function (result) {
          state.ticket_reference = result.ticket_reference;
          logSession("submitted", {
            completed: true,
            ticket_reference: result.ticket_reference
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
    body.appendChild(createElement("div", "ps-support-success", "Ticket created: " + result.ticket_reference));
    body.appendChild(createElement("p", "", "Support will follow up using the contact details on your merchant account."));
    var status = createElement("button", "ps-support-secondary", "Check ticket status");
    status.onclick = function () {
      renderStatusCheck(result.ticket_reference);
    };
    body.appendChild(status);
  }

  function renderStatusCheck(defaultReference) {
    clearBody();
    body.appendChild(createElement("p", "", "Enter your ticket reference."));
    var input = createElement("input", "ps-support-input");
    input.placeholder = "TKT-...";
    input.value = defaultReference || state.ticket_reference || "";
    body.appendChild(input);
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
          encodeURIComponent(merchantId)
      )
        .then(function (result) {
          clearBody();
          body.appendChild(createElement("div", "ps-support-success", "Status: " + result.status));
          body.appendChild(createElement("p", "ps-support-muted", "Last updated: " + result.last_updated));
          if (result.last_agent_note) {
            body.appendChild(createElement("p", "", result.last_agent_note));
          }
          var again = createElement("button", "ps-support-secondary", "Check another ticket");
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
      .catch(function () {
        clearBody();
        showError("Support is temporarily unavailable. Please try again shortly.");
      });
  }

  button.onclick = openWidget;
  close.onclick = function () {
    panel.hidden = true;
    button.hidden = false;
  };

  window.PayscribeSupportWidget = {
    open: openWidget
  };
})();
