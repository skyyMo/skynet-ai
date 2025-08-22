const express = require('express');
const cors = require('cors');
const path = require('path');
const { Client } = require('@notionhq/client');
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

// Helper function to send Slack notifications
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

    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      throw new Error(`Slack webhook failed: ${response.status}`);
    }

    console.log(`📤 Slack notification sent for story: ${story.title}`);
    return true;
  } catch (error) {
    console.error('❌ Slack notification failed:', error.message);
    return false;
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

// Test route
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'SkyNet AI is online and operational! 🤖',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development'
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
      page_size: 20 // Limit to recent 20 for performance
    });
    
    console.log(`Found ${response.results.length} pages`);
    
    // Get basic info AND page content
    const transcriptPromises = response.results.map(async (page) => {
      const properties = page.properties;
      
      try {
        // Fetch the actual page content
        console.log(`Fetching content for: ${properties.Name?.title?.[0]?.plain_text}`);
        
        const pageContent = await notion.blocks.children.list({
          block_id: page.id,
        });
        
        // Extract text from all blocks
        let content = '';
        pageContent.results.forEach(block => {
          if (block.type === 'paragraph' && block.paragraph?.rich_text) {
            const text = block.paragraph.rich_text
              .map(t => t.plain_text)
              .join('');
            content += text + '\n';
          }
          // Handle other block types
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
          processed: false
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
          error: 'Failed to fetch content'
        };
      }
    });
    
    const transcripts = await Promise.all(transcriptPromises);
    
    // Filter out transcripts with no content (less than 50 words)
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

// Process transcript with AI - Updated with Slack notifications
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

    // Process the transcript
    const result = await autoProcessTranscript(transcript, title);
    
    if (!result) {
      return res.status(500).json({ 
        error: 'Failed to process transcript'
      });
    }

    // Send Slack notifications for each story if webhook provided
    if (slackWebhook && result.stories) {
      console.log(`📤 Sending ${result.stories.length} Slack notifications...`);
      
      for (const story of result.stories) {
        await sendSlackNotification(story, slackWebhook);
        // Small delay to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      
      console.log(`✅ All Slack notifications sent for: ${title}`);
    }
    
    res.json(result);
  } catch (error) {
    console.error('OpenAI API Error:', error);
    res.status(500).json({ 
      error: 'SkyNet AI processing failed: ' + error.message,
      details: error.response?.data || error.message 
    });
  }
});

