# Payscribe CRM

Internal CRM for Payscribe operations, growth, customer success, partner tracking, product events, and reporting.

## Local Setup

1. Install dependencies:

```bash
npm install
```

2. Create `.env.local` from `.env.local.example` and add the Supabase and integration credentials.

3. Start the development server:

```bash
npm run dev
```

4. Open `http://localhost:3000`.

## Google Workspace support email

The CRM uses the same inbound rules and customer email templates for Postmark and Google Apps Script. Use an isolated staging CRM and database for testing: the test-recipient setting redirects **all** ticket emails handled by that instance. Set `EMAIL_PROVIDER=google_apps_script`, `GOOGLE_EMAIL_MAILBOX=tomiwa@payscribe.co`, and a long random `INBOUND_EMAIL_WEBHOOK_SECRET` in the staging CRM environment. The mailbox value controls which Apps Script instance may call the CRM. Set `GOOGLE_EMAIL_TEST_RECIPIENT` to an address you control while testing; the CRM redirects outbound ticket emails there and prefixes the subject with `[CRM TEST]`. Test sends do not set the ticket's customer notification timestamp. Do not set a test recipient on the live CRM.

Create a Google Apps Script project while signed in to the mailbox, paste [scripts/google-apps-script-inbound-tickets.js](scripts/google-apps-script-inbound-tickets.js), and set these **Script Properties**:

| Property | Value for testing |
| --- | --- |
| `CRM_BASE_URL` | Public HTTPS URL of the deployed CRM; Google cannot reach `localhost` |
| `CRM_SECRET` | Same value as `INBOUND_EMAIL_WEBHOOK_SECRET` |
| `MAILBOX_EMAIL` | `tomiwa@payscribe.co` |
| `TEST_RECIPIENT` | Same address as `GOOGLE_EMAIL_TEST_RECIPIENT` |
| `INBOUND_QUERY` | `in:inbox label:crm-test newer_than:14d` |
| `INBOUND_START_AT` | ISO time just before the first test email, for example `2026-09-17T09:00:00Z` |

In [Apps Script](https://script.google.com), create a standalone project while signed in as the mailbox owner. Replace the contents of `Code.gs` with the script above and save it. Open **Project Settings → Script Properties** to add the properties in the table. Apply the `crm-test` Gmail label only to messages you want the test script to ingest. Set `INBOUND_START_AT` before sending the first test message; it prevents older messages in the same Gmail thread from being imported. Select `processSupportEmail` in the editor and click **Run** once to grant Gmail, URL Fetch, Mail, Lock, and Properties permissions. Then send a new test request **from an external address** and apply the `crm-test` label. The inherited Postmark rules ignore all `@payscribe.co` senders. Run `processSupportEmail` again and check the CRM ticket, Apps Script **Executions**, and Gmail **Sent**. After confirming the test, open **Triggers → Add Trigger**, select `processSupportEmail`, choose **Time-driven** and a five-minute interval, then save. Apps Script processes messages whether or not staff have read them; CRM message IDs prevent duplicate tickets.

When moving to `support@payscribe.co`, run the script as that Workspace mailbox, change `MAILBOX_EMAIL` and `GOOGLE_EMAIL_MAILBOX` together, set `INBOUND_QUERY` to the production inbox, set `INBOUND_START_AT` to the cutover time, and remove both test-recipient settings. `support@payscribe.co` must be a mailbox that can own and run Apps Script; if it is only an alias or group, sending as that address needs a different setup. The old Postmark queue remains separate and is not replayed automatically. Inspect any failed Postmark events before deciding whether to resend them.

The Google sender retries failed queue items after five minutes, up to five attempts per event. Apps Script keeps a local sent marker so a failed CRM acknowledgement can be retried without intentionally sending again. There remains a narrow duplicate risk if Google accepts an email but Apps Script stops before it saves that marker; check Sent Mail before manually retrying an uncertain event.

For a focused test on the live CRM, leave `GOOGLE_EMAIL_TEST_RECIPIENT` unset in Vercel. In Apps Script set `TEST_TICKET_ID` to the test ticket and `TEST_RECIPIENT` to that ticket's actual sender address. Deploy the matching CRM route and paste the updated Apps Script: the script requests only that ticket's outbound events and adds a unique query value to avoid a stale response. Other tickets are skipped without changing their queue status. Remove both Apps Script test properties only when regular customer sending is ready.

## Lead email history (shared sales mailbox)

A Google Apps Script on the shared sales mailbox logs every email sent to or received from a lead's address into that lead's communication log, and posts new ones to the lead's Slack thread. The CRM does not send email to leads; staff keep writing from Gmail.

1. Run [supabase/step-35-lead-email-sync.sql](supabase/step-35-lead-email-sync.sql) in the Supabase SQL editor.
2. In the CRM environment, set `LEAD_EMAIL_MAILBOX` to the shared mailbox address and `LEAD_EMAIL_SYNC_SECRET` to a long random value. These are separate from the support mailbox settings, so ticket email is unaffected.
3. While signed in to the shared mailbox, create a standalone [Apps Script](https://script.google.com) project, paste [scripts/google-apps-script-lead-email-sync.js](scripts/google-apps-script-lead-email-sync.js) into `Code.gs`, and set these **Script Properties**:

| Property | Value |
| --- | --- |
| `CRM_BASE_URL` | Public HTTPS URL of the deployed CRM |
| `CRM_SECRET` | Same value as `LEAD_EMAIL_SYNC_SECRET` |
| `MAILBOX_EMAIL` | Same value as `LEAD_EMAIL_MAILBOX` |
| `HISTORY_DAYS` | Optional. Days of past email to import for a lead; defaults to `90` |

4. Select `syncLeadEmails` and click **Run** once to grant Gmail, URL Fetch, Lock and Properties permissions. Then add a **Time-driven** trigger for `syncLeadEmails` every five minutes.

Each run does two things. New mail since the previous run that involves any lead's address is logged and posted to that lead's Slack thread, mentioning the assignee when the lead wrote in. Then, for leads whose email is new or changed, the last `HISTORY_DAYS` of mail is imported into the log without posting to Slack. History imports work through leads a few at a time and stop after about four minutes, so the first import for a large lead list takes several runs. Messages are keyed by their `Message-ID` header, so re-sent batches are never logged twice.

An email counts as **Outbound** when it was sent from the shared mailbox or another address on its domain, and **Inbound** otherwise. Logged emails update the lead's last contact date. Synced emails the lead sent do not count toward the leads list's Follow-ups Done column.

Use a sales or marketing mailbox here, not the support mailbox. The support mailbox runs its own ticket script with its own `CRM_SECRET`; the two scripts, mailboxes and secrets are independent, and neither script reads the other mailbox.
