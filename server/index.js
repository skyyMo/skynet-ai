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
      continue;
    }
    
    const paragraph = {
      type: "paragraph",
      content: [
        {
          type: "text",
          text: trimmedLine
        }
      ]
    };
    
    if (trimmedLine.startsWith('🎯 ') || trimmedLine.startsWith('✅ ') || 
        trimmedLine.startsWith('⚙️ ') || trimmedLine.startsWith('⚠️ ') || 
        trimmedLine.startsWith('🤖 ')) {
      paragraph.content[0].marks = [{ type: "strong" }];
    }
    
    content.push(paragraph);
  }
  
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

// ============================================
// API ROUTES - MUST BE DEFINED BEFORE STATIC FILES
// ============================================

// Test route
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'SkyNet AI is online and operational! 🤖',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development',
    autoDetection: {
      enabled: !!process.env.OPENAI_API_KEY,
      processedCount: processedTranscriptIds.size,
      slackConfigured: !!process.env.SLACK_WEBHOOK_URL
    }
  });
});

// Get transcripts from Notion
app.get('/api/transcripts', async (req, res) => {
  try {
    console.log('SkyNet fetching transcripts...');
    
    if (!process.env.NOTION_TOKEN) {
      return res.status(400).json({ 
        error: 'NOTION_TOKEN not found in environment variables' 
      });
    }

    if (!process.env.NOTION_DATABASE_ID) {
      return res.status(400).json({ 
        error: 'NOTION_DATABASE_ID not found in environment variables' 
      });
    }

    const response = await notion.databases.query({
      database_id: process.env.NOTION_DATABASE_ID,
      sorts: [
        {
          property: 'Created time',
          direction: 'descending'
        }
      ],
      page_size: 20
    });
    
    console.log(`Found ${response.results.length} pages`);
    
    const transcriptPromises = response.results.map(async (page) => {
      const properties = page.properties;
      
      try {
        console.log(`Fetching content for: ${properties.Name?.title?.[0]?.plain_text}`);
        
        const pageContent = await notion.blocks.children.list({
          block_id: page.id,
        });
        
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
        
        return {
          id: page.id,
          title: properties.Name?.title?.[0]?.plain_text || 'Untitled Meeting',
          content: content.trim(),
          date: properties['Created time']?.created_time?.split('T')[0] || '',
          createdTime: properties['Created time']?.created_time || '',
          wordCount: content.trim().split(' ').length,
          processed: processedTranscriptIds.has(page.id),
          autoProcessed: processedTranscriptIds.has(page.id)
        };
      } catch (contentError) {
        console.error(`Error fetching content for ${properties.Name?.title?.[0]?.plain_text}:`, contentError);
        return {
          id: page.id,
          title: properties.Name?.title?.[0]?.plain_text || 'Untitled Meeting',
          content: '',
          date: properties['Created time']?.created_time?.split('T')[0] || '',
          createdTime: properties['Created time']?.created_time || '',
          wordCount: 0,
          processed: false,
          autoProcessed: false,
          error: 'Failed to fetch content'
        };
      }
    });
    
    const transcripts = await Promise.all(transcriptPromises);
    const validTranscripts = transcripts.filter(t => t.wordCount > 50);
    
    console.log(`Returning ${validTranscripts.length} transcripts with content`);
    
    res.json(validTranscripts);
  } catch (error) {
    console.error('Notion API Error:', error);
    res.status(500).json({ 
      error: 'Failed to fetch transcripts',
      details: error.message 
    });
  }
});