// Deploy story to JIRA - Fixed with ADF format
app.post('/api/deploy-to-jira', async (req, res) => {
  try {
    const { story, jiraConfig } = req.body;
    
    console.log(`🤖 SkyNet attempting JIRA deployment for: ${story.title}`);
    console.log(`URL: ${jiraConfig.url}`);
    console.log(`Email: ${jiraConfig.email}`);
    console.log(`Project: ${jiraConfig.projectKey}`);

    // Clean and validate URL
    let cleanUrl = jiraConfig.url.trim();
    if (!cleanUrl.startsWith('http')) {
      cleanUrl = 'https://' + cleanUrl;
    }
    cleanUrl = cleanUrl.replace(/\/$/, ''); // Remove trailing slash

    console.log(`Cleaned URL: ${cleanUrl}`);

    const auth = Buffer.from(`${jiraConfig.email}:${jiraConfig.token}`).toString('base64');
    
    // Step 1: Test basic authentication first
    console.log(`🧪 Testing JIRA authentication...`);
    const authTest = await fetch(`${cleanUrl}/rest/api/3/myself`, {
      method: 'GET',
      headers: {
        'Authorization': `Basic ${auth}`,
        'Accept': 'application/json',
        'User-Agent': 'SkyNet-AI/1.0'
      }
    });

    const authTestText = await authTest.text();
    console.log(`Auth test status: ${authTest.status}`);
    console.log(`Auth test response: ${authTestText.substring(0, 200)}...`);

    if (!authTest.ok) {
      if (authTestText.includes('<!DOCTYPE')) {
        throw new Error(`JIRA URL error: Received HTML instead of JSON. Please check your JIRA URL format. Expected: https://yourcompany.atlassian.net`);
      }
      if (authTest.status === 401) {
        throw new Error('JIRA Authentication failed. Please verify your email and API token are correct.');
      }
      if (authTest.status === 404) {
        throw new Error(`JIRA URL not found (404). Please verify your JIRA URL: ${cleanUrl}`);
      }
      throw new Error(`JIRA connection failed (${authTest.status}): ${authTestText.substring(0, 100)}`);
    }

    let userInfo;
    try {
      userInfo = JSON.parse(authTestText);
      console.log(`✅ Authentication successful for user: ${userInfo.displayName}`);
    } catch (e) {
      throw new Error('JIRA returned invalid response format');
    }

    // Step 2: Test project access
    console.log(`🔍 Testing project access for: ${jiraConfig.projectKey}`);
    const projectTest = await fetch(`${cleanUrl}/rest/api/3/project/${jiraConfig.projectKey}`, {
      method: 'GET',
      headers: {
        'Authorization': `Basic ${auth}`,
        'Accept': 'application/json',
        'User-Agent': 'SkyNet-AI/1.0'
      }
    });

    if (!projectTest.ok) {
      if (projectTest.status === 404) {
        throw new Error(`Project "${jiraConfig.projectKey}" not found. Please verify the project key is correct and you have access.`);
      }
      throw new Error(`Project access failed (${projectTest.status}). Please verify you have access to project "${jiraConfig.projectKey}".`);
    }

    // Step 3: Create the ticket with ADF description format
    console.log(`🎫 Creating JIRA ticket...`);
    
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

    // Convert to ADF format - try simple version first
    let adfDescription;
    try {
      adfDescription = textToADF(descriptionText);
    } catch (e) {
      console.log('Complex ADF failed, using simple version:', e.message);
      adfDescription = simpleTextToADF(descriptionText);
    }

    const jiraTicket = {
      fields: {
        project: {
          key: jiraConfig.projectKey
        },
        summary: story.title,
        description: adfDescription,  // Now in ADF format
        issuetype: {
          name: 'Story'
        }
      }
    };

    // Add priority if available
    if (story.priority && ['Highest', 'High', 'Medium', 'Low', 'Lowest'].includes(story.priority)) {
      jiraTicket.fields.priority = { name: story.priority };
    }

    console.log(`Creating ticket with summary: "${story.title}"`);
    console.log(`Description format: ADF with ${adfDescription.content.length} blocks`);
    console.log(`ADF Structure:`, JSON.stringify(adfDescription, null, 2));

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
    console.log(`Ticket creation status: ${createResponse.status}`);
    console.log(`Ticket creation response: ${createResponseText.substring(0, 300)}...`);

    if (!createResponse.ok) {
      if (createResponseText.includes('<!DOCTYPE')) {
        throw new Error('JIRA returned HTML instead of JSON during ticket creation. This may indicate a URL or authentication issue.');
      }

      let errorMessage = `Ticket creation failed (${createResponse.status})`;
      try {
        const errorData = JSON.parse(createResponseText);
        if (errorData.errorMessages) {
          errorMessage += `: ${errorData.errorMessages.join(', ')}`;
        }
        if (errorData.errors) {
          const fieldErrors = Object.entries(errorData.errors).map(([field, error]) => `${field}: ${error}`);
          errorMessage += `: ${fieldErrors.join(', ')}`;
        }
      } catch (e) {
        errorMessage += `: ${createResponseText.substring(0, 100)}`;
      }
      throw new Error(errorMessage);
    }

    let result;
    try {
      result = JSON.parse(createResponseText);
    } catch (e) {
      throw new Error('JIRA returned invalid JSON for ticket creation');
    }

    console.log(`🚀 SkyNet successfully deployed ticket: ${result.key}`);

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

// Auto-process all unprocessed transcripts endpoint
app.post('/api/auto-process-all', async (req, res) => {
  try {
    const { slackWebhook } = req.body;
    
    console.log('🤖 SkyNet starting auto-processing of all transcripts...');
    
    if (!process.env.OPENAI_API_KEY) {
      return res.status(400).json({ 
        error: 'OpenAI API key not configured' 
      });
    }

    // Get all transcripts
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
    
    console.log(`📋 Found ${response.results.length} transcripts to analyze`);
    
    let processedCount = 0;
    let totalStories = 0;
    const results = [];
    
    for (const page of response.results) {
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
          console.log(`🔄 Processing: ${title} (${wordCount} words)`);
          
          const processResult = await autoProcessTranscript(content.trim(), title);
          
          if (processResult && processResult.stories && processResult.stories.length > 0) {
            processedCount++;
            totalStories += processResult.stories.length;
            
            results.push({
              transcript: title,
              storyCount: processResult.stories.length,
              stories: processResult.stories
            });
            
            // Send Slack notifications
            if (slackWebhook) {
              for (const story of processResult.stories) {
                await sendSlackNotification(story, slackWebhook);
                await new Promise(resolve => setTimeout(resolve, 200)); // Rate limiting
              }
            }
          }
          
          // Rate limiting for OpenAI API
          await new Promise(resolve => setTimeout(resolve, 1000));
        } else {
          console.log(`⏭️ Skipping: ${title} (too short: ${wordCount} words)`);
        }
        
      } catch (error) {
        console.error(`❌ Error processing ${title}:`, error.message);
      }
    }
    
    console.log(`🎉 Auto-processing complete! Processed ${processedCount} transcripts, generated ${totalStories} stories`);
    
    // Send summary to Slack
    if (slackWebhook && totalStories > 0) {
      const summaryPayload = {
        blocks: [
          {
            "type": "header",
            "text": {
              "type": "plain_text",
              "text": "🤖 SkyNet Auto-Processing Complete!"
            }
          },
          {
            "type": "section",
            "text": {
              "type": "mrkdwn",
              "text": `📊 *Summary:*\n• Analyzed ${response.results.length} transcripts\n• Processed ${processedCount} with dev content\n• Generated ${totalStories} development stories\n• Time: ${new Date().toLocaleString()}`
            }
          }
        ],
        username: "SkyNet AI",
        icon_emoji: ":robot_face:"
      };
      
      await fetch(slackWebhook, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(summaryPayload)
      });
    }
    
    res.json({
      success: true,
      transcriptsAnalyzed: response.results.length,
      transcriptsProcessed: processedCount,
      totalStories: totalStories,
      results: results
    });
    
  } catch (error) {
    console.error('❌ Auto-processing error:', error);
    res.status(500).json({ 
      error: 'Auto-processing failed: ' + error.message
    });
  }
});

