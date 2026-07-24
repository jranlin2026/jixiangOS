# JixiangOS OpenClaw MCP

This is a Node.js stdio MCP server for the authenticated JixiangOS WeChat customer automation routes. It intentionally exposes only two tools:

- `jxos_customer_check` — validates customer information and checks for duplicates before a create attempt.
- `jxos_customer_create` — creates a customer using the matching `precheckToken` returned by `jxos_customer_check` in the same MCP process.

It does not provide browser, shell, file, database, command, generic HTTP, or arbitrary-URL tools.

## Windows installation and start

From the repository root in Command Prompt or PowerShell:

```text
npm install
npm run mcp:openclaw:typecheck
npm run mcp:openclaw:test
```

Set the five environment variables in the environment that starts OpenClaw, then start the MCP process with:

```text
npm run mcp:openclaw:start
```

The server uses Node standard input/output and does not depend on bash, WSL, Unix paths, or platform-specific executables. Task 5 will provide the OpenClaw agent configuration that launches this command.

## Environment

| Variable | Meaning |
| --- | --- |
| `JIXIANG_OS_API_BASE` | JixiangOS HTTPS API origin. `http` is allowed only for `localhost`, `127.0.0.1`, or `::1` development hosts. |
| `JIXIANG_OS_AUTOMATION_TOKEN` | Dedicated automation bearer token. |
| `JIXIANG_OS_WECHAT_SENDER_ID` | Fixed sender identifier accepted by the JixiangOS automation route. |
| `JIXIANG_OS_CUSTOMER_DETAIL_URL_TEMPLATE` | Safe customer detail URL template containing `{detailPath}`, for example `https://jxos.example.invalid{detailPath}`. |
| `JIXIANG_OS_REQUEST_TIMEOUT_MS` | Integer request timeout from 100 to 60000 milliseconds. |

All variables are validated before the stdio server starts. Never place a real token, customer phone number, WeChat ID, or original message in configuration examples, diagnostics, or logs.

## Safe failures

Always call `jxos_customer_check` before `jxos_customer_create` and pass the returned token unchanged with the same customer fields. The adapter keeps only the hash and precheck token needed for this matching check in memory; it does not persist customer contact data or credentials.

Authentication, permission, validation, duplicate, and service-availability responses are returned as short Chinese tool messages. A create timeout, network failure, invalid JSON, or 5xx result is explicitly uncertain and ends in `未写入系统`; it never reports that the customer was created. Re-run the check before deciding whether to retry.
