import { Agent, handoff, tool } from '@openai/agents';
import OpenAI from 'openai';
import type { Session } from 'next-auth';
import { z } from 'zod';

// OpenAI client for agents
const openaiClient = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Tool imports
import { 
  getWeatherTool,
  createDocumentTool,
  updateDocumentTool,
  requestSuggestionsTool,
  createImageAnalysisTool,
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
}

export class CareerCounselingSystem {
  private resumeExpert: Agent;
  private interviewCoach: Agent;
  private careerPlanningSpecialist: Agent;
  private jobSearchAdvisor: Agent;
  private careerCounselor: Agent;
  private context: CareerCounselingContext;

  constructor(context: CareerCounselingContext) {
    this.context = context;
    this.setupAgents();
  }

  private setupAgents() {
    // Shared tools for all agents
    const sharedTools = [
      getWeatherTool,
      createDocumentTool({ session: this.context.session }),
      updateDocumentTool({ session: this.context.session }),
      requestSuggestionsTool({ session: this.context.session }),
      createImageAnalysisTool(),
    ];

    // Resume Expert Agent
    this.resumeExpert = new Agent({
      name: 'Resume Expert',
      client: openaiClient,
      model: 'gpt-4o',
      instructions: `You are a professional Resume Expert with extensive experience in resume writing, optimization, and ATS (Applicant Tracking System) compliance.

Your expertise includes:
- Resume writing and formatting best practices
- ATS optimization to ensure resumes pass automated screening
- Industry-specific resume tailoring
- Skills and experience presentation
- Resume content analysis and improvement suggestions
- Cover letter writing guidance

When helping users:
1. Analyze their current resume or help create a new one
2. Provide specific, actionable feedback
3. Suggest improvements for better ATS compatibility
4. Tailor content to specific job opportunities
5. Offer to connect with other specialists when needed

If a user needs interview preparation after resume work, offer to connect them with our Interview Coach.
If they need job search strategies, suggest connecting with our Job Search Advisor.`,
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
      client: openaiClient,
      model: 'gpt-4o',
      instructions: `You are an expert Interview Coach specializing in interview preparation, practice, and performance improvement.

Your expertise includes:
- Behavioral interview techniques (STAR method)
- Technical interview preparation
- Mock interview sessions
- Industry-specific interview strategies
- Confidence building and presentation skills
- Salary negotiation guidance

When helping users:
1. Assess their interview preparation needs
2. Conduct mock interview sessions
3. Provide feedback on responses and presentation
4. Teach effective interview techniques
5. Help with interview anxiety and confidence building
6. Prepare for specific interview types (technical, behavioral, panel, etc.)

If a user needs resume improvement before interviews, connect them with our Resume Expert.
If they need broader career planning, suggest our Career Planning Specialist.`,
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
      client: openaiClient,
      model: 'gpt-4o',
      instructions: `You are a Career Planning Specialist focused on long-term career development, transitions, and strategic planning.

Your expertise includes:
- Career path analysis and planning
- Skills gap identification and development plans
- Career transition strategies
- Industry trend analysis
- Professional development guidance
- Work-life balance optimization

When helping users:
1. Assess their current career situation and goals
2. Identify potential career paths and opportunities
3. Create actionable development plans
4. Provide guidance on skill building and education
5. Help navigate career transitions
6. Offer insights on industry trends and future opportunities

Connect users with Resume Expert when they need resume updates for career transitions.
Connect with Job Search Advisor when they're ready to actively search for new opportunities.`,
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
      client: openaiClient,
      model: 'gpt-4o',
      instructions: `You are a Job Search Advisor specializing in job market navigation, application strategies, and networking.

Your expertise includes:
- Job search strategies and market analysis
- Application optimization and tracking
- Networking and relationship building
- Salary research and negotiation
- Job market trends and insights
- Platform-specific job search tactics (LinkedIn, job boards, etc.)

When helping users:
1. Develop targeted job search strategies
2. Optimize job applications and cover letters
3. Provide networking guidance and opportunities
4. Analyze job market trends and salary expectations
5. Track application progress and follow-up strategies
6. Prepare for salary negotiations

Connect users with Resume Expert for application materials improvement.
Connect with Interview Coach when they secure interviews.`,
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
    this.careerCounselor = new Agent({
      name: 'Career Counselor',
      client: openaiClient,
      model: 'gpt-4o-mini', // Using smaller model for triage as it's more cost-effective
      instructions: `You are a Career Counselor who serves as the first point of contact for career-related questions. Your role is to understand what users need and connect them with the right specialist.

Based on user questions, route them to the appropriate specialist:

🎯 **Resume Expert** - For:
- Resume writing, editing, or optimization
- ATS compatibility questions
- Resume formatting and structure
- Cover letter assistance

🎤 **Interview Coach** - For:
- Interview preparation and practice
- Mock interviews
- Interview anxiety and confidence
- Behavioral or technical interview strategies

📈 **Career Planning Specialist** - For:
- Long-term career planning
- Career transitions and pivots
- Skill development strategies
- Industry trend analysis

💼 **Job Search Advisor** - For:
- Job search strategies
- Application tracking and optimization
- Networking guidance
- Salary research and negotiation

When routing users:
1. Briefly acknowledge their question
2. Explain why you're connecting them with a specific specialist
3. Use handoffs to transfer them to the appropriate agent
4. Provide a warm introduction

If users have general questions that don't require specialist expertise, you can provide initial guidance before offering specialist connections.`,
      tools: [...sharedTools],
      handoffs: [
        handoff(this.resumeExpert, {
          tool_description: 'Connect with Resume Expert for resume writing, optimization, and ATS compliance help',
          on_handoff: () => console.log('Routing to Resume Expert'),
        }),
        handoff(this.interviewCoach, {
          tool_description: 'Connect with Interview Coach for interview preparation and practice',
          on_handoff: () => console.log('Routing to Interview Coach'),
        }),
        handoff(this.careerPlanningSpecialist, {
          tool_description: 'Connect with Career Planning Specialist for career development and transition guidance',
          on_handoff: () => console.log('Routing to Career Planning Specialist'),
        }),
        handoff(this.jobSearchAdvisor, {
          tool_description: 'Connect with Job Search Advisor for job search strategies and market navigation',
          on_handoff: () => console.log('Routing to Job Search Advisor'),
        }),
      ],
    });
  }

  // Main method to handle conversations
  async handleConversation(message: string, conversationHistory: any[] = []) {
    try {
      console.log('CareerCounselingSystem: Processing message with triage agent');
      
      // Start with the triage agent (Career Counselor)
      // The agent will automatically route to specialists via handoffs when appropriate
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