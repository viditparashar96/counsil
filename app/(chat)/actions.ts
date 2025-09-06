'use server';

import { Agent, run, setDefaultOpenAIClient } from '@openai/agents';
import OpenAI from 'openai';
import { cookies } from 'next/headers';
import {
  deleteMessagesByChatIdAfterTimestamp,
  getMessageById,
  updateChatVisiblityById,
} from '@/lib/db/queries';
import type { VisibilityType } from '@/components/visibility-selector';

// Create OpenAI client for title generation
const openaiClient = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

interface UIMessage {
  role: string;
  content: string;
  parts?: Array<{ type: string; text: string; }>;
}

export async function saveChatModelAsCookie(model: string) {
  const cookieStore = await cookies();
  cookieStore.set('chat-model', model);
}

export async function generateTitleFromUserMessage({
  message,
}: {
  message: UIMessage;
}) {
  // Set the default OpenAI client for the SDK
  setDefaultOpenAIClient(openaiClient);

  // Create a title generation agent using OpenAI Agent SDK
  const titleAgent = new Agent({
    name: 'Title Generator',
    instructions: `You will generate a short title based on the first message a user begins a conversation with:
    - Ensure it is not more than 80 characters long
    - The title should be a summary of the user's message
    - Do not use quotes or colons
    - Return only the title, nothing else`,
    model: 'gpt-4o-mini',
  });

  try {
    // Extract message content
    const messageContent = message.parts 
      ? message.parts.map(part => part.text).join(' ')
      : message.content || '';

    // Run the agent to generate title
    const result = await run(titleAgent, `Generate a title for this message: ${messageContent}`, {
      stream: false,
    });

    const title = result.finalOutput?.trim() || 'New Conversation';
    
    // Ensure title is under 80 characters
    return title.length > 80 ? `${title.substring(0, 77)}...` : title;
  } catch (error) {
    console.error('Title generation error:', error);
    return 'New Conversation';
  }
}

export async function deleteTrailingMessages({ id }: { id: string }) {
  const [message] = await getMessageById({ id });

  await deleteMessagesByChatIdAfterTimestamp({
    chatId: message.chatId,
    timestamp: message.createdAt,
  });
}

export async function updateChatVisibility({
  chatId,
  visibility,
}: {
  chatId: string;
  visibility: VisibilityType;
}) {
  await updateChatVisiblityById({ chatId, visibility });
}