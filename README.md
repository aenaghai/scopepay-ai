# ScopePay AI ✳

> **Every change deserves a price.** A hackathon MVP that helps freelancers compare client requests to their agreed scope, draft change orders, approve prices, and accept **real PayPal Sandbox test payments**.

**Status:** Local demonstration build. Not production-ready. ScopePay is not an escrow service, legal adviser, or payment guarantor.

## What is real, and what is demo?

| Feature | Behavior |
| --- | --- |
| Projects and agreements | Real local SQLite storage |
| Scope analysis | Real Gemini API when `GEMINI_API_KEY` is configured; otherwise clearly labeled **offline heuristic preview** (not AI) |
| Editable quote + approval | Real local workflow, amounts validated and stored on the server |
| PayPal Checkout | **Real PayPal Sandbox** Orders v2 API create/capture when credentials are set; never charges real money |
| Verification | Captures are marked paid only when PayPal responds with a completed capture whose currency and amount match the server-side approved quote |

## Run in 5 steps (Mac, Windows, Linux)

1. Install **Python 3.10+**.
2. Download/unzip this folder, then open a terminal inside `scopepay-ai`.
3. Run:

   ```bash
   python3 -m venv .venv
   source .venv/bin/activate  # on Windows: .venv\Scripts\activate
   python -m pip install -r requirements.txt
   cp .env.example .env       # on Windows: copy .env.example .env
   ```

4. Run `python app.py`.
5. Open **http://127.0.0.1:8000**.

No key is necessary to try the UI, create projects, and run the **offline heuristic preview**. An actual AI + PayPal integrated demo *requires both sets of credentials* below.

## Enable Gemini AI

1. Create a Gemini API key at https://aistudio.google.com/apikey
2. Open `.env`, fill `GEMINI_API_KEY=your_key_here`.
3. `GEMINI_MODEL` defaults to `gemini-3.8-flash` as shown in the November 2026 documentation. Change it to a model available to your project if your account does not offer that model.
4. Restart `python app.py`.
5. When you click **Analyze**, the server calls `generateContent`, parses the JSON and shows the model's explanation and suggested client reply. If the call fails, the app reports the failure instead of pretending a heuristic was AI.

**Privacy:** API analysis sends the original agreement and new request to the chosen AI service. Use fictional demo data only unless you have the relevant permissions and safeguards.

## Enable PayPal Sandbox Checkout

1. Visit https://developer.paypal.com/dashboard/applications/sandbox and create/select a **Sandbox REST app**.
2. Copy its **Client ID** and **Secret** to the `.env` file:

   ```dotenv
   PAYPAL_CLIENT_ID=...
   PAYPAL_CLIENT_SECRET=...
   ```

3. In the developer dashboard, use **Sandbox Accounts** to identify a business **merchant** associated with your app, and a *different* personal **buyer** test account.
4. Restart the server. Analyze a client request, set an example USD price, click **Approve & create change order**.
5. Click the PayPal button. Log in using the **Sandbox personal buyer test account**, and approve the sandbox purchase.
6. The app calls the PayPal Orders v2 **capture** endpoint on the server and marks the change `PAID` *only if* the returned capture ID, completed status, USD currency, and amount match the approved order.

**Never paste your secret into screenshots, prompts, or your GitHub repo.** `.env` is ignored by Git.

## Demo script (under 3 minutes)

- **0:00–0:20:** “A freelancer builds a landing page. The client asks for a booking system ‘as one small change.’”
- **0:20–0:45:** Show the original Northstar Studio agreement and paste the sample request.
- **0:45–1:15:** Click **Analyze**. Show Gemini's specific out-of-scope explanation, comparison, and drafted reply. Mention that AI makes a suggestion and a human decides.
- **1:15–1:35:** Adjust the quote price and approve the change order.
- **1:35–2:20:** Open PayPal Sandbox, approve with a sandbox buyer, and show the verified capture ID and amount on return.
- **2:20–2:45:** Show the change order in Recent History. Close: “ScopePay connects the reasoning around scope changes to a verified payment.”

Record actual functioning screens. Do not pretend the offline preview is live AI or a local status is a PayPal payment.

## Routes

- `GET /api/status` — enabled integrations
- `GET /api/projects` — agreements + their change orders
- `POST /api/projects` — create agreement
- `POST /api/projects/{id}/changes` — analyze with Gemini or clearly marked offline preview
- `PATCH /api/changes/{id}/quote` — edit a proposed price
- `POST /api/changes/{id}/approve` — lock price and approve change order
- `POST /api/changes/{id}/paypal/create` — create PayPal Sandbox order from server-stored amount
- `POST /api/changes/{id}/paypal/capture` — capture and validate matching transaction
- `GET /api/docs` — interactive API reference

## Judging / submission checklist

- [ ] Turn on **real Gemini** and capture proof in your demo.
- [ ] Set up **PayPal Sandbox** and complete a successful transaction.
- [ ] Run automated API tests (`python -m pytest -q`, after installing pytest).
- [ ] Make this repository public on GitHub under the included MIT License.
- [ ] Add real screenshots from the running app.
- [ ] Upload an **unlisted or public** YouTube screen recording **under three minutes**.
- [ ] Put the repository URL and YouTube URL into Devpost.
- [ ] Update the Devpost project story and tags to exactly match what you built (`FastAPI`, not `Flask`).

**Deadline:** November 12, 2026 at noon PST = November 13, 2026 at 1:30 AM IST.

## Constraints / security notes

This is a **local hackathon prototype**, not a multi-tenant SaaS. There is no login, CSRF protection, webhook processing, rate limiting, hosted access control, or production-grade idempotency/reconciliation. **Do not deploy publicly without adding authentication, HTTPS, owner authorization, and production security review.** No live PayPal payments are supported.

Data uses a local SQLite database (`scopepay.db`, gitignored). To reset the demo completely, stop the server and delete that file. `app.py` automatically seeds a fictional Northstar Studio sample on first run.

Built using FastAPI, SQLite, JavaScript, PayPal Sandbox Orders v2, and optional Gemini API. No Node toolchain or Raspberry Pi required.
