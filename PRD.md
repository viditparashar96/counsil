# **Steps**

## **Step 1: Project Setup**

1. Create a new Next.js application using TypeScript (strictly TypeScript, no JavaScript)
2. Initialize a public GitHub repository for your project
3. Set up your development environment with the required tech stack:
   1. Next.js (latest stable version)
   2. TypeScript
   3. tRPC for backend API
   4. TanStack Query for data fetching
   5. Your SQL choice of database (PostgreSQL, SQLite, etc.)
   6. ORM of your choice (bonus points for Drizzle or Prisma)
4. You can ask any doubts or queries (if any) by hitting “reply all” on the email you received the assignment.

## **Step 2: Application Architecture**

Design and implement a career counseling chat application with the following structure:

1. **Frontend Components**:
   1. Chat interface with message history
   2. Chat session management, the user should be able to see all previous chats and should be able to continue where they left off.
   3. Responsive design for mobile and desktop
2. **Backend API**:
   1. tRPC routers for chat and other application operations
   2. Database operations for chat persistence
   3. AI integration for career counseling responses using OpenAI APIs. You may use together.ai to host any free LLM chat model.
3. **Database Schema**:
   1. Users table (if implementing authentication)
   2. Chat sessions table
   3. Proper relationships and indexing
   4. Any other table or schema you deem necessary

## **Step 3: Core Features Implementation**

Implement the following core functionality:

1. **AI Career Counselor Chat**:
   1. Create an AI chat interface that acts as a career counselor
   2. The AI should provide meaningful career guidance and advice
   3. Implement proper conversation flow and context management
   4. Use any AI API of your choice (OpenAI, Anthropic, Together, Cohere, OpenRouter etc.)
2. **Message Persistence**:
   1. All messages in each chat session should be saved to the database
   2. Implement proper message threading and timestamps
   3. Handle both user and AI messages
3. **Chat History**:
   1. Users can start new chat sessions
   2. Each session should have a clear topic or name.
   3. Users can view their past chat sessions
   4. Display chat history with proper pagination
   5. Allow users to continue previous conversations

## **Step 4: Advanced Features (Bonus Points)**

Implement any of the following features for additional points:

1. **Authentication System**:
   1. User registration and login
   2. You can use any common auth package like nextAuth or Better Auth if you understand the concepts thoroughly.
   3. Protected routes
   4. Use any JavaScript/TypeScript authentication package
2. **Enhanced UI/UX**:
   1. Real-time typing indicators
   2. Message status indicators (sent, delivered, etc.)
   3. Dark/light theme toggle
   4. Proper loading states and error handling

## **Step 5: Deployment and Testing**

1. **Vercel Deployment**:
   1. Deploy your application to Vercel
   2. Ensure all environment variables are properly configured
   3. Test the deployed version thoroughly
2. **Database Setup**:
   1. Set up your production database on neon, supabase or any other free Database provider.
   2. Ensure database connectivity from your deployed app
3. **Testing**:
   1. Test all chat functionality
   2. Verify data persistence across sessions
   3. Test responsive design on different devices

## **Step 6: Code Quality and Documentation**

1. **Code Quality**:
   1. Follow TypeScript best practices
   2. Implement proper error handling
   3. Use consistent code formatting
   4. Add meaningful comments where necessary
2. **README Documentation**:
   1. Create a comprehensive README.md file
   2. Include setup instructions
   3. Add screenshots or demo videos

## **Step 7: Using AI Tools and Submission Preparation**

**AI-Powered Development (Highly Encouraged)**:

We strongly encourage and expect you to leverage AI tools throughout your development process. Think of it this way: **AI is writing the code for you, but it is still YOUR code** - which means you must understand each and every line in the repository you submit.

**Recommended AI Tools**:

- **AI IDEs**: Cursor, Windsurf, or any AI-powered code editor of your choice
- **UI Generation Tools**: Lovable, v0.dev, or similar tools for rapid UI development
- **Code Assistants**: GitHub Copilot, Codeium, or any other coding assistant
- **Any other AI tool**: Feel free to use any AI tool that helps you be more productive

