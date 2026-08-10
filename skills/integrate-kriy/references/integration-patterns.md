# Integration patterns

## Select the flow

| Need | KRIY flow | Execution rule |
| --- | --- | --- |
| Stream one agent's response to a caller | Direct agent SSE run | Async in concurrent servers; parse incrementally |
| Allow or deny an action inline | Decision gate | Await synchronously before the action |
| Trigger work from a committed business event | Event + workflow | Await queue acceptance; agent work is async |
| Receive a completed workflow result | Signed webhook | Persist, acknowledge, then process async |
| Simple CLI/development completion check | Poll workflow run | Bounded polling outside request threads |

Use synchronous HTTP libraries only in synchronous handlers, CLIs, or single-item workers.
Use the target framework's async client inside an async server. Never block an event loop
with a synchronous client.

## Client boundary

Create one small KRIY client/service that owns:

- base URL normalization;
- `X-API-Key` and optional `X-Workspace-Id` headers;
- request and stream timeouts;
- response/error decoding;
- SSE framing;
- safe retry classification;
- typed request/response structures.

Inject configuration through the repository's existing settings mechanism. Validate the
base URL and required secret at startup or service construction. Redact secrets from
exceptions and logs.

Do not add a general abstraction for every KRIY endpoint when the application needs one
operation. Implement the smallest coherent client and leave extension points obvious.

## Direct SSE runs

Use an SSE-capable HTTP response body and an incremental parser. Network chunks can split
or combine SSE lines. Accumulate bytes/text until a blank line terminates an event; join
multiple `data:` lines with newlines; ignore comments; then parse JSON.

Treat event types as a discriminated union:

- `session`: store the ID before processing later messages;
- `text`: append or forward in order;
- `card`: pass structured UI data only if the target application supports it;
- `tool_confirmation`: stop normal completion, persist the pending call, and require an
  explicit user decision before calling `/confirm`;
- `error`: surface a failed run even if the HTTP status was `200`.

Cancel the upstream body when the downstream caller disconnects only if the product wants
to unsubscribe. Do not assume disconnecting stops the KRIY run; call the stop endpoint for
that behavior. Reattach with the session stream endpoint when needed.

Test fragmented events, multiple events in one chunk, malformed JSON, an SSE `error`
payload, a confirmation pause/resume, timeout, and downstream cancellation.

## Gates in a transaction path

Call the gate before the protected side effect and fail closed when the application cannot
obtain a required verdict. Explicitly map:

- `allow`: continue;
- non-overridable `deny`: stop;
- overridable `deny`: enter the application's own approval process, not automatic allow.

Do not emit a post-action event until the business action commits. If the gate decision and
action require an audit trail, persist the returned gate metadata with the business record.

## Reliable event production

Await `POST /events` and record returned `run_ids` when results must be correlated. Include
a stable `correlation_id` in the payload.

If losing an event is unacceptable, use a transactional outbox:

1. Commit the business change and an outbox row in one database transaction.
2. Let a worker send the KRIY event.
3. Mark the row delivered only after a successful acceptance response.
4. Use stable correlation data and idempotent downstream tools because KRIY currently has
   no event idempotency-key header and a retry can enqueue a second run.

Do not hold an inbound HTTP request open until the agent completes. Return the application's
accepted response, then consume a webhook or let a worker poll.

## Webhook receiver

Configure the framework route to preserve raw body bytes. Verify in this order:

1. Require `X-KRIY-Signature`.
2. Parse `t` and `v1` without accepting duplicates or malformed parts.
3. Reject timestamps outside the configured tolerance.
4. Compute HMAC-SHA256 over `timestamp + b"." + raw_body`.
5. Compare the expected and supplied hex values in constant time.
6. Parse JSON only after verification.
7. Atomically insert by envelope `id`; treat a duplicate as already received.
8. Return `2xx` after persistence and queue processing outside the request.

Test a valid signature, altered body, wrong secret, stale timestamp, malformed header,
duplicate envelope, and retry after a simulated handler failure.

## Verification strategy

Add mocked contract tests at the KRIY client boundary. Assert method, path, headers, timeout,
payload, success decoding, common-envelope decoding, direct-response decoding, and redacted
errors. Do not put real credentials in fixtures or snapshots.

Run the bundled verifier for optional live evidence:

```bash
python path/to/integrate-kriy/scripts/verify_kriy.py \
  --base-url "$KRIY_BASE_URL" \
  --check-openapi
```

The script reads `KRIY_API_KEY` and optional `KRIY_WORKSPACE_ID` from the environment. It
performs only health, schema-discovery, and agent-list reads.