// Process transcript with AI - Updated with Slack status tracking
app.post('/api/process-transcript', async (req, res) => {
  try {
    const { transcript, title, slackWebhook } = req.body;
    
    if (!process.env.OPENAI_API_KEY) {
      return res.status(400).json({ 
        error: 'OpenAI API key not configured. Add OPENAI_API_KEY to your environment variables' 
      });
    }

    if (!transcript || transcript.length < 100) {
      return res.status(400).json({ 
        error: 'Transcript too short or missing' 
      });
    }

    console.log(`SkyNet processing transcript: ${title}`);
    console.log(`Transcript length: ${transcript.length} characters`);

    const result = await autoProcessTranscript(transcript, title);
    
    if (!result) {
      return res.status(500).json({ 
        error: 'Failed to process transcript'
      });
    }

    const slackResults = [];
    if (slackWebhook && result.stories) {
      console.log(`📤 Sending ${result.stories.length} Slack notifications...`);
      
      for (const story of result.stories) {
        const slackStatus = await sendSlackNotification(story, slackWebhook);
        
        story.slackStatus = slackStatus;
        slackResults.push({
          storyId: story.id,
          storyTitle: story.title,
          slackStatus: slackStatus
        });
        
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      
      console.log(`✅ Slack notifications completed for: ${title}`);
    }

    const response = {
      ...result,
      slackSummary: {
        enabled: !!slackWebhook,
        totalStories: result.stories?.length || 0,
        successfulNotifications: slackResults.filter(r => r.slackStatus.success).length,
        failedNotifications: slackResults.filter(r => r.slackStatus.success === false).length,
        results: slackResults
      }
    };
    
    res.json(response);
  } catch (error) {
    console.error('OpenAI API Error:', error);
    res.status(500).json({ 
      error: 'SkyNet AI processing failed: ' + error.message,
      details: error.response?.data || error.message 
    });
  }
});

// Deploy story to JIRA
app.post('/api/deploy-to-jira', async (req, res) => {
  try {
    const { story, jiraConfig } = req.body;
    
    console.log(`🤖 SkyNet attempting JIRA deployment for: ${story.title}`);

    let cleanUrl = jiraConfig.url.trim();
    if (!cleanUrl.startsWith('http')) {
      cleanUrl = 'https://' + cleanUrl;
    }
    cleanUrl = cleanUrl.replace(/\/$/, '');

    const auth = Buffer.from(`${jiraConfig.email}:${jiraConfig.token}`).toString('base64');
    
    const authTest = await fetch(`${cleanUrl}/rest/api/3/myself`, {
      method: 'GET',
      headers: {
        'Authorization': `Basic ${auth}`,
        'Accept': 'application/json',
        'User-Agent': 'SkyNet-AI/1.0'
      }
    });

    if (!authTest.ok) {
      throw new Error('JIRA Authentication failed');
    }

    const descriptionText = [
      story.description,
      '',
      '🎯 Business Value:',
      story.businessValue,
      '',
      '✅ Acceptance Criteria:',
      ...story.acceptanceCriteria.map(criteria => `• ${criteria}`),
      '',
      '⚙️ Technical Requirements:',
      ...story.technicalRequirements.map(req => `• ${req}`),
      '',
      '⚠️ Risks:',
      ...story.risks.map(risk => `• ${risk}`),
      '',
      `🤖 Generated by SkyNet AI from: ${story.sourceTranscript}`,
      `Confidence: ${Math.round(story.confidence * 100)}% | Date: ${story.sourceTimestamp}`
    ].join('\n');

    let adfDescription;
    try {
      adfDescription = textToADF(descriptionText);
    } catch (e) {
      adfDescription = simpleTextToADF(descriptionText);
    }

    const jiraTicket = {
      fields: {
        project: {
          key: jiraConfig.projectKey
        },
        summary: story.title,
        description: adfDescription,
        issuetype: {
          name: 'Story'
        }
      }
    };

    if (story.priority && ['Highest', 'High', 'Medium', 'Low', 'Lowest'].includes(story.priority)) {
      jiraTicket.fields.priority = { name: story.priority };
    }

    const createResponse = await fetch(`${cleanUrl}/rest/api/3/issue`, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${auth}`,
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'User-Agent': 'SkyNet-AI/1.0'
      },
      body: JSON.stringify(jiraTicket)
    });

    const createResponseText = await createResponse.text();

    if (!createResponse.ok) {
      throw new Error(`Ticket creation failed: ${createResponseText}`);
    }

    const result = JSON.parse(createResponseText);

    res.json({
      success: true,
      key: result.key,
      url: `${cleanUrl}/browse/${result.key}`,
      id: result.id
    });

  } catch (error) {
    console.error('🚨 JIRA deployment failed:', error.message);
    res.status(500).json({ 
      error: error.message
    });
  }
});

// Auto-process all transcripts
app.post('/api/auto-process-all', async (req, res) => {
  try {
    const { slackWebhook } = req.body;
    
    console.log('🤖 SkyNet starting auto-processing of all transcripts...');
    
    if (!process.env.OPENAI_API_KEY) {
      return res.status(400).json({ 
        error: 'OpenAI API key not configured' 
      });
    }

    const response = await notion.databases.query({
      database_id: process.env.NOTION_DATABASE_ID,
      sorts: [
        {
          property: 'Created time',
          direction: 'descending'
        }
      ],
      page_size: 50
    });
    
    let processedCount = 0;
    let totalStories = 0;
    let totalSlackSuccess = 0;
    let totalSlackFailed = 0;
    const results = [];
    
    for (const page of response.results) {
      const properties = page.properties;
      const title = properties.Name?.title?.[0]?.plain_text || 'Untitled Meeting';
      
      try {
        const pageContent = await notion.blocks.children.list({
          block_id: page.id,
        });
        
        let content = '';
        pageContent.results.forEach(block => {
          if (block.type === 'paragraph' && block.paragraph?.rich_text) {
            const text = block.paragraph.rich_text
              .map(t => t.plain_text)
              .join('');
            content += text + '\n';
          }
        });
        
        const wordCount = content.trim().split(' ').length;
        
        if (wordCount > 50) {
          const processResult = await autoProcessTranscript(content.trim(), title);
          
          if (processResult && processResult.stories && processResult.stories.length > 0) {
            processedCount++;
            totalStories += processResult.stories.length;
            
            const slackResults = [];
            
            if (slackWebhook) {
              for (const story of processResult.stories) {
                const slackStatus = await sendSlackNotification(story, slackWebhook);
                if (slackStatus.success) {
                  totalSlackSuccess++;
                } else {
                  totalSlackFailed++;
                }
                await new Promise(resolve => setTimeout(resolve, 200));
              }
            }
            
            results.push({
              transcript: title,
              storyCount: processResult.stories.length,
              stories: processResult.stories
            });
          }
          
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
        
      } catch (error) {
        console.error(`❌ Error processing ${title}:`, error.message);
      }
    }
    
    res.json({
      success: true,
      transcriptsAnalyzed: response.results.length,
      transcriptsProcessed: processedCount,
      totalStories: totalStories,
      slackSummary: {
        enabled: !!slackWebhook,
        successfulNotifications: totalSlackSuccess,
        failedNotifications: totalSlackFailed,
        totalNotifications: totalSlackSuccess + totalSlackFailed
      },
      results: results
    });
    
  } catch (error) {
    console.error('❌ Auto-processing error:', error);
    res.status(500).json({ 
      error: 'Auto-processing failed: ' + error.message
    });
  }
});

// ============================================
// STATIC FILES AND CATCH-ALL - MUST BE LAST
// ============================================

// Serve static files from React build in production
if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.join(__dirname, '..', 'build')));
  
  // Catch all handler for React Router - MUST BE THE VERY LAST ROUTE
  app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'build', 'index.html'));
  });
}

// Start server
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
  
  console.log('🎯 SkyNet is now fully operational!');
});