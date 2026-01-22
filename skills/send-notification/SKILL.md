---
name: notify
description: Send a push notification to subscribed devices. Use when completing tasks, finishing builds, or anytime the user should be alerted.
argument-hint: "[title] [body]"
allowed-tools: Bash(curl:*), Read
---

# Send Push Notification

Send a WebPush notification via the claude-notify server.

## Get the server URL

Check if `.env` exists in this skill's directory. If it does, read `NOTIFY_URL` from it. Otherwise use `http://localhost:3939`.

## Parse arguments

From `$ARGUMENTS`, extract:
- **title**: First quoted string or first word (required)
- **body**: Remaining text (optional)

If no arguments: title = "Claude", body = "Task complete"

## Send the notification

```bash
curl -s -X POST <NOTIFY_URL>/notify \
  -H "Content-Type: application/json" \
  -d '{"title":"<TITLE>","body":"<BODY>"}'
```

## Response

The server returns:
```json
{"sent": 1, "failed": 0, "errors": []}
```

Report to the user: "Notification sent" or any errors.

## Examples

```bash
# Simple
curl -s -X POST http://localhost:3939/notify -H "Content-Type: application/json" -d '{"title":"Done"}'

# With body
curl -s -X POST http://localhost:3939/notify -H "Content-Type: application/json" -d '{"title":"Build","body":"Completed successfully"}'

# With tag (groups notifications)
curl -s -X POST http://localhost:3939/notify -H "Content-Type: application/json" -d '{"title":"Test","body":"All passing","tag":"tests"}'
```
