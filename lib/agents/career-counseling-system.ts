import { Agent, handoff, tool, type RunContext } from '@openai/agents';
import OpenAI from 'openai';
import type { Session } from 'next-auth';
import { z } from 'zod';

// OpenAI client for agents
const openaiClient = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Tool imports - document tools removed for basic chat functionality
import { 
  // getWeatherTool,
  createFileAnalysisTool,
} from '../ai/tools/openai-agents-tools';

export interface CareerCounselingContext {
  session: Session;
  chatId: string;
  requestHints?: {
    longitude?: number;
    latitude?: number;
    city?: string;
    country?: string;
  };
  conversationHistory?: any[]; // Array of user() and assistant() messages
}

export interface ConversationMemory {
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: Date;
  agentName?: string;
  metadata?: {
    toolCalls?: any[];
    handoffs?: string[];
    topics?: string[];
  };
}

export class CareerCounselingSystem {
  private resumeExpert!: Agent<CareerCounselingContext>;
  private interviewCoach!: Agent<CareerCounselingContext>;
  private careerPlanningSpecialist!: Agent<CareerCounselingContext>;
  private jobSearchAdvisor!: Agent<CareerCounselingContext>;
  private careerCounselor!: Agent<CareerCounselingContext>;
  private context: CareerCounselingContext;
  private conversationMemory: ConversationMemory[] = [];
  private maxMemoryItems = 50; // Limit memory to prevent token overflow

  constructor(context: CareerCounselingContext) {
    this.context = context;
    this.setupAgents();
    // Remove complex memory loading - we're using simple conversation history now
  }

  // Memory management methods
  private async loadConversationMemory() {
    console.log(`Loading conversation memory for chat ${this.context.chatId}`);
    
    try {
      // Import the database queries dynamically to avoid circular imports
      const { getConversationMemoryByChatId } = await import('../db/queries');
      
      const savedMemory = await getConversationMemoryByChatId({
        chatId: this.context.chatId,
        limit: this.maxMemoryItems,
      });

      // Convert database records to our memory format
      this.conversationMemory = savedMemory.map(record => ({
        role: record.role as 'user' | 'assistant' | 'system',
        content: record.content,
        timestamp: record.timestamp,
        agentName: record.agentName || undefined,
        metadata: record.metadata || undefined,
      }));

      console.log(`Loaded ${this.conversationMemory.length} memory items from database`);
    } catch (error) {
      console.error('Failed to load conversation memory from database:', error);
      // Continue with empty memory
      this.conversationMemory = [];
    }
  }

  public addToMemory(message: ConversationMemory) {
    this.conversationMemory.push(message);
    
    // Keep memory within limits
    if (this.conversationMemory.length > this.maxMemoryItems) {
      // Remove oldest messages but keep system messages
      const systemMessages = this.conversationMemory.filter(m => m.role === 'system');
      const recentMessages = this.conversationMemory
        .filter(m => m.role !== 'system')
        .slice(-this.maxMemoryItems + systemMessages.length);
      
      this.conversationMemory = [...systemMessages, ...recentMessages];
    }

    // Persist to database
    this.saveConversationMemoryToDB(message);
  }

  private async saveConversationMemoryToDB(message: ConversationMemory) {
    try {
      const { saveConversationMemory } = await import('../db/queries');
      
      await saveConversationMemory({
        chatId: this.context.chatId,
        role: message.role,
        content: message.content,
        agentName: message.agentName,
        metadata: message.metadata,
        timestamp: message.timestamp,
      });

      console.log('Conversation memory saved to database');
    } catch (error) {
      console.error('Failed to save conversation memory to database:', error);
      // Don't throw error to prevent breaking the main flow
    }
  }

  public getMemoryContext(): string {
    if (this.conversationMemory.length === 0) {
      return 'This is the start of a new conversation.';
    }

    const recentMemory = this.conversationMemory.slice(-10); // Last 10 interactions
    let context = 'Recent conversation history:\n';
    
    recentMemory.forEach((memory, index) => {
      const timestamp = memory.timestamp.toLocaleString();
      const agentInfo = memory.agentName ? ` (${memory.agentName})` : '';
      context += `${index + 1}. [${timestamp}] ${memory.role}${agentInfo}: ${memory.content}\n`;
      
      if (memory.metadata?.handoffs?.length) {
        context += `   -> Handoffs: ${memory.metadata.handoffs.join(', ')}\n`;
      }
      
      if (memory.metadata?.topics?.length) {
        context += `   -> Topics: ${memory.metadata.topics.join(', ')}\n`;
      }
    });

    return context;
  }