**Important Guidelines**:

- Use AI to accelerate your development, but ensure you can explain every implementation decision
- Understand the architecture and design patterns used in your codebase
- Be prepared to discuss your AI tool usage and code understanding in the follow-up interview
- Document any interesting AI-assisted solutions or approaches you used

# **Scoring Criteria (100 points)**

- **Application Functionality (25 points)**: Working chat application with AI integration and proper conversation flow
- **Technical Implementation (25 points)**: Proper use of Next.js, tRPC, TanStack Query, and TypeScript
- **Database Design (15 points)**: Well-designed schema with proper relationships and data persistence
- **Code Quality (15 points)**: Clean, readable, and well-structured code following best practices
- **Documentation (10 points)**: Clear README and one-page technical document
- **Deployment (10 points)**: Successfully deployed and functional application on Vercel

**Bonus Points**:

- Authentication implementation (+5 points)
- Use of Drizzle or Prisma ORM (+3 points)
- Advanced UI/UX features (+3 points)
- Performance optimizations (+4 points)

# **How to Submit**

1. Complete all steps
2. Prepare your submission:
   1. Public GitHub repository URL
   2. Live Vercel deployment URL
3. **Submit via the provided form:** [Assignment Submission Form](https://app.nocodb.com/p/oration-assignment)
4. Submission deadline: Please submit the assignment within one week from the date you receive the assignment.

# **Next Steps**

The next step will be an interview round where we’ll discuss the assignment and your projects. We will go through the codebase and try to understand the depth of knowledge and the understanding of the core concepts used in the projects and assignment.

There will only be one interview round after you send the assignment before we take the decision.

# **Submission Checklist:**

✅ Next.js application created with TypeScript

✅ Public GitHub repository with clean commit history

✅ Working chat functionality with AI integration

✅ Database integration with proper schema

✅ tRPC and TanStack Query implementation

✅ Chat history and session management

✅ Vercel deployment completed

✅ README.md with setup instructions

Make sure to test your deployed application thoroughly before submitting!

# **Frequently Asked Questions (FAQs)**

### **Q: Can I use AI tools and AI code editors to assist me with development?**

A: Absolutely! We encourage you to use AI tools like Cursor, Windsurf, Crae, Lovable, v0, or any other AI-powered development tools. Just make sure you understand and can explain every line of code you submit.

### **Q: Which database should I choose?**

A: You can use any database of your choice. Popular options include PostgreSQL (via Supabase or Neon), SQLite (for simplicity). Choose based on your familiarity and project requirements.

### **Q: What AI API should I use for the career counselling feature?**

A: You can use any AI API such as OpenAI GPT, Anthropic Claude, or others. Make sure to handle API keys securely and implement proper error handling.

### **Q: Do I need to implement real-time chat features?**

A: Real-time features are not required but are considered bonus points. Focus on core functionality first, then add real-time features if time permits.

### **Q: How complex should the career counselling AI be?**

A: Focus on creating a functional chatbot that can provide meaningful career advice. It doesn't need to be extremely sophisticated, but should demonstrate proper AI integration and conversation handling.

### **Q: Can I use UI component libraries?**

A: Yes! You can use any UI component library like Shadcn/ui, Chakra UI, Mantine, or others. This can help you focus on functionality rather than basic styling.

### **Q: What if my application has bugs or doesn't work perfectly?**

A: Document any known issues and include how you would fix them given more time. We value your problem-solving approach and understanding of the code over perfect functionality.

### **Q: Should I implement user authentication?**

A: Authentication is not required but gives you bonus points. If you choose not to implement it, you can use a simple session-based approach to maintain chat history.

### **Q: How should I handle sensitive information like API keys?**

A: Use environment variables for all sensitive information. Never commit API keys to your repository. Document the required environment variables in your README.

Good luck! This assignment is your opportunity to showcase your full-stack development skills, understanding of modern web technologies, and ability to integrate AI into web applications. We're excited to see what you create!

Contact: If you have any questions about this assignment, please reach out to [careers@oration.ai](mailto:careers@oration.ai).
