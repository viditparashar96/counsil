import {
  artifactModel,
  chatModel,
  reasoningModel,
  titleModel,
} from './models.test';
import { isTestEnvironment } from '../constants';

// Import the new OpenAI Agent SDK provider
import { myProvider as openaiAgentsProvider } from './providers-openai-agents';

export const myProvider = isTestEnvironment
  ? {
      languageModel: (modelId: string) => {
        const testModels = {
          'chat-model': chatModel,
          'chat-model-reasoning': reasoningModel,
          'title-model': titleModel,
          'artifact-model': artifactModel,
        };
        return testModels[modelId as keyof typeof testModels] || chatModel;
      }
    }
  : openaiAgentsProvider;
