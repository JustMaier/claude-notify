# Claude Notify Setup

I want you to help me set up claude-notify - a WebPush notification service that lets me get push notifications when you (Claude) complete tasks.

## What to do

1. **Ask me these questions first:**
   - Where should I clone/install the claude-notify server? (default: ~/claude-notify)
   - What port should it run on? (default: 3939)
   - Do I want it installed as a system service so it starts automatically? (yes/no)
   - Do I want the /notify skill installed? (yes/no)
   - Do I want a Stop hook so I get notified when you finish? (yes/no)

2. **Clone and set up the server:**
   ```bash
   git clone https://github.com/YOUR_USERNAME/claude-notify.git <install-path>
   cd <install-path>
   npm install
   ```

3. **If I want it as a system service:**
   - On Linux: Create a systemd service file at /etc/systemd/system/claude-notify.service
   - On macOS: Create a launchd plist at ~/Library/LaunchAgents/com.claude-notify.plist
   - On Windows: Create a scheduled task or startup shortcut
   - Enable and start the service

4. **If I want the skill:**
   ```bash
   mkdir -p ~/.claude/skills
   cp -r <install-path>/skills/send-notification ~/.claude/skills/
   ```
   If the server isn't on localhost:3939, create .env with the correct NOTIFY_URL.

5. **If I want the Stop hook:**
   - Check if ~/.claude/settings.json exists
   - If it does, merge the Stop hook into the existing hooks config
   - If not, create it with just the Stop hook
   - The hook should be:
     ```json
     {
       "hooks": {
         "Stop": [{
           "type": "command",
           "command": "curl -s -X POST http://localhost:<PORT>/notify -H 'Content-Type: application/json' -d '{\"title\":\"Claude\",\"body\":\"Agent stopped\"}' > /dev/null 2>&1 || true"
         }]
       }
     }
     ```

6. **Start the server** (if not running as a service) and tell me to:
   - Open http://localhost:<PORT> in my browser
   - Click "Enable Notifications"
   - For mobile: open the same URL on my phone using my machine's IP

7. **Test it** by sending a test notification:
   ```bash
   curl -X POST http://localhost:<PORT>/notify -H "Content-Type: application/json" -d '{"title":"Setup Complete","body":"claude-notify is working!"}'
   ```

## Notes

- Be careful merging into settings.json - preserve existing hooks
- Use the port I specified throughout
- If installation fails, help me troubleshoot
- After setup, remind me I can use `/notify` to send notifications manually
