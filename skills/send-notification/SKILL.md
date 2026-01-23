---
name: notify
description: Send a push notification to subscribed devices. Use when completing tasks, finishing builds, or anytime the user should be alerted.
argument-hint: "[title] [body]"
allowed-tools: Bash(curl:*), Read
---

# Send Push Notification

Send a WebPush notification via the claude-notify server.

## Get the server URL and token

Check if `.env` exists in this skill's directory. If it does, read:
- `NOTIFY_URL` - server URL (default: `http://localhost:3939`)
- `NOTIFY_TOKEN` - your notification token (required)

If `.env` doesn't exist or `NOTIFY_TOKEN` is missing, inform the user they need to set it up:
1. Visit the notify server in a browser
2. Copy their token from the "Your Token" section
3. Create `.env` in this skill's directory with `NOTIFY_TOKEN=<their-token>`

## Parse arguments

From `$ARGUMENTS`, extract:
- **title**: First quoted string or first word (required)
- **body**: Remaining text (optional)

If no arguments: title = "Claude", body = "Task complete"

## Send the notification

```bash
curl -s -X POST <NOTIFY_URL>/notify \
  -H "Content-Type: application/json" \
  -d '{"token":"<NOTIFY_TOKEN>","title":"<TITLE>","body":"<BODY>"}'
```

## Response

The server returns:
```json
{"sent": 1, "failed": 0, "errors": [], "recipients": 1}
```

Report to the user: "Notification sent" or any errors.

## Examples

```bash
# Simple notification with token
curl -s -X POST http://localhost:3939/notify \
  -H "Content-Type: application/json" \
  -d '{"token":"abc123-def456","title":"Done"}'

# With body
curl -s -X POST http://localhost:3939/notify \
  -H "Content-Type: application/json" \
  -d '{"token":"abc123-def456","title":"Build","body":"Completed successfully"}'

# With tag (groups notifications)
curl -s -X POST http://localhost:3939/notify \
  -H "Content-Type: application/json" \
  -d '{"token":"abc123-def456","title":"Test","body":"All passing","tag":"tests"}'
```

## .env file format

Create `.env` in this skill's directory:

```
NOTIFY_URL=http://localhost:3939
NOTIFY_TOKEN=your-token-from-the-web-ui
```
