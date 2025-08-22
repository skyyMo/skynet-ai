const express = require('express');
const cors = require('cors');
const path = require('path');
const { Client } = require('@notionhq/client');
const cron = require('node-cron');
require('dotenv').config();

const app = express();
const port = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json());

// Serve static files from React build in production
if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.join(__dirname, '../client/build')));
}

// Initialize Notion
const notion = new Client({ 
  auth: process.env.NOTION_TOKEN 
});

// Track processed transcripts to avoid duplicates
let processedTranscriptIds = new Set();

// Helper function to send Slack notifications with detailed status tracking
async function sendSlackNotification(story, webhookUrl) {
  try {
    const blocks = [
      {
        "type": "header",
        "text": {
          "type": "plain_text",
          "text": `🤖 SkyNet Story Generated: ${story.title}`
        }
      },
      {
        "type": "section",
        "fields": [
          {
            "type": "mrkdwn",
            "text": `*Type:* ${story.type}`
          },
          {
            "type": "mrkdwn",
            "text": `*Priority:* ${story.priority}`
          },
          {
            "type": "mrkdwn",
            "text": `*Effort:* ${story.effort}`
          },
          {
            "type": "mrkdwn",
            "text": `*Epic:* ${story.epic}`
          }
        ]
      },
      {
        "type": "section",
        "text": {
          "type": "mrkdwn",
          "text": `*Description:*\n${story.description}`
        }
      },
      {
        "type": "section",
        "text": {
          "type": "mrkdwn",
          "text": `*Business Value:*\n${story.businessValue}`
        }
      },
      {
        "type": "section",
        "text": {
          "type": "mrkdwn",
          "text": `*Acceptance Criteria:*\n${story.acceptanceCriteria.map(c => `• ${c}`).join('\n')}`
        }
      },
      {
        "type": "context",
        "elements": [
          {
            "type": "mrkdwn",
            "text": `📊 Confidence: ${Math.round(story.confidence * 100)}% | 📅 From: ${story.sourceTranscript} | ⏰ ${story.sourceTimestamp}`
          }
        ]
      },
      {
        "type": "divider"
      }
    ];

    const payload = {
      blocks: blocks,
      username: "SkyNet AI",
      icon_emoji: ":robot_face:"
    };

    const startTime = Date.now();
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload)
    });
    const endTime = Date.now();

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`❌ Slack notification failed for "${story.title}":`, response.status, errorText);
      return {
        success: false,
        error: `HTTP ${response.status}: ${errorText}`,
        timestamp: new Date().toISOString(),
        responseTime: endTime - startTime
      };
    }

    console.log(`📤 Slack notification sent for story: ${story.title} (${endTime - startTime}ms)`);
    return {
      success: true,
      timestamp: new Date().toISOString(),
      responseTime: endTime - startTime
    };
  } catch (error) {
    console.error(`❌ Slack notification failed for "${story.title}":`, error.message);
    return {
      success: false,
      error: error.message,
      timestamp: new Date().toISOString(),
      responseTime: null
    };
  }
}

// Helper function to automatically process a transcript
async function autoProcessTranscript(transcript, title) {
  try {
    console.log(`🤖 SkyNet auto-processing transcript: ${title}`);

    if (!process.env.OPENAI_API_KEY) {
      console.error('❌ OpenAI API key not configured for auto-processing');
      return null;
    }

    if (!transcript || transcript.length < 100) {
      console.log(`⚠️ Skipping auto-processing: transcript too short (${transcript.length} chars)`);
      return null;
    }

    const OpenAI = require('openai');
    const openai = new OpenAI({ 
      apiKey: process.env.OPENAI_API_KEY 
    });

    const systemPrompt = `You are SkyNet AI, an autonomous system for extracting development stories from meeting transcripts.

IMPORTANT: Return ONLY valid JSON - no markdown, no code blocks, no additional text.

Return an array of stories in this exact JSON structure:
{
  "stories": [
    {
      "title": "Clear, actionable story title",
      "type": "Feature",
      "priority": "High", 
      "effort": "3 story points",
      "epic": "Epic category this belongs to",
      "description": "Detailed description of what needs to be built",
      "acceptanceCriteria": ["criterion 1", "criterion 2", "criterion 3"],
      "technicalRequirements": ["requirement 1", "requirement 2"],
      "businessValue": "Why this matters to the business",
      "risks": ["risk 1", "risk 2"],
      "confidence": 0.85,
      "discussionContext": "Brief context from the meeting where this was discussed"
    }
  ]
}

Extract EVERY distinct development item discussed. This includes:
- New features or enhancements
- Bug fixes mentioned
- Technical debt items
- UI/UX improvements
- Infrastructure changes
- Performance optimizations
- API changes
- Database modifications

Each story should be actionable and specific. If multiple related items are discussed, create separate stories for each distinct deliverable.`;

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: systemPrompt
        },
        {
          role: "user",
          content: `Meeting: ${title}\n\nTranscript: ${transcript}`
        }
      ],
      temperature: 0.2,
      max_tokens: 3000
    });
    
    const rawResponse = completion.choices[0].message.content;
    
    let result;
    try {
      // Clean the response - remove markdown code blocks
      let cleanResponse = rawResponse.trim();
      
      if (cleanResponse.startsWith('```json')) {
        cleanResponse = cleanResponse.replace(/^```json\s*/, '').replace(/\s*```$/, '');
      } else if (cleanResponse.startsWith('```')) {
        cleanResponse = cleanResponse.replace(/^```\s*/, '').replace(/\s*```$/, '');
      }
      
      result = JSON.parse(cleanResponse);
      
      // Add metadata to each story
      if (result.stories && Array.isArray(result.stories)) {
        result.stories = result.stories.map((story, index) => ({
          ...story,
          id: `story-${Date.now()}-${index}`,
          sourceTranscript: title,
          sourceTimestamp: new Date().toISOString().split('T')[0],
          autoProcessed: true
        }));
        
        console.log(`🎯 SkyNet auto-generated ${result.stories.length} stories from: ${title}`);
        return result;
      } else {
        console.log(`⚠️ No stories found in transcript: ${title}`);
        return null;
      }
      
    } catch (parseError) {
      console.error('❌ Auto-processing failed - invalid AI response:', parseError.message);
      return null;
    }
    
  } catch (error) {
    console.error('❌ Auto-processing error:', error.message);
    return null;
  }
}

