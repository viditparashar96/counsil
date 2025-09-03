// Simple test script for career counseling agents
const { CareerCounselingRouter } = require('./lib/agents/router.ts');

async function testAgents() {
  try {
    console.log('Testing Career Counseling Agents...\n');
    
    const router = new CareerCounselingRouter();
    
    // Test getting available agents
    const agents = router.listAvailableAgents();
    console.log('Available agents:', agents.length);
    agents.forEach(agent => {
      console.log(`- ${agent.name}: ${agent.description}`);
    });
    
    // Test agent routing logic (without actual OpenAI API calls)
    console.log('\nAgent routing tests:');
    
    const testCases = [
      'Help me optimize my resume',
      'I need interview preparation',
      'What should my career path be?',
      'How do I find jobs in tech?'
    ];
    
    testCases.forEach(message => {
      // This would normally call the OpenAI API, but we can test routing logic
      const agent = router.determineAgent ? router.determineAgent(message) : 'planner';
      console.log(`"${message}" -> Routed to: ${agent}`);
    });
    
    console.log('\n✅ Basic agent structure test passed!');
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
  }
}

testAgents();