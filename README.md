# claude-notify

A tiny WebPush notification server for Claude Code.

## Why?

When you're running Claude Code agents on long tasks, you don't want to sit there watching. You want to walk away - grab coffee, work on something else, check your phone. But then you miss when it finishes, or when it needs input.

This solves that. Subscribe once from any browser (including your phone), and Claude can ping you when:

- A task completes
- A build or test run finishes
- The agent stops and needs attention
- Anything you configure via hooks

Works great for:

- **Headless/remote machines** - SSH into a server, kick off work, get notified on your phone
- **Long-running tasks** - Start a migration or refactor, go do something else
- **Parallel workflows** - Run multiple agents, get pinged as each finishes

## Quick Setup (Let Claude Do It)

Copy the contents of [SETUP-PROMPT.md](SETUP-PROMPT.md) and paste it to Claude Code. Claude will ask you a few questions and then set up everything: the server, the skill, and hooks.

---

## Manual Setup

### 1. Start the server

```bash
git clone <repo-url> claude-notify
cd claude-notify
npm install
npm start
```

Server runs at `http://localhost:3939`

### 2. Subscribe to notifications

Open `http://localhost:3939` in your browser and click "Enable Notifications".

**For mobile notifications:** Open the same URL on your phone's browser (use your machine's IP address, e.g., `http://192.168.1.100:3939`) and enable notifications there.

### 3. Test it works

```bash
curl -X POST http://localhost:3939/notify \
  -H "Content-Type: application/json" \
  -d '{"title":"Test","body":"It works!"}'
```

You should see a notification pop up.

---

## Integration Options (Manual)

If you used the [quick setup](#quick-setup-let-claude-do-it), these are already configured. Otherwise:

### Option A: Install the `/notify` skill

Copy the skill folder to your Claude Code skills directory:

```bash
# Linux/macOS
cp -r claude-notify/skills/send-notification ~/.claude/skills/

# Windows
xcopy claude-notify\skills\send-notification %USERPROFILE%\.claude\skills\send-notification /E /I
```

If your server isn't on localhost, configure the URL:

```bash
cd ~/.claude/skills/send-notification
cp .env.example .env
# Edit .env to set NOTIFY_URL=http://your-server:3939
```

Then use it in Claude Code:

```
/notify Build complete, ready for review
```

The skill folder is self-contained:
```
send-notification/
├── SKILL.md       # Skill definition
├── .env.example   # Example config
├── .env           # Your config (gitignored)
└── .gitignore
```

### Option B: Set up hooks (automatic notifications)

Add hooks to `.claude/settings.json` to get notified automatically.

**Notify when Claude stops:**

```json
{
  "hooks": {
    "Stop": [{
      "type": "command",
      "command": "curl -s -X POST http://localhost:3939/notify -H 'Content-Type: application/json' -d '{\"title\":\"Claude\",\"body\":\"Agent stopped\"}' > /dev/null 2>&1 || true"
    }]
  }
}
```

**Notify after builds/tests:**

```json
{
  "hooks": {
    "PostToolUse": [{
      "matcher": "Bash",
      "hooks": [{
        "type": "command",
        "command": "if echo \"$TOOL_INPUT\" | grep -qE '(npm|yarn|pnpm) (run )?(build|test)'; then curl -s -X POST http://localhost:3939/notify -H 'Content-Type: application/json' -d '{\"title\":\"Build/Test Complete\"}' > /dev/null 2>&1; fi"
      }]
    }]
  }
}
```

See `examples/hooks.json` for a complete example you can copy from.

### Option C: Direct API calls from agents

Agents can send notifications directly via curl:

```bash
curl -X POST http://localhost:3939/notify \
  -H "Content-Type: application/json" \
  -d '{"title":"Task Complete","body":"Refactoring finished, ready for review"}'
```

---

## API Reference

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/` | GET | Web UI for subscribing |
| `/health` | GET | Status, version, subscription count |
| `/notify` | POST | Send a notification |
| `/subscribe` | POST | Register a push subscription |
| `/unsubscribe` | POST | Remove a subscription |
| `/vapid-public-key` | GET | Public key for client subscriptions |

### POST /notify

| Field | Required | Description |
|-------|----------|-------------|
| `title` | Yes | Notification title |
| `body` | No | Notification body text |
| `url` | No | URL to open when clicked |
| `tag` | No | Tag for grouping/replacing notifications |

**Response:**

```json
{
  "sent": 2,
  "failed": 0,
  "errors": []
}
```

---

## Configuration

| Environment Variable | Default | Description |
|---------------------|---------|-------------|
| `PORT` | 3939 | Server port |

**Auto-generated files (in `data/`):**

- `vapid.json` - VAPID keys (generated on first run)
- `subscriptions.json` - Saved push subscriptions

---

## Running as a Service

To keep the server running in the background:

**Linux (systemd):**

```bash
# Create service file
sudo tee /etc/systemd/system/claude-notify.service << EOF
[Unit]
Description=Claude Notify
After=network.target

[Service]
Type=simple
User=$USER
WorkingDirectory=$(pwd)
ExecStart=$(which node) src/server.js
Restart=on-failure

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl enable claude-notify
sudo systemctl start claude-notify
```

**macOS (launchd):**

```bash
# Create plist
cat > ~/Library/LaunchAgents/com.claude-notify.plist << EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.claude-notify</string>
    <key>ProgramArguments</key>
    <array>
        <string>$(which node)</string>
        <string>$(pwd)/src/server.js</string>
    </array>
    <key>RunAtLoad</key>
    <true/>
    <key>WorkingDirectory</key>
    <string>$(pwd)</string>
</dict>
</plist>
EOF

launchctl load ~/Library/LaunchAgents/com.claude-notify.plist
```

**Windows (startup):**

Create a shortcut to `node src/server.js` in your Startup folder, or use Task Scheduler.

---

## Dependencies

Just one: `web-push` for WebPush protocol encryption. The server uses Node's built-in `http` module.