// Function to check for new transcripts and process them automatically
async function checkForNewTranscripts() {
  try {
    console.log('🔍 SkyNet checking for new transcripts...');
    
    if (!process.env.NOTION_TOKEN || !process.env.NOTION_DATABASE_ID) {
      console.log('⚠️ Notion credentials not configured');
      return;
    }

    // Get recent transcripts (last 6 hours to catch new ones)
    const sixHoursAgo = new Date();
    sixHoursAgo.setHours(sixHoursAgo.getHours() - 6);
    
    const response = await notion.databases.query({
      database_id: process.env.NOTION_DATABASE_ID,
      filter: {
        property: 'Created time',
        created_time: {
          after: sixHoursAgo.toISOString()
        }
      },
      sorts: [
        {
          property: 'Created time',
          direction: 'descending'
        }
      ],
      page_size: 20
    });
    
    console.log(`📋 Found ${response.results.length} recent transcripts`);
    
    let newTranscripts = 0;
    let totalNewStories = 0;
    
    for (const page of response.results) {
      // Skip if we've already processed this transcript
      if (processedTranscriptIds.has(page.id)) {
        continue;
      }
      
      const properties = page.properties;
      const title = properties.Name?.title?.[0]?.plain_text || 'Untitled Meeting';
      
      try {
        // Fetch page content
        const pageContent = await notion.blocks.children.list({
          block_id: page.id,
        });
        
        // Extract text content
        let content = '';
        pageContent.results.forEach(block => {
          if (block.type === 'paragraph' && block.paragraph?.rich_text) {
            const text = block.paragraph.rich_text
              .map(t => t.plain_text)
              .join('');
            content += text + '\n';
          }
          if (block.type === 'heading_1' && block.heading_1?.rich_text) {
            content += block.heading_1.rich_text
              .map(t => t.plain_text)
              .join('') + '\n';
          }
          if (block.type === 'heading_2' && block.heading_2?.rich_text) {
            content += block.heading_2.rich_text
              .map(t => t.plain_text)
              .join('') + '\n';
          }
          if (block.type === 'heading_3' && block.heading_3?.rich_text) {
            content += block.heading_3.rich_text
              .map(t => t.plain_text)
              .join('') + '\n';
          }
        });
        
        const wordCount = content.trim().split(' ').length;
        
        // Only process transcripts with substantial content
        if (wordCount > 50) {
          console.log(`🆕 New transcript detected: ${title} (${wordCount} words)`);
          
          const processResult = await autoProcessTranscript(content.trim(), title);
          
          if (processResult && processResult.stories && processResult.stories.length > 0) {
            newTranscripts++;
            totalNewStories += processResult.stories.length;
            
            // Send Slack notifications if webhook is configured
            if (process.env.SLACK_WEBHOOK_URL) {
              // Send individual story notifications
              for (const story of processResult.stories) {
                await sendSlackNotification(story, process.env.SLACK_WEBHOOK_URL);
                await new Promise(resolve => setTimeout(resolve, 200));
              }
              
              // Send new transcript notification
              const newTranscriptPayload = {
                blocks: [
                  {
                    "type": "header",
                    "text": {
                      "type": "plain_text",
                      "text": `🆕 New Meeting Processed: ${title}`
                    }
                  },
                  {
                    "type": "section",
                    "text": {
                      "type": "mrkdwn",
                      "text": `📊 Generated *${processResult.stories.length}* development stories from this meeting\n⏰ Processed at: ${new Date().toLocaleString()}`
                    }
                  }
                ],
                username: "SkyNet AI",
                icon_emoji: ":robot_face:"
              };
              
              await fetch(process.env.SLACK_WEBHOOK_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(newTranscriptPayload)
              });
            }
            
            // Mark as processed
            processedTranscriptIds.add(page.id);
            
            console.log(`✅ Processed new transcript: ${title} (${processResult.stories.length} stories)`);
          } else {
            console.log(`⚠️ No stories found in: ${title}`);
            // Still mark as processed to avoid re-checking
            processedTranscriptIds.add(page.id);
          }
          
          // Rate limiting
          await new Promise(resolve => setTimeout(resolve, 2000));
        } else {
          console.log(`⏭️ Skipping: ${title} (too short: ${wordCount} words)`);
          processedTranscriptIds.add(page.id);
        }
        
      } catch (error) {
        console.error(`❌ Error processing new transcript ${title}:`, error.message);
        // Don't mark as processed if there was an error, so we can retry
      }
    }
    
    if (newTranscripts > 0) {
      console.log(`🎉 Auto-processing complete! Found ${newTranscripts} new transcripts, generated ${totalNewStories} stories`);
    } else {
      console.log('✅ No new transcripts to process');
    }
    
  } catch (error) {
    console.error('❌ Error checking for new transcripts:', error);
  }
}

