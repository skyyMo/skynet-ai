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

// Process transcript with AI
app.post('/api/process-transcript', async (req, res) => {
  try {
    const { transcript, title } = req.body;
    
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

    // Initialize OpenAI
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
    console.log('Raw OpenAI response:');
    console.log(rawResponse);
    
    let result;
    try {
      // Clean the response - remove markdown code blocks
      let cleanResponse = rawResponse.trim();
      
      // Remove ```json and ``` if present
      if (cleanResponse.startsWith('```json')) {
        cleanResponse = cleanResponse.replace(/^```json\s*/, '').replace(/\s*```$/, '');
      } else if (cleanResponse.startsWith('```')) {
        cleanResponse = cleanResponse.replace(/^```\s*/, '').replace(/\s*```$/, '');
      }
      
      console.log('Cleaned response:');
      console.log(cleanResponse);
      
      result = JSON.parse(cleanResponse);
      
      // Add metadata to each story
      if (result.stories && Array.isArray(result.stories)) {
        result.stories = result.stories.map((story, index) => ({
          ...story,
          id: `story-${Date.now()}-${index}`,
          sourceTranscript: title,
          sourceTimestamp: new Date().toISOString().split('T')[0]
        }));
        
        console.log(`SkyNet generated ${result.stories.length} stories from transcript`);
      } else {
        throw new Error('Invalid response format - expected stories array');
      }
      
    } catch (parseError) {
      console.error('Failed to parse OpenAI response:', parseError);
      console.error('Raw response was:', rawResponse);
      return res.status(500).json({ 
        error: 'SkyNet AI returned invalid format. Check server logs for details.',
        details: rawResponse.substring(0, 200) + '...'
      });
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

// Replace your existing /api/deploy-to-jira endpoint with this fixed version:

// Helper function to convert plain text to Atlassian Document Format
function textToADF(text) {
  const lines = text.split('\n');
  const content = [];
  
  for (const line of lines) {
    if (line.trim() === '') {
      // Empty line
      content.push({
        type: "paragraph",
        content: []
      });
    } else if (line.startsWith('🎯 ') || line.startsWith('✅ ') || line.startsWith('⚙️ ') || line.startsWith('⚠️ ') || line.startsWith('🤖 ')) {
      // Header lines - make them bold
      content.push({
        type: "paragraph",
        content: [{
          type: "text",
          text: line,
          marks: [{ type: "strong" }]
        }]
      });
    } else if (line.startsWith('• ')) {
      // Bullet points - create list items
      content.push({
        type: "paragraph",
        content: [{
          type: "text",
          text: line
        }]
      });
    } else {
      // Regular text
      content.push({
        type: "paragraph",
        content: [{
          type: "text",
          text: line
        }]
      });
    }
  }
  
  return {
    type: "doc",
    version: 1,
    content: content
  };
}

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

    // Convert to ADF format
    const adfDescription = textToADF(descriptionText);

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