# SkyNet AI - Notion Automation Setup Guide

## Overview
SkyNet AI can automatically process your meeting transcripts as soon as they're added to Notion, generate development stories, and send them to Slack - all without manual intervention.

## Three Ways to Automate Processing

### 1. **Automatic Polling (Easiest - Already Implemented)**
- SkyNet checks for new transcripts every 2 minutes
- Processes any unprocessed transcripts automatically
- Sends stories to Slack immediately

**To enable:**
Add to your `.env` file:
```
ENABLE_AUTO_PROCESSING=true
```

### 2. **Notion Webhook via Zapier/Make (Instant Processing)**
Use Zapier or Make.com to trigger processing instantly when a new page is added to your Notion database.

#### Zapier Setup:
1. Create a new Zap
2. **Trigger**: Notion - "New Database Item"
   - Connect your Notion account
   - Select your transcripts database
3. **Action**: Webhooks by Zapier - "POST"
   - URL: `http://your-server-url/api/webhook/notion-transcript`
   - Payload Type: JSON
   - Data: 
   ```json
   {
     "pageId": "{{Page ID from Notion}}"
   }
   ```
4. Turn on your Zap

#### Make.com Setup:
1. Create a new scenario
2. **Trigger**: Notion - "Watch Database Items"
   - Select your transcripts database
3. **Action**: HTTP - "Make a Request"
   - URL: `http://your-server-url/api/webhook/notion-transcript`
   - Method: POST
   - Body type: JSON
   - Request content:
   ```json
   {
     "pageId": "{{Page ID}}"
   }
   ```
4. Activate your scenario

### 3. **Manual Webhook Trigger**
You can manually trigger processing for a specific transcript:

```bash
# Process a specific transcript
curl -X POST http://localhost:3001/api/webhook/notion-transcript \
  -H "Content-Type: application/json" \
  -d '{"pageId": "your-notion-page-id"}'

# Process all new transcripts
curl -X POST http://localhost:3001/api/webhook/notion-transcript \
  -H "Content-Type: application/json" \
  -d '{}'
```

## How It Works

1. **Meeting Ends** → Fathom creates transcript in Notion
2. **Detection** → SkyNet detects new transcript (via polling or webhook)
3. **Processing** → AI analyzes transcript and extracts dev stories
4. **Notification** → Stories are automatically sent to Slack
5. **Tracking** → Transcript marked as processed to prevent duplicates

## Required Environment Variables

```env
# Notion Configuration
NOTION_TOKEN=your_notion_integration_token
NOTION_DATABASE_ID=your_transcript_database_id

# OpenAI for Story Generation
OPENAI_API_KEY=your_openai_api_key

# Slack for Notifications
SLACK_WEBHOOK_URL=https://hooks.slack.com/services/YOUR/WEBHOOK/URL

# Enable Auto-Processing
ENABLE_AUTO_PROCESSING=true
```

## Features

- **Duplicate Prevention**: Each transcript is only processed once
- **Smart Detection**: Only processes transcripts with >50 words
- **Immediate Processing**: Stories sent to Slack within seconds
- **Error Recovery**: Failed processing attempts are logged
- **Startup Scan**: Checks for unprocessed transcripts on server start

## Testing Your Setup

1. **Check if auto-processing is enabled:**
   ```bash
   curl http://localhost:3001/api/health
   ```
   Should show `"autoDetection": { "enabled": true }`

2. **Test webhook endpoint:**
   ```bash
   curl -X POST http://localhost:3001/api/webhook/notion-transcript \
     -H "Content-Type: application/json" \
     -d '{}'
   ```

3. **Monitor logs:**
   Your server will log:
   - `🤖 SkyNet auto-processing scan started...` - Every 2 minutes
   - `📄 Processing specific transcript: [Title]` - When processing
   - `✅ Webhook processing complete` - After successful processing
   - `📤 Sending X stories to Slack...` - During Slack notifications

## Troubleshooting

### Transcripts not being processed:
- Check `ENABLE_AUTO_PROCESSING=true` in `.env`
- Verify NOTION_TOKEN and NOTION_DATABASE_ID are correct
- Ensure OPENAI_API_KEY is valid
- Check server logs for error messages

### Slack notifications not sending:
- Verify SLACK_WEBHOOK_URL is complete and valid
- Test webhook with the Slack Setup button in UI
- Check for `no_service` errors (webhook deleted/invalid)

### Duplicate processing:
- The system tracks processed transcripts in memory
- Restarting server will reset tracking (but checks last 10-20 transcripts)
- Each transcript ID is marked as processed after successful completion

## Performance

- **Polling Frequency**: Every 2 minutes
- **Processing Time**: ~10-30 seconds per transcript
- **Slack Delay**: 300ms between story notifications (prevents rate limiting)
- **Startup Scan**: 5 seconds after server start

## Security Notes

- Keep your webhook endpoint private
- Consider adding authentication if exposing to internet
- Use HTTPS in production
- Never commit `.env` file to version control