// Setup automatic processing via cron job or webhook
app.post('/api/setup-auto-processing', async (req, res) => {
  try {
    const { slackWebhook, intervalMinutes = 60 } = req.body;
    
    console.log(`🔄 Setting up auto-processing every ${intervalMinutes} minutes`);
    
    // Store the webhook URL (in production, store this in database or env var)
    process.env.SLACK_WEBHOOK_URL = slackWebhook;
    
    // Set up interval (in production, use a proper job scheduler like node-cron)
    const intervalMs = intervalMinutes * 60 * 1000;
    
    const autoProcessInterval = setInterval(async () => {
      console.log('🤖 SkyNet auto-processing triggered by scheduler...');
      
      try {
        // Call auto-process endpoint internally
        const autoProcessReq = {
          body: { slackWebhook: process.env.SLACK_WEBHOOK_URL }
        };
        
        // You would call the auto-process logic here
        // For now, just log that it would run
        console.log('🔄 Auto-processing would run now...');
        
      } catch (error) {
        console.error('❌ Scheduled auto-processing failed:', error);
      }
    }, intervalMs);
    
    // Store interval ID for potential cleanup (in production, use proper job management)
    global.skynetAutoProcessInterval = autoProcessInterval;
    
    res.json({
      success: true,
      message: `Auto-processing scheduled every ${intervalMinutes} minutes`,
      nextRun: new Date(Date.now() + intervalMs).toISOString()
    });
    
  } catch (error) {
    console.error('❌ Auto-processing setup failed:', error);
    res.status(500).json({ 
      error: 'Setup failed: ' + error.message
    });
  }
});

// Catch all handler for React Router in production
if (process.env.NODE_ENV === 'production') {
  app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '../client/build', 'index.html'));
  });
}

// Start server
app.listen(port, () => {
  console.log(`🤖 SkyNet AI server operational on port ${port}`);
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`Health check: http://localhost:${port}/api/health`);
  console.log('Environment variables loaded:', {
    hasNotionToken: !!process.env.NOTION_TOKEN,
    hasNotionDB: !!process.env.NOTION_DATABASE_ID,
    hasOpenAI: !!process.env.OPENAI_API_KEY
  });
});