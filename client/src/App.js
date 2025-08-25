import React, { useState, useEffect } from 'react';

function App() {
  const [transcripts, setTranscripts] = useState([]);
  const [processedStories, setProcessedStories] = useState([]);
  const [loading, setLoading] = useState(false);
  const [processingId, setProcessingId] = useState(null);
  const [activeTab, setActiveTab] = useState('transcripts');
  const [error, setError] = useState('');
  const [sidebarOpen, setSidebarOpen] = useState(true);
  
  // New state for sorting and filtering
  const [sortBy, setSortBy] = useState('date');
  const [filterBy, setFilterBy] = useState('all');
  const [searchTerm, setSearchTerm] = useState('');
  
  // JIRA state
  const [jiraConfig, setJiraConfig] = useState({
    url: '',
    email: '',
    token: '',
    projectKey: ''
  });
  const [showJiraConfig, setShowJiraConfig] = useState(false);
  const [deployingToJira, setDeployingToJira] = useState(null);

  // Slack integration state
  const [slackConfig, setSlackConfig] = useState({
    webhookUrl: ''
  });
  const [showSlackConfig, setShowSlackConfig] = useState(false);
  const [autoProcessing, setAutoProcessing] = useState(false);

  // Load configs from localStorage on startup
  useEffect(() => {
    const savedJiraConfig = localStorage.getItem('skynet-jira-config');
    if (savedJiraConfig) {
      try {
        const config = JSON.parse(savedJiraConfig);
        setJiraConfig(config);
        console.log('✅ JIRA config loaded from storage');
      } catch (e) {
        console.log('❌ Failed to load JIRA config from storage');
      }
    }

    const savedSlackConfig = localStorage.getItem('skynet-slack-config');
    if (savedSlackConfig) {
      try {
        const config = JSON.parse(savedSlackConfig);
        setSlackConfig(config);
        console.log('✅ Slack config loaded from storage');
      } catch (e) {
        console.log('❌ Failed to load Slack config from storage');
      }
    }
  }, []);

  // Save configs
  const saveJiraConfig = (newConfig) => {
    setJiraConfig(newConfig);
    localStorage.setItem('skynet-jira-config', JSON.stringify(newConfig));
    console.log('💾 JIRA config saved to storage');
  };

  const saveSlackConfig = (newConfig) => {
    setSlackConfig(newConfig);
    localStorage.setItem('skynet-slack-config', JSON.stringify(newConfig));
    console.log('💾 Slack config saved to storage');
  };

  // Clear configs
  const clearJiraConfig = () => {
    setJiraConfig({ url: '', email: '', token: '', projectKey: '' });
    localStorage.removeItem('skynet-jira-config');
    console.log('🗑️ JIRA config cleared');
  };

  const clearSlackConfig = () => {
    setSlackConfig({ webhookUrl: '' });
    localStorage.removeItem('skynet-slack-config');
    console.log('🗑️ Slack config cleared');
  };

  const loadTranscripts = async () => {
    setLoading(true);
    setError('');
    try {
      const response = await fetch('/api/transcripts');
      const data = await response.json();
      
      if (response.ok) {
        setTranscripts(data);
        console.log(`Loaded ${data.length} transcripts`);
      } else {
        setError(data.error || 'Failed to load transcripts');
      }
    } catch (err) {
      setError('Cannot connect to server. Make sure it\'s running.');
      console.error('Error loading transcripts:', err);
    }
    setLoading(false);
  };

  const processTranscript = async (transcript) => {
    setProcessingId(transcript.id);
    setError('');
    
    try {
      const response = await fetch('/api/process-transcript', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          transcript: transcript.content,
          title: transcript.title,
          slackWebhook: slackConfig.webhookUrl || undefined
        })
      });
      
      const result = await response.json();
      
      if (response.ok && result.stories) {
        setProcessedStories(prev => [...prev, ...result.stories]);
        setTranscripts(prev => prev.map(t => 
          t.id === transcript.id ? {...t, processed: true} : t
        ));
        setActiveTab('stories');
        
        const highConfidenceStories = result.stories.filter(s => s.confidence >= 0.7);
        
        let successMessage = `🤖 SkyNet Mission Complete! 🚀\n\n` +
              `Generated ${result.stories.length} autonomous dev stories from "${transcript.title}"\n` +
              `${highConfidenceStories.length} high-confidence stories ready for deployment.\n\n`;
        
        if (result.slackSummary?.enabled) {
          successMessage += `📱 Slack Notifications:\n` +
            `✅ ${result.slackSummary.successfulNotifications} sent successfully\n` +
            `❌ ${result.slackSummary.failedNotifications} failed\n\n`;
        }
        
        successMessage += `SkyNet efficiency: ${Math.round((highConfidenceStories.length / result.stories.length) * 100)}%`;
        
        alert(successMessage);
      } else {
        setError(result.error || 'Failed to process transcript');
        alert('❌ Error: ' + (result.error || 'Failed to process transcript'));
      }
    } catch (err) {
      setError('Failed to process transcript: ' + err.message);
      alert('❌ Error: ' + err.message);
    }
    
    setProcessingId(null);
  };

  const processMultiple = async () => {
    const unprocessed = transcripts.filter(t => !t.processed).slice(0, 3);
    setLoading(true);
    
    for (const transcript of unprocessed) {
      await processTranscript(transcript);
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    
    setLoading(false);
  };

  const autoProcessAll = async () => {
    if (!window.confirm('🤖 SkyNet will autonomously process ALL transcripts. Continue?')) {
      return;
    }
    
    setAutoProcessing(true);
    setError('');
    
    try {
      const response = await fetch('/api/auto-process-all', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          slackWebhook: slackConfig.webhookUrl || undefined
        })
      });
      
      const result = await response.json();
      
      if (response.ok) {
        const allNewStories = result.results.flatMap(r => r.stories || []);
        setProcessedStories(prev => [...prev, ...allNewStories]);
        
        setTranscripts(prev => prev.map(t => ({
          ...t,
          processed: true
        })));
        
        setActiveTab('stories');
        
        let successMessage = `🎉 SkyNet Auto-Processing Complete!\n\n` +
          `📊 Analyzed: ${result.transcriptsAnalyzed} transcripts\n` +
          `⚡ Processed: ${result.transcriptsProcessed} with dev content\n` +
          `🚀 Generated: ${result.totalStories} development stories\n`;
        
        if (result.slackSummary?.enabled) {
          successMessage += `\n📱 Slack Notifications:\n` +
            `✅ ${result.slackSummary.successfulNotifications} sent\n` +
            `❌ ${result.slackSummary.failedNotifications} failed\n`;
        }
        
        alert(successMessage);
      } else {
        setError(result.error || 'Auto-processing failed');
        alert('❌ Auto-processing failed: ' + result.error);
      }
    } catch (err) {
      setError('Auto-processing error: ' + err.message);
      alert('❌ Auto-processing error: ' + err.message);
    }
    
    setAutoProcessing(false);
  };

  const deployToJira = async (story) => {
    if (!jiraConfig.url || !jiraConfig.email || !jiraConfig.token || !jiraConfig.projectKey) {
      alert('🔧 Please configure JIRA settings first!');
      setShowJiraConfig(true);
      return;
    }

    setDeployingToJira(story.id);
    
    try {
      const response = await fetch('/api/deploy-to-jira', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          story,
          jiraConfig
        })
      });
      
      const result = await response.json();
      
      if (response.ok) {
        alert(`🚀 SkyNet deployed story to JIRA!\n\nTicket: ${result.key}\nURL: ${result.url}`);
        setProcessedStories(prev => prev.map(s => 
          s.id === story.id ? {...s, deployedToJira: result.key} : s
        ));
      } else {
        alert('❌ JIRA deployment failed: ' + result.error);
      }
    } catch (err) {
      alert('❌ JIRA deployment error: ' + err.message);
    }
    
    setDeployingToJira(null);
  };

  // Sorting and filtering logic
  const getSortedAndFilteredStories = () => {
    let stories = [...processedStories];

    if (searchTerm) {
      stories = stories.filter(story => 
        story.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
        story.description.toLowerCase().includes(searchTerm.toLowerCase()) ||
        story.sourceTranscript.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }

    switch (filterBy) {
      case 'recommended':
        stories = stories.filter(s => s.confidence >= 0.8 && s.priority === 'High');
        break;
      case 'high-confidence':
        stories = stories.filter(s => s.confidence >= 0.8);
        break;
      case 'recent':
        const twoDaysAgo = new Date();
        twoDaysAgo.setDate(twoDaysAgo.getDate() - 2);
        stories = stories.filter(s => new Date(s.sourceTimestamp) >= twoDaysAgo);
        break;
      case 'needs-review':
        stories = stories.filter(s => s.confidence < 0.7);
        break;
      default:
        break;
    }

    switch (sortBy) {
      case 'confidence':
        stories.sort((a, b) => b.confidence - a.confidence);
        break;
      case 'priority':
        const priorityOrder = { 'High': 3, 'Medium': 2, 'Low': 1 };
        stories.sort((a, b) => (priorityOrder[b.priority] || 0) - (priorityOrder[a.priority] || 0));
        break;
      case 'effort':
        stories.sort((a, b) => {
          const aEffort = parseInt(a.effort) || 0;
          const bEffort = parseInt(b.effort) || 0;
          return aEffort - bEffort;
        });
        break;
      case 'date':
      default:
        stories.sort((a, b) => new Date(b.sourceTimestamp) - new Date(a.sourceTimestamp));
        break;
    }

    return stories;
  };

  const filteredAndSortedStories = getSortedAndFilteredStories();

  useEffect(() => {
    loadTranscripts();
    
    const style = document.createElement('style');
    style.textContent = `
      @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }
      @keyframes rotate { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      @keyframes bounce { 0%, 20%, 50%, 80%, 100% { transform: translateY(0); } 40% { transform: translateY(-10px); } 60% { transform: translateY(-5px); } }
      @keyframes glow { from { box-shadow: 0 0 20px rgba(59, 130, 246, 0.5); } to { box-shadow: 0 0 30px rgba(59, 130, 246, 0.8), 0 0 40px rgba(139, 92, 246, 0.3); } }
      @keyframes skynetPulse { 0% { background-position: 0% 50%; box-shadow: 0 0 25px rgba(59, 130, 246, 0.7); } 50% { background-position: 100% 50%; box-shadow: 0 0 35px rgba(139, 92, 246, 0.9), 0 0 50px rgba(59, 130, 246, 0.5); } 100% { background-position: 0% 50%; box-shadow: 0 0 25px rgba(59, 130, 246, 0.7); } }
      @keyframes shimmer { 0% { background-position: -200% 0; } 100% { background-position: 200% 0; } }
      @keyframes float { 0%, 100% { transform: translateY(0px); } 50% { transform: translateY(-20px); } }
    `;
    document.head.appendChild(style);
    
    return () => document.head.removeChild(style);
  }, []);

  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const getConfidenceColor = (confidence) => {
    if (confidence >= 0.9) return '#22c55e';
    if (confidence >= 0.8) return '#3b82f6';
    if (confidence >= 0.7) return '#eab308';
    return '#ef4444';
  };

  const getPriorityColor = (priority) => {
    switch(priority) {
      case 'High': return '#ef4444';
      case 'Medium': return '#eab308';
      case 'Low': return '#22c55e';
      default: return '#6b7280';
    }
  };

  const getSlackStatusIndicator = (story) => {
    if (!story.slackStatus) {
      return (
        <span style={{ fontSize: '12px', color: '#6b7280' }}>
          📱 Not sent to Slack
        </span>
      );
    }
    
    if (story.slackStatus.success) {
      return (
        <span style={{ fontSize: '12px', color: '#22c55e', display: 'flex', alignItems: 'center', gap: '4px' }}>
          ✅ Slack sent ({story.slackStatus.responseTime}ms)
        </span>
      );
    } else {
      return (
        <span style={{ fontSize: '12px', color: '#ef4444', display: 'flex', alignItems: 'center', gap: '4px' }}>
          ❌ Slack failed: {story.slackStatus.error?.substring(0, 30)}...
        </span>
      );
    }
  };

  const styles = {
    container: {
      minHeight: '100vh',
      backgroundColor: '#111827',
      color: 'white',
      display: 'flex',
      fontFamily: 'system-ui, -apple-system, sans-serif'
    },
    sidebar: {
      width: sidebarOpen ? '256px' : '64px',
      backgroundColor: '#1f2937',
      borderRight: '1px solid #374151',
      transition: 'width 0.3s ease',
      display: 'flex',
      flexDirection: 'column'
    },
    sidebarHeader: {
      padding: '16px',
      borderBottom: '1px solid #374151',
      display: 'flex',
      alignItems: 'center',
      gap: '12px'
    },
    logo: {
      width: '32px',
      height: '32px',
      backgroundColor: '#3b82f6',
      borderRadius: '8px',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontSize: '16px'
    },
    nav: {
      flex: 1,
      padding: '16px'
    },
    navButton: {
      width: '100%',
      display: 'flex',
      alignItems: 'center',
      gap: '12px',
      padding: '8px 12px',
      borderRadius: '8px',
      border: 'none',
      background: 'none',
      color: '#9ca3af',
      cursor: 'pointer',
      marginBottom: '8px',
      transition: 'all 0.2s ease'
    },
    navButtonActive: {
      backgroundColor: '#374151',
      color: '#60a5fa'
    },
    mainContent: {
      flex: 1,
      display: 'flex',
      flexDirection: 'column'
    },
    topBar: {
      backgroundColor: '#1f2937',
      borderBottom: '1px solid #374151',
      padding: '16px 24px',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between'
    },
    content: {
      flex: 1,
      padding: '24px',
      overflow: 'auto'
    },
    card: {
      backgroundColor: '#1f2937',
      border: '1px solid #374151',
      borderRadius: '8px',
      padding: '24px',
      marginBottom: '16px',
      transition: 'border-color 0.2s ease'
    },
    button: {
      display: 'flex',
      alignItems: 'center',
      gap: '8px',
      padding: '8px 16px',
      borderRadius: '6px',
      border: 'none',
      cursor: 'pointer',
      fontSize: '14px',
      transition: 'all 0.2s ease'
    },
    buttonPrimary: {
      backgroundColor: '#3b82f6',
      color: 'white'
    },
    buttonSuccess: {
      backgroundColor: '#22c55e',
      color: 'white'
    },
    buttonSecondary: {
      backgroundColor: '#374151',
      color: '#d1d5db'
    },
    error: {
      backgroundColor: 'rgba(185, 28, 28, 0.3)',
      border: '1px solid #dc2626',
      borderRadius: '8px',
      padding: '16px',
      marginBottom: '24px',
      color: '#fca5a5'
    },
    badge: {
      padding: '4px 12px',
      borderRadius: '20px',
      fontSize: '12px',
      fontWeight: '600',
      marginRight: '8px'
    },
    details: {
      marginTop: '16px'
    },
    summary: {
      cursor: 'pointer',
      padding: '12px',
      backgroundColor: '#374151',
      borderRadius: '6px',
      listStyle: 'none',
      transition: 'background-color 0.2s ease'
    },
    detailsContent: {
      marginTop: '12px',
      padding: '16px',
      backgroundColor: '#111827',
      borderRadius: '6px',
      maxHeight: '256px',
      overflow: 'auto'
    },
    pre: {
      fontSize: '14px',
      color: '#d1d5db',
      whiteSpace: 'pre-wrap',
      fontFamily: 'monospace',
      lineHeight: '1.5',
      margin: 0
    }
  };

  return (
    <div style={styles.container}>
      {/* Sidebar */}
      <div style={styles.sidebar}>
        <div style={styles.sidebarHeader}>
          <div style={{
            ...styles.logo,
            background: 'linear-gradient(135deg, #3b82f6, #8b5cf6)',
            animation: processingId || autoProcessing ? 'pulse 2s infinite' : 'none'
          }}>
            <div style={{
              fontSize: '18px',
              fontWeight: 'bold',
              color: 'white',
              textShadow: '0 0 10px rgba(255,255,255,0.5)'
            }}>
              🤖
            </div>
          </div>
          {sidebarOpen && (
            <div>
              <h1 style={{ 
                margin: 0, 
                fontWeight: 'bold', 
                fontSize: '18px',
                background: 'linear-gradient(135deg, #3b82f6, #8b5cf6)',
                backgroundClip: 'text',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                textShadow: processingId ? '0 0 20px rgba(59, 130, 246, 0.5)' : 'none'
              }}>
                SkyNet AI
              </h1>
              <p style={{ 
                margin: 0, 
                fontSize: '12px', 
                color: '#9ca3af',
                fontWeight: '500',
                letterSpacing: '0.5px'
              }}>
                Autonomous Dev Stories
              </p>
            </div>
          )}
        </div>

        <div style={styles.nav}>
          <button
            onClick={() => setActiveTab('transcripts')}
            style={{
              ...styles.navButton,
              ...(activeTab === 'transcripts' ? styles.navButtonActive : {})
            }}
          >
            <span>👥</span>
            {sidebarOpen && <span>Transcripts</span>}
            {sidebarOpen && (
              <span style={{
                marginLeft: 'auto',
                backgroundColor: '#4b5563',
                fontSize: '12px',
                padding: '2px 8px',
                borderRadius: '9999px'
              }}>
                {transcripts.length}
              </span>
            )}
          </button>

          <button
            onClick={() => setActiveTab('stories')}
            style={{
              ...styles.navButton,
              ...(activeTab === 'stories' ? styles.navButtonActive : {})
            }}
          >
            <span>⭐</span>
            {sidebarOpen && <span>Dev Stories</span>}
            {sidebarOpen && (
              <span style={{
                marginLeft: 'auto',
                backgroundColor: '#4b5563',
                fontSize: '12px',
                padding: '2px 8px',
                borderRadius: '9999px'
              }}>
                {processedStories.length}
              </span>
            )}
          </button>

          {sidebarOpen && (
            <div style={{ marginTop: '32px' }}>
              <h3 style={{ 
                fontSize: '14px', 
                fontWeight: '500', 
                color: '#9ca3af',
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
                marginBottom: '12px'
              }}>
                Statistics
              </h3>
              
              <div style={{
                backgroundColor: '#374151',
                borderRadius: '8px',
                padding: '12px',
                marginBottom: '12px'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: '14px', color: '#d1d5db' }}>Total Processed</span>
                  <span style={{ fontWeight: 'bold', color: '#60a5fa' }}>
                    {transcripts.filter(t => t.processed).length}
                  </span>
                </div>
              </div>

              <div style={{
                backgroundColor: '#374151',
                borderRadius: '8px',
                padding: '12px',
                marginBottom: '12px'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: '14px', color: '#d1d5db' }}>High Confidence</span>
                  <span style={{ fontWeight: 'bold', color: '#34d399' }}>
                    {processedStories.filter(s => s.confidence >= 0.8).length}
                  </span>
                </div>
              </div>

              <div style={{
                backgroundColor: '#374151',
                borderRadius: '8px',
                padding: '12px',
                marginBottom: '12px'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: '14px', color: '#d1d5db' }}>Slack Sent</span>
                  <span style={{ fontWeight: 'bold', color: '#a855f7' }}>
                    {processedStories.filter(s => s.slackStatus?.success).length}
                  </span>
                </div>
              </div>

              <div style={{
                backgroundColor: '#374151',
                borderRadius: '8px',
                padding: '12px'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: '14px', color: '#d1d5db' }}>Recommended</span>
                  <span style={{ fontWeight: 'bold', color: '#a855f7' }}>
                    {processedStories.filter(s => s.confidence >= 0.8 && s.priority === 'High').length}
                  </span>
                </div>
              </div>
            </div>
          )}

          {sidebarOpen && (
            <div style={{ marginTop: '24px' }}>
              <button
                onClick={() => setShowSlackConfig(!showSlackConfig)}
                style={{
                  ...styles.button,
                  width: '100%',
                  background: slackConfig.webhookUrl
                    ? 'linear-gradient(135deg, #22c55e, #16a34a)'
                    : 'linear-gradient(135deg, #a855f7, #7c3aed)',
                  color: 'white',
                  justifyContent: 'center',
                  marginBottom: '8px'
                }}
              >
                <span>📱</span>
                {slackConfig.webhookUrl ? '✅ Slack Connected' : 'Slack Setup'}
              </button>
              
              <button
                onClick={() => setShowJiraConfig(!showJiraConfig)}
                style={{
                  ...styles.button,
                  width: '100%',
                  background: jiraConfig.url && jiraConfig.email && jiraConfig.token && jiraConfig.projectKey
                    ? 'linear-gradient(135deg, #22c55e, #16a34a)'
                    : 'linear-gradient(135deg, #3b82f6, #1d4ed8)',
                  color: 'white',
                  justifyContent: 'center'
                }}
              >
                <span>⚙️</span>
                {jiraConfig.url ? '✅ JIRA Connected' : 'JIRA Setup'}
              </button>
              
              {(jiraConfig.url || slackConfig.webhookUrl) && (
                <div style={{
                  marginTop: '8px',
                  padding: '8px',
                  backgroundColor: '#374151',
                  borderRadius: '6px',
                  fontSize: '12px',
                  color: '#9ca3af'
                }}>
                  {slackConfig.webhookUrl && (
                    <div style={{ marginBottom: '4px' }}>📱 Slack notifications enabled</div>
                  )}
                  {jiraConfig.url && (
                    <>
                      <div>🌐 {jiraConfig.url.replace('https://', '').replace('http://', '')}</div>
                      <div>📧 {jiraConfig.email}</div>
                      <div>📋 {jiraConfig.projectKey}</div>
                    </>
                  )}
                  <div style={{ display: 'flex', gap: '4px', marginTop: '4px' }}>
                    {slackConfig.webhookUrl && (
                      <button
                        onClick={clearSlackConfig}
                        style={{
                          padding: '2px 6px',
                          backgroundColor: '#ef4444',
                          color: 'white',
                          border: 'none',
                          borderRadius: '4px',
                          fontSize: '10px',
                          cursor: 'pointer'
                        }}
                      >
                        🗑️ Clear Slack
                      </button>
                    )}
                    {jiraConfig.url && (
                      <button
                        onClick={clearJiraConfig}
                        style={{
                          padding: '2px 6px',
                          backgroundColor: '#ef4444',
                          color: 'white',
                          border: 'none',
                          borderRadius: '4px',
                          fontSize: '10px',
                          cursor: 'pointer'
                        }}
                      >
                        🗑️ Clear JIRA
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        <div style={{ padding: '16px', borderTop: '1px solid #374151' }}>
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            style={{
              ...styles.button,
              ...styles.buttonSecondary,
              width: '100%',
              justifyContent: 'center'
            }}
          >
            <span>☰</span>
          </button>
        </div>
      </div>

      {/* Main Content */}
      <div style={styles.mainContent}>
        <div style={styles.topBar}>
          <div>
<h1 style={{ 
              margin: 0, 
              fontSize: '24px', 
              fontWeight: 'bold',
              background: 'linear-gradient(135deg, #3b82f6, #8b5cf6)',
              backgroundClip: 'text',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              display: 'flex',
              alignItems: 'center',
              gap: '12px'
            }}>
              <span style={{
                fontSize: '28px',
                animation: processingId || autoProcessing ? 'rotate 2s linear infinite' : 'none',
                filter: processingId || autoProcessing ? 'drop-shadow(0 0 10px #3b82f6)' : 'none'
              }}>
                🤖
              </span>
              SkyNet AI
              {activeTab === 'transcripts' ? ' - Transcripts' : ' - Dev Stories'}
            </h1>
            <p style={{ margin: 0, fontSize: '14px', color: '#9ca3af' }}>
              {activeTab === 'transcripts' 
                ? 'Autonomous extraction from your Fathom meeting transcripts'
                : 'AI-generated development stories ready for deployment'
              }
            </p>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <button
              onClick={loadTranscripts}
              disabled={loading}
              style={{
                ...styles.button,
                ...styles.buttonPrimary,
                opacity: loading ? 0.5 : 1,
                cursor: loading ? 'not-allowed' : 'pointer',
                background: loading 
                  ? 'linear-gradient(45deg, #3b82f6, #8b5cf6)' 
                  : 'linear-gradient(135deg, #3b82f6, #1d4ed8)',
                boxShadow: loading ? '0 0 20px rgba(59, 130, 246, 0.5)' : 'none',
                animation: loading ? 'glow 1.5s ease-in-out infinite alternate' : 'none'
              }}
            >
              <span style={{
                animation: loading ? 'spin 1s linear infinite' : 'none'
              }}>
                ⚡
              </span>
              {loading ? 'SkyNet Processing...' : 'Refresh Data'}
            </button>

            {activeTab === 'transcripts' && (
              <>
                <button
                  onClick={processMultiple}
                  disabled={loading || transcripts.filter(t => !t.processed).length === 0}
                  style={{
                    ...styles.button,
                    background: 'linear-gradient(135deg, #22c55e, #16a34a)',
                    color: 'white',
                    opacity: (loading || transcripts.filter(t => !t.processed).length === 0) ? 0.5 : 1,
                    cursor: (loading || transcripts.filter(t => !t.processed).length === 0) ? 'not-allowed' : 'pointer',
                    boxShadow: loading ? '0 0 20px rgba(34, 197, 94, 0.5)' : 'none',
                    animation: loading ? 'pulse 2s infinite' : 'none'
                  }}
                >
                  <span style={{
                    animation: loading ? 'bounce 1s infinite' : 'none'
                  }}>
                    🤖
                  </span>
                  Deploy SkyNet ({transcripts.filter(t => !t.processed).slice(0, 3).length})
                </button>

                <button
                  onClick={autoProcessAll}
                  disabled={autoProcessing || transcripts.length === 0}
                  style={{
                    ...styles.button,
                    background: autoProcessing 
                      ? 'linear-gradient(45deg, #a855f7, #8b5cf6, #a855f7)'
                      : 'linear-gradient(135deg, #a855f7, #7c3aed)',
                    backgroundSize: autoProcessing ? '200% 200%' : '100% 100%',
                    animation: autoProcessing ? 'skynetPulse 2s ease-in-out infinite' : 'none',
                    color: 'white',
                    opacity: (autoProcessing || transcripts.length === 0) ? 0.5 : 1,
                    cursor: (autoProcessing || transcripts.length === 0) ? 'not-allowed' : 'pointer',
                    boxShadow: autoProcessing ? '0 0 25px rgba(168, 85, 247, 0.7)' : 'none'
                  }}
                >
                  <span style={{
                    animation: autoProcessing ? 'rotate 1s linear infinite' : 'none'
                  }}>
                    ⚡
                  </span>
                  {autoProcessing ? 'Auto-Processing...' : `🚀 Auto-Process ALL (${transcripts.length})`}
                </button>
              </>
            )}
          </div>
        </div>

        <div style={styles.content}>
          {error && (
            <div style={styles.error}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span>⚠️</span>
                <span style={{ fontWeight: '500' }}>Error:</span>
                <span>{error}</span>
              </div>
            </div>
          )}

          {activeTab === 'transcripts' && (
            <div>
              {transcripts.map(transcript => (
                <div key={transcript.id} style={styles.card}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '16px' }}>
                    <div style={{ flex: 1 }}>
                      <h3 style={{ margin: '0 0 8px 0', fontSize: '18px', fontWeight: '600' }}>
                        {transcript.title}
                      </h3>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '16px', fontSize: '14px', color: '#9ca3af' }}>
                        <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                          <span>🕐</span>
                          {formatDate(transcript.createdTime)}
                        </span>
                        <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                          <span>👥</span>
                          {transcript.wordCount} words
                        </span>
                        {transcript.processed && (
                          <span style={{ display: 'flex', alignItems: 'center', gap: '4px', color: '#34d399' }}>
                            <span>✅</span>
                            Processed
                          </span>
                        )}
                      </div>
                    </div>
                    
                    <button
                      onClick={() => processTranscript(transcript)}
                      disabled={transcript.processed || processingId === transcript.id}
                      style={{
                        ...styles.button,
                        background: transcript.processed 
                          ? 'linear-gradient(135deg, #4b5563, #6b7280)' 
                          : processingId === transcript.id
                            ? 'linear-gradient(45deg, #3b82f6, #8b5cf6, #3b82f6)'
                            : 'linear-gradient(135deg, #3b82f6, #1d4ed8)',
                        backgroundSize: processingId === transcript.id ? '200% 200%' : '100% 100%',
                        animation: processingId === transcript.id ? 'skynetPulse 2s ease-in-out infinite' : 'none',
                        color: transcript.processed ? '#9ca3af' : 'white',
                        cursor: (transcript.processed || processingId === transcript.id) ? 'not-allowed' : 'pointer',
                        boxShadow: processingId === transcript.id ? '0 0 25px rgba(59, 130, 246, 0.7)' : 'none',
                        border: processingId === transcript.id ? '2px solid rgba(59, 130, 246, 0.5)' : 'none'
                      }}
                    >
                      {processingId === transcript.id ? (
                        <>
                          <span style={{
                            animation: 'rotate 1s linear infinite',
                            filter: 'drop-shadow(0 0 5px #fff)'
                          }}>
                            🤖
                          </span>
                          <span style={{
                            background: 'linear-gradient(45deg, #fff, #60a5fa, #fff)',
                            backgroundSize: '200% 200%',
                            animation: 'shimmer 1.5s ease-in-out infinite',
                            backgroundClip: 'text',
                            WebkitBackgroundClip: 'text',
                            WebkitTextFillColor: 'transparent'
                          }}>
                            SkyNet Analyzing...
                          </span>
                        </>
                      ) : transcript.processed ? (
                        <>
                          <span>✅</span>
                          Mission Complete
                        </>
                      ) : (
                        <>
                          <span>🚀</span>
                          Activate SkyNet
                        </>
                      )}
                    </button>
                  </div>
                  
                  <details style={styles.details}>
                    <summary style={styles.summary}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ fontSize: '14px', fontWeight: '500' }}>View Transcript Content</span>
                        <span>▶</span>
                      </div>
                    </summary>
                    <div style={styles.detailsContent}>
                      <pre style={styles.pre}>
                        {transcript.content?.substring(0, 1000)}
                        {transcript.content?.length > 1000 && '...'}
                      </pre>
                    </div>
                  </details>
                </div>
              ))}

              {transcripts.length === 0 && !loading && (
                <div style={{ textAlign: 'center', padding: '64px' }}>
                  <div style={{ 
                    fontSize: '64px', 
                    marginBottom: '16px',
                    animation: 'float 3s ease-in-out infinite'
                  }}>
                    🤖
                  </div>
                  <h3 style={{ 
                    fontSize: '18px', 
                    fontWeight: '500', 
                    color: '#9ca3af', 
                    marginBottom: '8px',
                    background: 'linear-gradient(135deg, #3b82f6, #8b5cf6)',
                    backgroundClip: 'text',
                    WebkitBackgroundClip: 'text',
                    WebkitTextFillColor: 'transparent'
                  }}>
                    SkyNet Awaiting Data
                  </h3>
                  <p style={{ color: '#6b7280' }}>
                    Connect your Notion database to begin autonomous story generation.
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Stories Tab */}
          {activeTab === 'stories' && (
            <div>
              {/* Filters and Controls */}
              <div style={{
                backgroundColor: '#1f2937',
                border: '1px solid #374151',
                borderRadius: '8px',
                padding: '16px',
                marginBottom: '24px'
              }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '14px', fontWeight: '500', color: '#d1d5db', marginBottom: '8px' }}>
                      🔍 Search Stories
                    </label>
                    <input
                      type="text"
                      placeholder="Search titles, descriptions..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      style={{
                        width: '100%',
                        padding: '8px 12px',
                        backgroundColor: '#374151',
                        border: '1px solid #4b5563',
                        borderRadius: '6px',
                        color: 'white',
                        fontSize: '14px'
                      }}
                    />
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '14px', fontWeight: '500', color: '#d1d5db', marginBottom: '8px' }}>
                      🎯 Filter
                    </label>
                    <select
                      value={filterBy}
                      onChange={(e) => setFilterBy(e.target.value)}
                      style={{
                        width: '100%',
                        padding: '8px 12px',
                        backgroundColor: '#374151',
                        border: '1px solid #4b5563',
                        borderRadius: '6px',
                        color: 'white',
                        fontSize: '14px'
                      }}
                    >
                      <option value="all">All Stories ({processedStories.length})</option>
                      <option value="recommended">🌟 Recommended ({processedStories.filter(s => s.confidence >= 0.8 && s.priority === 'High').length})</option>
                      <option value="high-confidence">✅ High Confidence ({processedStories.filter(s => s.confidence >= 0.8).length})</option>
                      <option value="recent">🕐 Recent (2 days)</option>
                      <option value="needs-review">⚠️ Needs Review ({processedStories.filter(s => s.confidence < 0.7).length})</option>
                    </select>
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '14px', fontWeight: '500', color: '#d1d5db', marginBottom: '8px' }}>
                      📊 Sort By
                    </label>
                    <select
                      value={sortBy}
                      onChange={(e) => setSortBy(e.target.value)}
                      style={{
                        width: '100%',
                        padding: '8px 12px',
                        backgroundColor: '#374151',
                        border: '1px solid #4b5563',
                        borderRadius: '6px',
                        color: 'white',
                        fontSize: '14px'
                      }}
                    >
                      <option value="date">📅 Most Recent</option>
                      <option value="confidence">🎯 Highest Confidence</option>
                      <option value="priority">⚡ Priority Level</option>
                      <option value="effort">⚙️ Effort (Low to High)</option>
                    </select>
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '14px', fontWeight: '500', color: '#d1d5db', marginBottom: '8px' }}>
                      🚀 Quick Actions
                    </label>
                    <button
                      onClick={() => {
                        const recommended = processedStories.filter(s => s.confidence >= 0.8 && s.priority === 'High' && !s.deployedToJira);
                        if (recommended.length === 0) {
                          alert('No recommended stories ready for deployment!');
                          return;
                        }
                        if (window.confirm(`Deploy ${recommended.length} recommended stories to JIRA?`)) {
                          recommended.forEach(story => deployToJira(story));
                        }
                      }}
                      style={{
                        width: '100%',
                        padding: '8px 12px',
                        background: 'linear-gradient(135deg, #8b5cf6, #3b82f6)',
                        color: 'white',
                        border: 'none',
                        borderRadius: '6px',
                        fontSize: '14px',
                        fontWeight: '500',
                        cursor: 'pointer'
                      }}
                    >
                      🌟 Deploy Recommended
                    </button>
                  </div>
                </div>

                <div style={{ marginTop: '16px', paddingTop: '16px', borderTop: '1px solid #374151' }}>
                  <p style={{ fontSize: '14px', color: '#9ca3af', margin: 0 }}>
                    Showing <span style={{ color: '#60a5fa', fontWeight: '500' }}>{filteredAndSortedStories.length}</span> of <span style={{ color: '#60a5fa', fontWeight: '500' }}>{processedStories.length}</span> stories
                    {searchTerm && <span> matching "<span style={{ color: '#a855f7' }}>{searchTerm}</span>"</span>}
                  </p>
                </div>
              </div>

              {/* Configuration Modals */}
              {showSlackConfig && (
                <div style={{
                  position: 'fixed',
                  top: 0,
                  left: 0,
                  right: 0,
                  bottom: 0,
                  backgroundColor: 'rgba(0, 0, 0, 0.5)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  zIndex: 1000
                }}>
                  <div style={{
                    backgroundColor: '#1f2937',
                    borderRadius: '8px',
                    padding: '24px',
                    width: '90%',
                    maxWidth: '400px',
                    border: '1px solid #374151'
                  }}>
                    <h3 style={{ fontSize: '18px', fontWeight: 'bold', color: 'white', marginBottom: '16px' }}>
                      📱 Slack Configuration
                    </h3>
                    
                    <div style={{ marginBottom: '16px', padding: '12px', backgroundColor: '#374151', borderRadius: '6px', fontSize: '14px', color: '#d1d5db' }}>
                      🔗 Get your webhook URL from:<br/>
                      <a href="https://api.slack.com/messaging/webhooks" target="_blank" rel="noopener noreferrer" style={{ color: '#60a5fa' }}>
                        https://api.slack.com/messaging/webhooks
                      </a>
                    </div>
                    
                    <div>
                      <label style={{ display: 'block', fontSize: '14px', fontWeight: '500', color: '#d1d5db', marginBottom: '4px' }}>
                        Slack Webhook URL
                      </label>
                      <input
                        type="text"
                        placeholder="https://hooks.slack.com/services/..."
                        value={slackConfig.webhookUrl}
                        onChange={(e) => setSlackConfig(prev => ({...prev, webhookUrl: e.target.value}))}
                        style={{
                          width: '100%',
                          padding: '8px 12px',
                          backgroundColor: '#374151',
                          border: '1px solid #4b5563',
                          borderRadius: '6px',
                          color: 'white'
                        }}
                      />
                    </div>
                    
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', marginTop: '24px' }}>
                      <button
                        onClick={() => setShowSlackConfig(false)}
                        style={{
                          padding: '8px 16px',
                          backgroundColor: '#4b5563',
                          color: 'white',
                          border: 'none',
                          borderRadius: '6px',
                          cursor: 'pointer'
                        }}
                      >
                        Cancel
                      </button>
                      
                      <button
                        onClick={clearSlackConfig}
                        style={{
                          padding: '8px 16px',
                          backgroundColor: '#ef4444',
                          color: 'white',
                          border: 'none',
                          borderRadius: '6px',
                          cursor: 'pointer'
                        }}
                      >
                        🗑️ Clear
                      </button>
                      
                      <button
                        onClick={() => {
                          saveSlackConfig(slackConfig);
                          setShowSlackConfig(false);
                          alert('🤖 Slack configuration saved! SkyNet ready for notifications.');
                        }}
                        disabled={!slackConfig.webhookUrl}
                        style={{
                          padding: '8px 16px',
                          background: 'linear-gradient(135deg, #a855f7, #7c3aed)',
                          color: 'white',
                          border: 'none',
                          borderRadius: '6px',
                          cursor: 'pointer',
                          opacity: !slackConfig.webhookUrl ? 0.5 : 1
                        }}
                      >
                        💾 Save Config
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {showJiraConfig && (
                <div style={{
                  position: 'fixed',
                  top: 0,
                  left: 0,
                  right: 0,
                  bottom: 0,
                  backgroundColor: 'rgba(0, 0, 0, 0.5)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  zIndex: 1000
                }}>
                  <div style={{
                    backgroundColor: '#1f2937',
                    borderRadius: '8px',
                    padding: '24px',
                    width: '90%',
                    maxWidth: '400px',
                    border: '1px solid #374151'
                  }}>
                    <h3 style={{ fontSize: '18px', fontWeight: 'bold', color: 'white', marginBottom: '16px' }}>
                      🔧 JIRA Configuration
                    </h3>
                    
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                      <div>
                        <label style={{ display: 'block', fontSize: '14px', fontWeight: '500', color: '#d1d5db', marginBottom: '4px' }}>
                          JIRA URL
                        </label>
                        <input
                          type="text"
                          placeholder="https://yourcompany.atlassian.net"
                          value={jiraConfig.url}
                          onChange={(e) => setJiraConfig(prev => ({...prev, url: e.target.value}))}
                          style={{
                            width: '100%',
                            padding: '8px 12px',
                            backgroundColor: '#374151',
                            border: '1px solid #4b5563',
                            borderRadius: '6px',
                            color: 'white'
                          }}
                        />
                      </div>
                      
                      <div>
                        <label style={{ display: 'block', fontSize: '14px', fontWeight: '500', color: '#d1d5db', marginBottom: '4px' }}>
                          Email
                        </label>
                        <input
                          type="email"
                          placeholder="your-email@company.com"
                          value={jiraConfig.email}
                          onChange={(e) => setJiraConfig(prev => ({...prev, email: e.target.value}))}
                          style={{
                            width: '100%',
                            padding: '8px 12px',
                            backgroundColor: '#374151',
                            border: '1px solid #4b5563',
                            borderRadius: '6px',
                            color: 'white'
                          }}
                        />
                      </div>
                      
                      <div>
                        <label style={{ display: 'block', fontSize: '14px', fontWeight: '500', color: '#d1d5db', marginBottom: '4px' }}>
                          API Token
                        </label>
                        <input
                          type="password"
                          placeholder="Your JIRA API token"
                          value={jiraConfig.token}
                          onChange={(e) => setJiraConfig(prev => ({...prev, token: e.target.value}))}
                          style={{
                            width: '100%',
                            padding: '8px 12px',
                            backgroundColor: '#374151',
                            border: '1px solid #4b5563',
                            borderRadius: '6px',
                            color: 'white'
                          }}
                        />
                      </div>
                      
                      <div>
                        <label style={{ display: 'block', fontSize: '14px', fontWeight: '500', color: '#d1d5db', marginBottom: '4px' }}>
                          Project Key
                        </label>
                        <input
                          type="text"
                          placeholder="PROJ"
                          value={jiraConfig.projectKey}
                          onChange={(e) => setJiraConfig(prev => ({...prev, projectKey: e.target.value}))}
                          style={{
                            width: '100%',
                            padding: '8px 12px',
                            backgroundColor: '#374151',
                            border: '1px solid #4b5563',
                            borderRadius: '6px',
                            color: 'white'
                          }}
                        />
                      </div>
                    </div>
                    
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', marginTop: '24px' }}>
                      <button
                        onClick={() => setShowJiraConfig(false)}
                        style={{
                          padding: '8px 16px',
                          backgroundColor: '#4b5563',
                          color: 'white',
                          border: 'none',
                          borderRadius: '6px',
                          cursor: 'pointer'
                        }}
                      >
                        Cancel
                      </button>
                      
                      <button
                        onClick={clearJiraConfig}
                        style={{
                          padding: '8px 16px',
                          backgroundColor: '#ef4444',
                          color: 'white',
                          border: 'none',
                          borderRadius: '6px',
                          cursor: 'pointer'
                        }}
                      >
                        🗑️ Clear All
                      </button>
                      
                      <button
                        onClick={() => {
                          saveJiraConfig(jiraConfig);
                          setShowJiraConfig(false);
                          alert('🤖 JIRA configuration saved! SkyNet ready for deployment.');
                        }}
                        disabled={!jiraConfig.url || !jiraConfig.email || !jiraConfig.token || !jiraConfig.projectKey}
                        style={{
                          padding: '8px 16px',
                          background: 'linear-gradient(135deg, #3b82f6, #1d4ed8)',
                          color: 'white',
                          border: 'none',
                          borderRadius: '6px',
                          cursor: 'pointer',
                          opacity: (!jiraConfig.url || !jiraConfig.email || !jiraConfig.token || !jiraConfig.projectKey) ? 0.5 : 1
                        }}
                      >
                        💾 Save Config
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* Stories List */}
              {filteredAndSortedStories.map(story => (
                <div key={story.id} style={styles.card}>
                  <div style={{ marginBottom: '16px' }}>
                    <h3 style={{ margin: '0 0 12px 0', fontSize: '18px', fontWeight: '600' }}>
                      {story.title}
                    </h3>
                    
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px', flexWrap: 'wrap' }}>
                      <span style={{
                        ...styles.badge,
                        backgroundColor: getPriorityColor(story.priority) + '33',
                        color: getPriorityColor(story.priority),
                        border: `1px solid ${getPriorityColor(story.priority)}66`
                      }}>
                        {story.priority} Priority
                      </span>
                      <span style={{
                        ...styles.badge,
                        backgroundColor: '#374151',
                        color: '#d1d5db'
                      }}>
                        {story.type}
                      </span>
                      <span style={{
                        ...styles.badge,
                        backgroundColor: '#581c87',
                        color: '#c084fc'
                      }}>
                        {story.effort}
                      </span>
                      <span style={{
                        ...styles.badge,
                        backgroundColor: getConfidenceColor(story.confidence) + '33',
                        color: getConfidenceColor(story.confidence),
                        border: `1px solid ${getConfidenceColor(story.confidence)}66`
                      }}>
                        {Math.round(story.confidence * 100)}% confidence
                      </span>
                    </div>
                    
                    <div style={{ fontSize: '12px', color: '#6b7280', display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap' }}>
                      <span>From: {story.sourceTranscript} • {story.sourceTimestamp}</span>
                      {getSlackStatusIndicator(story)}
                    </div>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px', marginBottom: '24px' }}>
                    <div>
                      <h4 style={{ margin: '0 0 8px 0', fontSize: '14px', fontWeight: '600', color: '#d1d5db' }}>
                        📋 Description
                      </h4>
                      <p style={{ fontSize: '14px', color: '#9ca3af', lineHeight: '1.5', marginBottom: '16px' }}>
                        {story.description}
                      </p>
                      
                      <h4 style={{ margin: '0 0 8px 0', fontSize: '14px', fontWeight: '600', color: '#d1d5db' }}>
                        💰 Business Value
                      </h4>
                      <p style={{ fontSize: '14px', color: '#9ca3af', lineHeight: '1.5', marginBottom: '16px' }}>
                        {story.businessValue}
                      </p>

                      <h4 style={{ margin: '0 0 8px 0', fontSize: '14px', fontWeight: '600', color: '#d1d5db' }}>
                        ✅ Acceptance Criteria
                      </h4>
                      <ul style={{ margin: 0, padding: '0 0 0 16px' }}>
                        {story.acceptanceCriteria?.map((criteria, idx) => (
                          <li key={idx} style={{ fontSize: '14px', color: '#9ca3af', marginBottom: '4px' }}>
                            {criteria}
                          </li>
                        ))}
                      </ul>
                    </div>

                    <div>
                      <h4 style={{ margin: '0 0 8px 0', fontSize: '14px', fontWeight: '600', color: '#d1d5db' }}>
                        ⚙️ Technical Requirements
                      </h4>
                      <ul style={{ margin: '0 0 16px 0', padding: '0 0 0 16px' }}>
                        {story.technicalRequirements?.map((req, idx) => (
                          <li key={idx} style={{ fontSize: '14px', color: '#9ca3af', marginBottom: '4px' }}>
                            {req}
                          </li>
                        ))}
                      </ul>

                      <h4 style={{ margin: '0 0 8px 0', fontSize: '14px', fontWeight: '600', color: '#d1d5db' }}>
                        ⚠️ Risks
                      </h4>
                      <ul style={{ margin: '0 0 16px 0', padding: '0 0 0 16px' }}>
                        {story.risks?.map((risk, idx) => (
                          <li key={idx} style={{ fontSize: '14px', color: '#ef4444', marginBottom: '4px' }}>
                            {risk}
                          </li>
                        ))}
                      </ul>

                      {story.discussionContext && (
                        <div>
                          <h4 style={{ margin: '0 0 8px 0', fontSize: '14px', fontWeight: '600', color: '#d1d5db' }}>
                            💬 Discussion Context
                          </h4>
                          <p style={{ fontSize: '14px', color: '#9ca3af', lineHeight: '1.5', fontStyle: 'italic' }}>
                            "{story.discussionContext}"
                          </p>
                        </div>
                      )}
                    </div>
                  </div>

                  <div style={{ 
                    display: 'flex', 
                    justifyContent: 'flex-end', 
                    gap: '12px', 
                    paddingTop: '16px', 
                    borderTop: '1px solid #374151' 
                  }}>
                    <button
                      onClick={() => alert('🔧 Story editing coming soon!')}
                      style={{
                        ...styles.button,
                        background: 'linear-gradient(135deg, #374151, #4b5563)',
                        color: '#d1d5db',
                        border: '1px solid #6b7280'
                      }}
                    >
                      ✏️ Modify Parameters
                    </button>
                    
                    {story.deployedToJira ? (
                      <span style={{
                        ...styles.button,
                        background: 'linear-gradient(135deg, #22c55e, #16a34a)',
                        color: 'white',
                        cursor: 'default'
                      }}>
                        ✅ Deployed: {story.deployedToJira}
                      </span>
                    ) : (
                      <button
                        onClick={() => deployToJira(story)}
                        disabled={deployingToJira === story.id}
                        style={{
                          ...styles.button,
                          background: deployingToJira === story.id 
                            ? 'linear-gradient(45deg, #3b82f6, #8b5cf6, #3b82f6)'
                            : 'linear-gradient(135deg, #3b82f6, #1d4ed8)',
                          backgroundSize: deployingToJira === story.id ? '200% 200%' : '100% 100%',
                          animation: deployingToJira === story.id ? 'skynetPulse 2s ease-in-out infinite' : 'none',
                          color: 'white',
                          boxShadow: deployingToJira === story.id ? '0 4px 25px rgba(59, 130, 246, 0.4)' : '0 4px 15px rgba(59, 130, 246, 0.3)',
                          cursor: deployingToJira === story.id ? 'not-allowed' : 'pointer'
                        }}
                      >
                        {deployingToJira === story.id ? (
                          <>
                            <span style={{ animation: 'rotate 1s linear infinite' }}>🤖</span>
                            Deploying to JIRA...
                          </>
                        ) : (
                          <>
                            🚀 Deploy to JIRA
                          </>
                        )}
                      </button>
                    )}
                  </div>
                </div>
              ))}

              {filteredAndSortedStories.length === 0 && processedStories.length > 0 && (
                <div style={{ textAlign: 'center', padding: '64px' }}>
                  <div style={{ fontSize: '64px', marginBottom: '16px' }}>🔍</div>
                  <h3 style={{ 
                    fontSize: '18px', 
                    fontWeight: '500', 
                    color: '#9ca3af', 
                    marginBottom: '8px'
                  }}>
                    No Stories Match Your Filters
                  </h3>
                  <p style={{ color: '#6b7280', marginBottom: '16px' }}>
                    Try adjusting your search or filter criteria.
                  </p>
                  <button
                    onClick={() => {
                      setSearchTerm('');
                      setFilterBy('all');
                      setSortBy('date');
                    }}
                    style={{
                      ...styles.button,
                      background: 'linear-gradient(135deg, #3b82f6, #1d4ed8)',
                      color: 'white'
                    }}
                  >
                    🔄 Clear All Filters
                  </button>
                </div>
              )}

              {processedStories.length === 0 && (
                <div style={{ textAlign: 'center', padding: '64px' }}>
                  <div style={{ 
                    fontSize: '64px', 
                    marginBottom: '16px',
                    animation: 'pulse 2s infinite'
                  }}>
                    🤖
                  </div>
                  <h3 style={{ 
                    fontSize: '18px', 
                    fontWeight: '500', 
                    color: '#9ca3af', 
                    marginBottom: '8px',
                    background: 'linear-gradient(135deg, #3b82f6, #8b5cf6)',
                    backgroundClip: 'text',
                    WebkitBackgroundClip: 'text',
                    WebkitTextFillColor: 'transparent'
                  }}>
                    SkyNet Learning Module Empty
                  </h3>
                  <p style={{ color: '#6b7280' }}>
                    Activate SkyNet on transcripts to generate autonomous development stories.
                  </p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default App;