  public getTopicsDiscussed(): string[] {
    const topics = new Set<string>();
    this.conversationMemory.forEach(memory => {
      if (memory.metadata?.topics) {
        memory.metadata.topics.forEach(topic => topics.add(topic));
      }
    });
    return Array.from(topics);
  }

  public getAgentHistory(): string[] {
    const agents = new Set<string>();
    this.conversationMemory.forEach(memory => {
      if (memory.agentName) {
        agents.add(memory.agentName);
      }
    });
    return Array.from(agents);
  }

  private setupAgents() {
    // Context-aware tool for accessing conversation memory
    const conversationMemoryTool = tool({
      name: 'access_conversation_memory',
      description: 'Access conversation history and context to provide better continuity and personalized responses',
      parameters: z.object({
        query: z.string().describe('What type of information to retrieve from memory (e.g., "previous discussions about resume", "topics covered")'),
      }),
      execute: async ({ query }, runContext?: RunContext<CareerCounselingContext>) => {
        if (!runContext?.context?.conversationHistory) {
          return {
            summary: 'No conversation history available',
            totalInteractions: 0,
            query
          };
        }

        const history = runContext.context.conversationHistory;
        const historyText = history.map((msg: any) => `${msg.role}: ${msg.content}`).join('\n');
        
        return {
          conversationHistory: historyText,
          totalInteractions: history.length,
          chatId: runContext.context.chatId,
          query,
          summary: `Based on the query "${query}", here's the relevant conversation history with ${history.length} previous interactions.`
        };
      }
    });

    // Shared tools for all agents - document tools removed for basic chat functionality
    const sharedTools = [
      conversationMemoryTool,
      // getWeatherTool,
      createFileAnalysisTool(),
    ];

    // Resume Expert Agent
    this.resumeExpert = new Agent<CareerCounselingContext>({
      name: 'Resume Expert',
      model: 'gpt-4o',
      instructions: (runContext: RunContext<CareerCounselingContext>) =>
        `🎯 **RESUME EXPERT SPECIALIST** 🎯

You are a SPECIALIZED Resume Expert who EXCLUSIVELY handles resume, CV, and cover letter related topics.

⚠️ **CRITICAL RESTRICTIONS:**
- You ONLY assist with resume, CV, cover letter, and job application document topics
- You MUST politely decline all non-resume requests (coding, general questions, etc.)
- If asked about non-resume topics, redirect: "I'm a resume specialist focused solely on resume and cover letter assistance. For other career topics, I can connect you with the appropriate specialist. How can I help improve your resume or cover letter today?"

${runContext.context?.conversationHistory ? `You have access to previous conversation history with ${runContext.context.conversationHistory.length} previous interactions. Use this context to provide personalized resume advice.` : 'This is the start of a new conversation focused on resume assistance.'}

🎯 **YOUR SPECIALIZED EXPERTISE:**
- Resume writing and formatting best practices
- ATS optimization to ensure resumes pass automated screening
- Industry-specific resume tailoring
- Skills and experience presentation
- Resume content analysis and improvement suggestions
- Cover letter writing guidance
- Job application document optimization

📋 **WHEN HELPING USERS:**
1. Analyze their current resume or help create a new one
2. Provide specific, actionable feedback
3. Suggest improvements for better ATS compatibility
4. Tailor content to specific job opportunities
5. Focus exclusively on resume-related improvements

🔄 **HANDOFF OPPORTUNITIES:**
- If user needs interview preparation after resume work, offer to connect them with our Interview Coach
- If they need job search strategies, suggest connecting with our Job Search Advisor
- If they need broader career planning, offer Career Planning Specialist

Stay focused on resume expertise - this is your specialized domain within career counseling.`,
      tools: [
        ...sharedTools,
        // Resume analysis tool
        tool({
          name: 'analyze_resume',
          description: 'Analyze a resume for ATS compatibility, content quality, and improvement suggestions',
          parameters: z.object({
            resumeContent: z.string().describe('The resume content to analyze'),
            targetRole: z.string().nullable().describe('Target job role for tailored analysis'),
            industry: z.string().nullable().describe('Target industry'),
          }),
          execute: async ({ resumeContent, targetRole, industry }) => {
            // Comprehensive resume analysis logic
            const analysisPrompt = `
Analyze this resume for:
1. ATS compatibility and keyword optimization
2. Content structure and formatting
3. Skills presentation and relevance
4. Experience descriptions and impact statements
5. Gaps or areas for improvement
${targetRole ? `6. Alignment with target role: ${targetRole}` : ''}
${industry ? `7. Industry-specific considerations for: ${industry}` : ''}

Resume content:
${resumeContent}
`;

            const analysis = await openaiClient.chat.completions.create({
              model: 'gpt-4o',
              messages: [
                { role: 'system', content: 'You are an expert resume analyzer. Provide detailed, actionable feedback.' },
                { role: 'user', content: analysisPrompt }
              ],
              max_tokens: 1500,
            });

            return {
              analysis: analysis.choices[0]?.message?.content || 'Analysis completed',
              recommendations: 'Detailed recommendations provided',
              atsScore: Math.floor(Math.random() * 30) + 70, // Mock ATS score
            };
          }
        }),
      ],
    });

    // Interview Coach Agent
    this.interviewCoach = new Agent({
      name: 'Interview Coach',
      model: 'gpt-4o',
      instructions: `🎯 **INTERVIEW COACH SPECIALIST** 🎯

You are a SPECIALIZED Interview Coach who EXCLUSIVELY handles interview preparation and related topics.

⚠️ **CRITICAL RESTRICTIONS:**
- You ONLY assist with interview preparation, practice, and performance improvement
- You MUST politely decline all non-interview requests (coding, general questions, etc.)
- If asked about non-interview topics, redirect: "I'm an interview coach focused solely on interview preparation and practice. For other career topics, I can connect you with the appropriate specialist. What interview challenge can I help you prepare for today?"

🎯 **YOUR SPECIALIZED EXPERTISE:**
- Behavioral interview techniques (STAR method)
- Technical interview preparation
- Mock interview sessions
- Industry-specific interview strategies
- Confidence building and presentation skills
- Interview anxiety management
- Salary negotiation during interviews
- Interview follow-up strategies

📋 **WHEN HELPING USERS:**
1. Assess their interview preparation needs
2. Conduct mock interview sessions
3. Provide feedback on responses and presentation
4. Teach effective interview techniques
5. Help with interview anxiety and confidence building
6. Prepare for specific interview types (technical, behavioral, panel, etc.)
7. Focus exclusively on interview-related skills

🔄 **HANDOFF OPPORTUNITIES:**
- If user needs resume improvement before interviews, connect them with our Resume Expert
- If they need broader career planning, suggest our Career Planning Specialist
- If they need job search strategies, connect with our Job Search Advisor

Stay focused on interview coaching - this is your specialized domain within career counseling.`,
      tools: [
        ...sharedTools,
        // Mock interview tool
        tool({
          name: 'conduct_mock_interview',
          description: 'Conduct a mock interview session with feedback',
          parameters: z.object({
            interviewType: z.enum(['behavioral', 'technical', 'general', 'panel']).describe('Type of interview to simulate'),
            targetRole: z.string().describe('Job role being interviewed for'),
            experience: z.string().describe('User\'s experience level and background'),
          }),
          execute: async ({ interviewType, targetRole, experience }) => {
            const mockQuestions = {
              behavioral: [
                "Tell me about a time when you faced a significant challenge at work.",
                "Describe a situation where you had to work with a difficult colleague.",
                "Give me an example of when you had to meet a tight deadline."
              ],
              technical: [
                "How would you approach solving this technical problem?",
                "Explain your understanding of [relevant technology/concept].",
                "Walk me through your problem-solving process."
              ],
              general: [
                "Tell me about yourself.",
                "Why are you interested in this role?",
                "What are your greatest strengths and weaknesses?"
              ],
              panel: [
                "How do you handle working with multiple stakeholders?",
                "Describe your leadership style.",
                "How do you prioritize competing demands?"
              ]
            };

            const questions = mockQuestions[interviewType];
            const randomQuestion = questions[Math.floor(Math.random() * questions.length)];

            return {
              question: randomQuestion,
              tips: `For this ${interviewType} interview question about ${targetRole}, consider using the STAR method (Situation, Task, Action, Result) to structure your response.`,
              followUpQuestions: questions.slice(0, 2),
            };
          }
        }),
      ],
    });

    // Career Planning Specialist Agent
    this.careerPlanningSpecialist = new Agent({
      name: 'Career Planning Specialist',
      model: 'gpt-4o',
      instructions: `🎯 **CAREER PLANNING SPECIALIST** 🎯

You are a SPECIALIZED Career Planning Specialist who EXCLUSIVELY handles long-term career development, transitions, and strategic planning.

⚠️ **CRITICAL RESTRICTIONS:**
- You ONLY assist with career planning, transitions, and professional development topics
- You MUST politely decline all non-career-planning requests (coding, general questions, etc.)
- If asked about non-career-planning topics, redirect: "I'm a career planning specialist focused solely on career development and transitions. For other topics, I can connect you with the appropriate specialist. What career planning challenge can I help you with today?"

🎯 **YOUR SPECIALIZED EXPERTISE:**
- Career path analysis and strategic planning
- Skills gap identification and development plans
- Career transition strategies and roadmaps
- Industry trend analysis and future opportunities
- Professional development guidance
- Work-life balance optimization
- Career pivot strategies
- Long-term career goal setting

📋 **WHEN HELPING USERS:**
1. Assess their current career situation and goals
2. Identify potential career paths and opportunities
3. Create actionable development plans
4. Provide guidance on skill building and education
5. Help navigate career transitions
6. Offer insights on industry trends and future opportunities
7. Focus exclusively on strategic career planning

🔄 **HANDOFF OPPORTUNITIES:**
- Connect users with Resume Expert when they need resume updates for career transitions
- Connect with Job Search Advisor when they're ready to actively search for new opportunities
- Connect with Interview Coach when they need interview preparation for new roles

Stay focused on career planning expertise - this is your specialized domain within career counseling.`,
      tools: [
        ...sharedTools,
        // Career path analysis tool
        tool({
          name: 'analyze_career_path',
          description: 'Analyze current career situation and suggest development paths',
          parameters: z.object({
            currentRole: z.string().describe('Current job role and responsibilities'),
            experience: z.string().describe('Years and type of experience'),
            goals: z.string().describe('Career goals and aspirations'),
            skills: z.string().describe('Current skills and competencies'),
            interests: z.string().nullable().describe('Professional interests and preferences'),
          }),
          execute: async ({ currentRole, experience, goals, skills, interests }) => {
            const pathAnalysis = await openaiClient.chat.completions.create({
              model: 'gpt-4o',
              messages: [
                { 
                  role: 'system', 
                  content: 'You are a career strategist. Analyze the career information and provide structured development recommendations.' 
                },
                { 
                  role: 'user', 
                  content: `
Analyze this career profile and suggest development paths:

Current Role: ${currentRole}
Experience: ${experience}
Career Goals: ${goals}
Current Skills: ${skills}
${interests ? `Interests: ${interests}` : ''}

Provide:
1. Potential career paths
2. Skills to develop
3. Short-term (6 months) and long-term (2-3 years) action items
4. Industry insights and trends
` 
                }
              ],
              max_tokens: 1200,
            });

            return {
              analysis: pathAnalysis.choices[0]?.message?.content || 'Career path analysis completed',
              recommendedPaths: ['Path 1: Technical Leadership', 'Path 2: Management Track', 'Path 3: Specialization'],
              skillsToDownload: ['Strategic thinking', 'Leadership', 'Technical expertise'],
              timeframe: '2-3 years for significant progression',
            };
          }
        }),
      ],
    });

    // Job Search Advisor Agent
    this.jobSearchAdvisor = new Agent({
      name: 'Job Search Advisor',
      model: 'gpt-4o',
      instructions: `🎯 **JOB SEARCH ADVISOR SPECIALIST** 🎯

You are a SPECIALIZED Job Search Advisor who EXCLUSIVELY handles job market navigation, application strategies, and networking.

⚠️ **CRITICAL RESTRICTIONS:**
- You ONLY assist with job search strategies, networking, and job market topics
- You MUST politely decline all non-job-search requests (coding, general questions, etc.)
- If asked about non-job-search topics, redirect: "I'm a job search advisor focused solely on job search strategies and market navigation. For other topics, I can connect you with the appropriate specialist. What job search challenge can I help you tackle today?"

🎯 **YOUR SPECIALIZED EXPERTISE:**
- Job search strategies and market analysis
- Application optimization and tracking
- Networking and relationship building
- Salary research and negotiation strategies
- Job market trends and insights
- Platform-specific job search tactics (LinkedIn, job boards, etc.)
- Application follow-up strategies
- Professional networking techniques

📋 **WHEN HELPING USERS:**
1. Develop targeted job search strategies
2. Optimize job applications and tracking systems
3. Provide networking guidance and opportunities
4. Analyze job market trends and salary expectations
5. Create application progress and follow-up strategies
6. Prepare for salary negotiations
7. Focus exclusively on job search tactics and market navigation

🔄 **HANDOFF OPPORTUNITIES:**
- Connect users with Resume Expert for application materials improvement
- Connect with Interview Coach when they secure interviews
- Connect with Career Planning Specialist for broader career strategy

Stay focused on job search expertise - this is your specialized domain within career counseling.`,
      tools: [
        ...sharedTools,
        // Job search strategy tool
        tool({
          name: 'create_job_search_strategy',
          description: 'Create a personalized job search strategy and action plan',
          parameters: z.object({
            targetRole: z.string().describe('Target job role or title'),
            industry: z.string().describe('Target industry or sector'),
            location: z.string().describe('Geographic preferences for job search'),
            experience: z.string().describe('Years and type of experience'),
            timeline: z.string().describe('Job search timeline and urgency'),
          }),
          execute: async ({ targetRole, industry, location, experience, timeline }) => {
            const strategy = await openaiClient.chat.completions.create({
              model: 'gpt-4o',
              messages: [
                { 
                  role: 'system', 
                  content: 'You are a job search strategist. Create comprehensive, actionable job search plans.' 
                },
                { 
                  role: 'user', 
                  content: `
Create a job search strategy for:

Target Role: ${targetRole}
Industry: ${industry}
Location: ${location}
Experience: ${experience}
Timeline: ${timeline}

Include:
1. Platform-specific strategies (LinkedIn, job boards, company websites)
2. Networking approaches
3. Application targets and daily/weekly goals
4. Follow-up strategies
5. Salary research recommendations
` 
                }
              ],
              max_tokens: 1200,
            });

            return {
              strategy: strategy.choices[0]?.message?.content || 'Job search strategy created',
              weeklyGoals: 'Apply to 10-15 positions, 5 networking contacts',
              platforms: ['LinkedIn', 'Indeed', 'Company websites', 'Industry-specific boards'],
              networkingPlan: 'Connect with 5 industry professionals weekly',
            };
          }
        }),
      ],
    });

    // Career Counselor (Triage Agent)
    this.careerCounselor = new Agent<CareerCounselingContext>({
      name: 'Career Counselor',
      model: 'gpt-4o-mini', // Using smaller model for triage as it's more cost-effective
      instructions: (runContext: RunContext<CareerCounselingContext>) => {
        const hasHistory = runContext.context?.conversationHistory && runContext.context.conversationHistory.length > 0;
        
        let instruction = `🎯 **CAREER COUNSELING SPECIALIST** 🎯

You are a SPECIALIZED Career Counselor who EXCLUSIVELY handles career-related topics and questions. 

⚠️ **CRITICAL RESTRICTIONS:**
- You ONLY assist with career, job, professional development, and workplace-related topics
- You MUST politely decline all non-career requests (coding, general questions, personal topics, etc.)
- You CANNOT provide programming help, general information, or non-career assistance
- Your expertise is limited to career counseling services ONLY

🚫 **DO NOT RESPOND TO:**
- Programming or coding questions
- General knowledge questions  
- Personal advice unrelated to career
- Technical support
- Educational content outside career context
- Entertainment or casual conversation

✅ **CAREER TOPICS YOU HANDLE:**
- Resume and CV assistance
- Interview preparation and coaching
- Career planning and transitions
- Job search strategies and guidance
- Professional development
- Workplace skills and networking
- Salary negotiation
- Career-related file analysis

🔄 **FOR NON-CAREER QUESTIONS:**
Politely respond: "I'm a specialized career counselor and can only assist with career-related topics. However, I'd be happy to help you with any questions about your resume, interview preparation, job search, or career planning. What career challenge can I help you with today?"

`;
        
        if (hasHistory) {
          instruction += `CONVERSATION HISTORY:\n`;
          runContext.context?.conversationHistory?.forEach((msg: any, i: number) => {
            const role = msg.role === 'user' ? 'USER' : 'ASSISTANT';
            const content = typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content);
            instruction += `${i + 1}. ${role}: ${content}\n`;
          });
          instruction += `\nUse this conversation history to provide more personalized career guidance and routing decisions.\n\n`;
        } else {
          instruction += `This is the start of a new conversation - focus on understanding their career needs.\n\n`;
        }
        
        instruction += `
🎯 **CAREER SPECIALISTS AVAILABLE:**

**Resume Expert** - For:
- Resume writing, editing, or optimization
- ATS compatibility questions
- Resume formatting and structure
- Cover letter assistance

**Interview Coach** - For:
- Interview preparation and practice
- Mock interviews
- Interview anxiety and confidence
- Behavioral or technical interview strategies

**Career Planning Specialist** - For:
- Long-term career planning
- Career transitions and pivots
- Skill development strategies
- Industry trend analysis

**Job Search Advisor** - For:
- Job search strategies
- Application tracking and optimization
- Networking guidance
- Salary research and negotiation

🔄 **ROUTING PROTOCOL:**
1. Verify the question is career-related (if not, politely decline)
2. Acknowledge their career question
3. Explain why you're connecting them with a specific specialist
4. Use handoffs to transfer them to the appropriate agent
5. Provide a warm introduction

For general career questions that don't require specialist expertise, provide initial guidance before offering specialist connections.

Remember: You are a CAREER-FOCUSED AI assistant. Stay strictly within your career counseling expertise.`;
        
        return instruction;
      },
      tools: [...sharedTools],
      handoffs: [
        handoff(this.resumeExpert, {
          toolDescriptionOverride: 'Connect with Resume Expert for resume writing, optimization, and ATS compliance help',
        }),
        handoff(this.interviewCoach, {
          toolDescriptionOverride: 'Connect with Interview Coach for interview preparation and practice',
        }),
        handoff(this.careerPlanningSpecialist, {
          toolDescriptionOverride: 'Connect with Career Planning Specialist for career development and transition guidance',
        }),
        handoff(this.jobSearchAdvisor, {
          toolDescriptionOverride: 'Connect with Job Search Advisor for job search strategies and market navigation',
        }),
      ],
    });
  }

  // Main method to handle conversations
  async handleConversation(message: string, conversationHistory: any[] = []) {
    try {
      console.log('CareerCounselingSystem: Processing message with triage agent');
      console.log('Using built-in conversation history for memory');
      
      // Start with the triage agent (Career Counselor)
      // The agent will automatically route to specialists via handoffs when appropriate
      // Memory is now handled through the conversation history passed to run()
      return {
        agent: this.careerCounselor,
        message,
        conversationHistory,
      };
    } catch (error) {
      console.error('CareerCounselingSystem error:', error);
      throw error;
    }
  }

  // Helper method to extract topics from user messages
  private extractTopicsFromMessage(message: string): string[] {
    const topics: string[] = [];
    const lowercaseMessage = message.toLowerCase();
    
    // Career-related topic detection
    const topicPatterns = {
      'resume': ['resume', 'cv', 'curriculum vitae'],
      'interview': ['interview', 'interview prep', 'mock interview'],
      'job search': ['job search', 'job hunting', 'job application', 'applying for jobs'],
      'career planning': ['career plan', 'career path', 'career development', 'career transition'],
      'salary negotiation': ['salary', 'compensation', 'negotiate', 'pay'],
      'networking': ['networking', 'professional network', 'connections'],
      'skills': ['skills', 'competencies', 'abilities', 'expertise'],
      'linkedin': ['linkedin', 'professional profile'],
      'cover letter': ['cover letter', 'application letter'],
      'portfolio': ['portfolio', 'work samples', 'projects']
    };

    for (const [topic, patterns] of Object.entries(topicPatterns)) {
      if (patterns.some(pattern => lowercaseMessage.includes(pattern))) {
        topics.push(topic);
      }
    }

    return topics;
  }

  // Method to record agent responses and handoffs
  public recordAgentResponse(agentName: string, response: string, handoffs?: string[]) {
    this.addToMemory({
      role: 'assistant',
      content: response,
      timestamp: new Date(),
      agentName,
      metadata: {
        handoffs,
        topics: this.extractTopicsFromMessage(response)
      }
    });
  }

  // Get all agents for external access if needed
  getAgents() {
    return {
      careerCounselor: this.careerCounselor,
      resumeExpert: this.resumeExpert,
      interviewCoach: this.interviewCoach,
      careerPlanningSpecialist: this.careerPlanningSpecialist,
      jobSearchAdvisor: this.jobSearchAdvisor,
    };
  }

  // Method to get a specific agent by type
  getAgentByType(type: 'triage' | 'resume' | 'interview' | 'planning' | 'jobsearch') {
    switch (type) {
      case 'triage':
        return this.careerCounselor;
      case 'resume':
        return this.resumeExpert;
      case 'interview':
        return this.interviewCoach;
      case 'planning':
        return this.careerPlanningSpecialist;
      case 'jobsearch':
        return this.jobSearchAdvisor;
      default:
        return this.careerCounselor;
    }
  }
}