// Function to initialize processed transcript tracking
async function initializeProcessedTranscripts() {
  try {
    console.log('🔄 Initializing processed transcripts tracking...');
    
    // Get all existing transcripts to mark as "already processed"
    const response = await notion.databases.query({
      database_id: process.env.NOTION_DATABASE_ID,
      sorts: [
        {
          property: 'Created time',
          direction: 'descending'
        }
      ],
      page_size: 100
    });
    
    // Mark all existing transcripts as processed
    response.results.forEach(page => {
      processedTranscriptIds.add(page.id);
    });
    
    console.log(`📝 Marked ${response.results.length} existing transcripts as processed`);
    
  } catch (error) {
    console.error('❌ Error initializing processed transcripts:', error);
  }
}

// Start automatic detection when server starts
async function startAutoDetection() {
  if (!process.env.OPENAI_API_KEY) {
    console.log('⚠️ OpenAI API key not configured - auto-detection disabled');
    return;
  }
  
  // Initialize tracking
  await initializeProcessedTranscripts();
  
  // Schedule checks every 5 minutes
  cron.schedule('*/5 * * * *', () => {
    console.log('⏰ Cron job triggered - checking for new transcripts...');
    checkForNewTranscripts();
  });
  
  console.log('🤖 SkyNet auto-detection started - checking every 5 minutes');
  console.log('📅 Cron schedule: */5 * * * * (every 5 minutes)');
  
  // Also check immediately on startup (after a delay)
  setTimeout(() => {
    console.log('🚀 Running initial transcript check...');
    checkForNewTranscripts();
  }, 30000); // Wait 30 seconds after server start
}

// Helper function to convert plain text to Atlassian Document Format
function textToADF(text) {
  if (!text || text.trim() === '') {
    return {
      type: "doc",
      version: 1,
      content: [
        {
          type: "paragraph",
          content: []
        }
      ]
    };
  }

  const lines = text.split('\n');
  const content = [];
  
  for (const line of lines) {
    const trimmedLine = line.trim();
    
    if (trimmedLine === '') {
      // Skip empty lines to avoid empty paragraphs
      continue;
    }
    
    // Create paragraph with text content
    const paragraph = {
      type: "paragraph",
      content: [
        {
          type: "text",
          text: trimmedLine
        }
      ]
    };
    
    // Add bold formatting for header lines
    if (trimmedLine.startsWith('🎯 ') || trimmedLine.startsWith('✅ ') || 
        trimmedLine.startsWith('⚙️ ') || trimmedLine.startsWith('⚠️ ') || 
        trimmedLine.startsWith('🤖 ')) {
      paragraph.content[0].marks = [{ type: "strong" }];
    }
    
    content.push(paragraph);
  }
  
  // Ensure we always have at least one paragraph
  if (content.length === 0) {
    content.push({
      type: "paragraph",
      content: []
    });
  }
  
  return {
    type: "doc",
    version: 1,
    content: content
  };
}

// Simpler ADF function as fallback
function simpleTextToADF(text) {
  return {
    type: "doc",
    version: 1,
    content: [
      {
        type: "paragraph",
        content: [
          {
            type: "text",
            text: text || "No description provided"
          }
        ]
      }
    ]
  };
}

module.exports = app;

// Start auto-detection if this file is run directly
if (require.main === module) {
  const port = process.env.PORT || 3001;
  
  app.listen(port, async () => {
    console.log(`🤖 SkyNet AI server operational on port ${port}`);
    console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log(`Health check: http://localhost:${port}/api/health`);
    console.log('Environment variables loaded:', {
      hasNotionToken: !!process.env.NOTION_TOKEN,
      hasNotionDB: !!process.env.NOTION_DATABASE_ID,
      hasOpenAI: !!process.env.OPENAI_API_KEY,
      hasSlackWebhook: !!process.env.SLACK_WEBHOOK_URL
    });
    
    // Start auto-detection
    console.log('🚀 Starting SkyNet auto-detection...');
    await startAutoDetection();
    
    console.log('🎯 SkyNet is now fully operational and monitoring for new transcripts!');
  });
}