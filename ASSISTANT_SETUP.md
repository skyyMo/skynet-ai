# OpenAI Assistant Setup for SkyNet AI

SkyNet now uses OpenAI's Assistants API, which allows the AI to maintain persistent knowledge about your products, users, and business context across all story generations.

## Quick Setup (Automatic)

1. **Add to your `.env` file:**
   ```env
   OPENAI_API_KEY=your_openai_api_key_here
   ```

2. **Start your server:**
   ```bash
   npm start
   ```

3. **SkyNet will automatically create an assistant** and show you the ID:
   ```
   🔧 Creating new SkyNet Story Assistant...
   ✅ Created new assistant: asst_abc123xyz
   💡 Add OPENAI_ASSISTANT_ID=asst_abc123xyz to your .env file to reuse this assistant
   ```

4. **Add the assistant ID to your `.env`:**
   ```env
   OPENAI_ASSISTANT_ID=asst_abc123xyz
   ```

## Training Your Assistant with Context

Once your assistant is created, you need to train it with your product knowledge. You have two options:

### Option 1: Use OpenAI Playground (Recommended)

1. **Go to OpenAI Playground**: https://platform.openai.com/playground
2. **Switch to Assistant mode** (top right)
3. **Select your assistant** by ID (`asst_abc123xyz`)
4. **Have a conversation** to teach it about your products:

```
You: I need to teach you about our products so you can generate better development stories.

Our company builds [YOUR COMPANY DESCRIPTION]:

**Products:**
- Product A: [Description, users, tech stack]
- Product B: [Description, users, tech stack]

**User Types:**
- Customers: [Who they are, what they need]
- Admins: [Their role, capabilities needed]
- Developers: [Internal team, tools they use]

**Technical Architecture:**
- Frontend: [React/Vue/Angular, state management]
- Backend: [Node.js/Python, database, APIs]
- Infrastructure: [AWS/GCP, deployment process]

**Business Context:**
- Current priorities: [Q1 2025 goals]
- Common pain points: [Known issues]
- Feature requests: [Top customer asks]

[Continue with specific details about your products...]
```

5. **The assistant will remember** all this context for future story generation

### Option 2: Use Custom Instructions

1. **Add to your `.env` file:**
   ```env
   ASSISTANT_INSTRUCTIONS="You are SkyNet AI for [COMPANY NAME]. Our products include:

   [PRODUCT 1]: [Description] - used by [USER TYPES] for [PURPOSE]
   [PRODUCT 2]: [Description] - used by [USER TYPES] for [PURPOSE]

   Key user personas:
   - Customers: [Description of needs and goals]
   - Admins: [Description of role and requirements] 
   - Developers: [Description of internal team needs]

   Technical stack: [Your tech stack]
   Current priorities: [Your current focus areas]
   
   [Include your full prompt instructions here as well]"
   ```

2. **Restart your server** - the assistant will be created with your custom instructions

## Environment Variables

Add these to your `.env` file:

```env
# Required
OPENAI_API_KEY=your_openai_api_key

# Optional - for reusing existing assistant
OPENAI_ASSISTANT_ID=asst_your_assistant_id_here

# Optional - custom instructions (if not training via chat)
ASSISTANT_INSTRUCTIONS="Your custom instructions here..."

# Auto-processing
ENABLE_AUTO_PROCESSING=true
```

## How It Works

1. **First Run**: SkyNet creates a new assistant with default story extraction instructions
2. **Context Training**: You teach the assistant about your products via chat or instructions
3. **Story Generation**: Every transcript uses the same assistant, which remembers your context
4. **Persistent Knowledge**: The assistant learns and remembers across all meetings

## Benefits of Assistant API

✅ **Persistent Memory**: Remembers your products, users, and context  
✅ **Better Stories**: More relevant and accurate story generation  
✅ **Consistent Output**: Same quality across all transcript processing  
✅ **Custom Training**: Tailored to your specific business needs  
✅ **Continuous Learning**: Gets better as you provide more context  

## Training Your Assistant - Best Practices

### Essential Information to Provide:

1. **Product Overview**
   ```
   Our main product is [NAME] - a [TYPE] that helps [USERS] do [TASK].
   Key features: [LIST]
   Built with: [TECH STACK]
   ```

2. **User Personas**
   ```
   Our users are:
   - End customers: [Age, role, technical level, goals]
   - System admins: [Responsibilities, technical skills, pain points]
   - Internal team: [Developers, product managers, support staff]
   ```

3. **Technical Context**
   ```
   Frontend: [Framework, libraries, patterns]
   Backend: [Language, framework, database, APIs]
   Infrastructure: [Cloud provider, deployment, monitoring]
   ```

4. **Business Context**
   ```
   Industry: [Your industry and compliance needs]
   Business model: [SaaS, marketplace, etc.]
   Current focus: [Growth, stability, new features]
   Common issues: [Known problems customers face]
   ```

5. **Development Workflow**
   ```
   We use: [Agile/Scrum, JIRA, GitHub, etc.]
   Story format: [Any specific templates or requirements]
   Definition of done: [Your criteria for completed stories]
   ```

### Example Training Conversation:

```
You: We're a B2B SaaS company building project management tools.

Our main product is TaskFlow - a project management platform for remote teams.

Key features:
- Task assignment and tracking
- Time tracking and reporting  
- Team chat and file sharing
- Gantt charts and project timelines
- API integrations with Slack, GitHub, etc.

Built with React frontend, Node.js backend, PostgreSQL database, hosted on AWS.

Our users are:
- Project managers (non-technical, focus on deadlines and team coordination)
- Team leads (semi-technical, need reporting and oversight tools)  
- Developers (highly technical, want integrations and automation)
- Executives (need high-level dashboards and metrics)

Current priorities:
- Mobile app development
- Performance improvements (page load times)
- Better Slack integration
- Advanced reporting features

Common customer requests:
- Gantt chart improvements
- More detailed time tracking
- Better notification system
- Offline mode support

When generating stories, please:
- Use realistic personas (project manager, team lead, developer, executive)
- Focus on productivity and team collaboration benefits
- Consider our React/Node.js tech stack for technical requirements
- Prioritize features that help remote team coordination
```

## Troubleshooting

### Assistant Not Found
```
❌ Error: No assistant found with ID asst_abc123
```
**Solution**: Remove `OPENAI_ASSISTANT_ID` from `.env` and restart - SkyNet will create a new one

### API Rate Limits
```
❌ Rate limit exceeded
```  
**Solution**: The Assistants API has separate rate limits. Consider upgrading your OpenAI plan or adding delays

### Long Response Times
```
⚠️ Assistant taking longer than usual
```
**Solution**: Assistants can take 10-30 seconds to respond. This is normal for complex analysis

## Monitoring Your Assistant

Check the OpenAI dashboard to:
- View assistant conversations
- Monitor token usage
- Update instructions
- See performance metrics

## Advanced Configuration

### Custom Model Selection
```env
# Use GPT-4 instead of GPT-4o-mini (higher cost, better quality)
ASSISTANT_MODEL=gpt-4-turbo
```

### File Upload (Future)
The assistant can also learn from uploaded files:
- Product documentation
- User research reports
- Technical specifications
- Previous story examples

---

## Next Steps

1. ✅ Set up your assistant with the basic configuration
2. 🎯 Train it with your product knowledge  
3. 🧪 Test it with a sample meeting transcript
4. 🔄 Iterate and improve the training based on results
5. 🚀 Deploy for automatic story generation

Your assistant will get smarter with each interaction and generate increasingly relevant stories for your development team!