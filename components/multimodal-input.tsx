'use client';

import type { UIMessage } from 'ai';
import {
  useRef,
  useEffect,
  useState,
  useCallback,
  type Dispatch,
  type SetStateAction,
  type ChangeEvent,
  memo,
} from 'react';
import { toast } from 'sonner';
import { useLocalStorage, useWindowSize } from 'usehooks-ts';
import { api } from '@/lib/trpc';

import { ArrowUpIcon, PaperclipIcon, StopIcon } from './icons';
import { PreviewAttachment } from './preview-attachment';
import { Button } from './ui/button';
import { SuggestedActions } from './suggested-actions';
import {
  PromptInput,
  PromptInputTextarea,
  PromptInputToolbar,
  PromptInputTools,
  PromptInputSubmit,
  PromptInputModelSelect,
  PromptInputModelSelectTrigger,
  PromptInputModelSelectContent,
} from './elements/prompt-input';
import { SelectItem, SelectValue } from '@/components/ui/select';
import equal from 'fast-deep-equal';
import type { UseChatHelpers } from '@ai-sdk/react';
import { AnimatePresence, motion } from 'framer-motion';
import { ArrowDown, Mic, Square } from 'lucide-react';
import { useScrollToBottom } from '@/hooks/use-scroll-to-bottom';
import type { VisibilityType } from './visibility-selector';
import type { Attachment, ChatMessage } from '@/lib/types';
import { chatModels } from '@/lib/ai/models';
import { saveChatModelAsCookie } from '@/app/(chat)/actions';
import { startTransition } from 'react';
import { useWhisperRecording } from '@/hooks/use-whisper-recording';

// Helper function to convert file to base64
const fileToBase64 = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => {
      const result = reader.result as string;
      // Remove the data:image/jpeg;base64, prefix
      const base64 = result.split(',')[1];
      resolve(base64);
    };
    reader.onerror = (error) => reject(error);
  });
};

function PureMultimodalInput({
  chatId,
  input,
  setInput,
  status,
  stop,
  attachments,
  setAttachments,
  messages,
  setMessages,
  sendMessage,
  className,
  selectedVisibilityType,
  selectedModelId,
}: {
  chatId: string;
  input: string;
  setInput: Dispatch<SetStateAction<string>>;
  status: UseChatHelpers<ChatMessage>['status'];
  stop: () => void;
  attachments: Array<Attachment>;
  setAttachments: Dispatch<SetStateAction<Array<Attachment>>>;
  messages: Array<UIMessage>;
  setMessages: UseChatHelpers<ChatMessage>['setMessages'];
  sendMessage: UseChatHelpers<ChatMessage>['sendMessage'];
  className?: string;
  selectedVisibilityType: VisibilityType;
  selectedModelId: string;
}) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const { width } = useWindowSize();
  const baseInputRef = useRef('');

  useEffect(() => {
    if (textareaRef.current) {
      adjustHeight();
    }
  }, []);

  const adjustHeight = () => {
    if (textareaRef.current) {
      textareaRef.current.style.height = '72px';
    }
  };

  const resetHeight = () => {
    if (textareaRef.current) {
      textareaRef.current.style.height = '72px';
    }
  };

  const [localStorageInput, setLocalStorageInput] = useLocalStorage(
    'input',
    '',
  );

  useEffect(() => {
    if (textareaRef.current) {
      const domValue = textareaRef.current.value;
      // Prefer DOM value over localStorage to handle hydration
      const finalValue = domValue || localStorageInput || '';
      setInput(finalValue);
      adjustHeight();
    }
    // Only run once after hydration
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    setLocalStorageInput(input);
  }, [input, setLocalStorageInput]);

  const handleInput = (event: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(event.target.value);
  };

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadQueue, setUploadQueue] = useState<Array<string>>([]);
  
  // tRPC file upload mutation
  const uploadFileMutation = api.upload.uploadFile.useMutation({
    onError: (error) => {
      toast.error(error.message || 'Failed to upload file');
    },
  });

  const submitForm = useCallback(() => {
    window.history.replaceState({}, '', `/chat/${chatId}`);

    sendMessage({
      role: 'user',
      parts: [
        ...attachments.map((attachment) => ({
          type: 'file' as const,
          url: attachment.url,
          name: attachment.name,
          mediaType: attachment.contentType,
        })),
        {
          type: 'text',
          text: input,
        },
      ],
    });

    setAttachments([]);
    setLocalStorageInput('');
    resetHeight();
    setInput('');

    if (width && width > 768) {
      textareaRef.current?.focus();
    }
  }, [
    input,
    setInput,
    attachments,
    sendMessage,
    setAttachments,
    setLocalStorageInput,
    width,
    chatId,
  ]);

  const uploadFile = async (file: File) => {
    // Validate file type - support images, PDFs, and Word documents
    const allowedTypes = [
      'image/jpeg', 
      'image/png', 
      'image/gif', 
      'image/bmp', 
      'image/webp',
      'application/pdf',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document', // DOCX
      'application/msword' // DOC (legacy)
    ];
    
    if (!allowedTypes.includes(file.type)) {
      throw new Error('Only images (JPEG, PNG, GIF, BMP, WebP), PDF, and Word documents are supported');
    }

    // Validate file size (10MB limit for documents)
    if (file.size > 10 * 1024 * 1024) {
      throw new Error('File size must be less than 10MB');
    }

    try {
      // Convert file to base64
      const base64Data = await fileToBase64(file);
      
      // Upload using tRPC mutation
      const result = await uploadFileMutation.mutateAsync({
        filename: file.name,
        contentType: file.type as 'image/jpeg' | 'image/png' | 'image/gif' | 'image/bmp' | 'image/webp' | 'application/pdf' | 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' | 'application/msword',
        size: file.size,
        data: base64Data,
      });

      return {
        url: result.url,
        name: result.pathname,
        contentType: file.type,
      };
    } catch (error) {
      console.error('Upload error:', error);
      throw error;
    }
  };

  const handleFileChange = useCallback(
    async (event: ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(event.target.files || []);

      setUploadQueue(files.map((file) => file.name));

      try {
        const uploadResults = await Promise.allSettled(
          files.map(async (file) => {
            try {
              return await uploadFile(file);
            } catch (error) {
              toast.error(`Failed to upload ${file.name}: ${error instanceof Error ? error.message : 'Unknown error'}`);
              return null;
            }
          })
        );

        const successfulUploads = uploadResults
          .map((result) => result.status === 'fulfilled' ? result.value : null)
          .filter((attachment): attachment is NonNullable<typeof attachment> => attachment !== null);

        setAttachments((currentAttachments) => [
          ...currentAttachments,
          ...successfulUploads,
        ]);

        // Show success message for successful uploads
        if (successfulUploads.length > 0) {
          toast.success(`Successfully uploaded ${successfulUploads.length} file(s)`);
        }
      } catch (error) {
        console.error('Error in file upload handler:', error);
        toast.error('An unexpected error occurred while uploading files');
      } finally {
        setUploadQueue([]);
      }
    },
    [setAttachments, uploadFile],
  );

  const { isAtBottom, scrollToBottom } = useScrollToBottom();

  // Whisper recording integration
  const { isSupported, isRecording, isProcessing, toggleRecording } = useWhisperRecording({
    onTranscript: (transcribedText) => {
      // Add transcribed text to existing input
      const currentInput = input.trim();
      const newInput = currentInput 
        ? `${currentInput} ${transcribedText}` 
        : transcribedText;
      setInput(newInput);
      
      // Resize textarea as text grows
      if (textareaRef.current) {
        textareaRef.current.style.height = 'auto';
        textareaRef.current.style.height = `${Math.min(200, Math.max(72, textareaRef.current.scrollHeight))}px`;
      }
    },
    onError: (error) => {
      console.error('Whisper recording error:', error);
      toast.error(error);
    },
  });

  useEffect(() => {
    if (status === 'submitted') {
      scrollToBottom();
    }
  }, [status, scrollToBottom]);

  return (
    <div className="flex relative flex-col gap-4 w-full">
      <AnimatePresence>
        {!isAtBottom && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 10 }}
            transition={{ type: 'spring', stiffness: 300, damping: 20 }}
            className="absolute bottom-28 left-1/2 z-50 -translate-x-1/2"
          >
            <Button
              data-testid="scroll-to-bottom-button"
              className="rounded-full"
              size="icon"
              variant="outline"
              onClick={(event) => {
                event.preventDefault();
                scrollToBottom();
              }}
            >
              <ArrowDown />
            </Button>
          </motion.div>
        )}
      </AnimatePresence>

      {messages.length === 0 &&
        attachments.length === 0 &&
        uploadQueue.length === 0 && (
          <SuggestedActions
            sendMessage={sendMessage}
            chatId={chatId}
            selectedVisibilityType={selectedVisibilityType}
          />
        )}

      <input
        type="file"
        className="fixed -top-4 -left-4 size-0.5 opacity-0 pointer-events-none"
        accept="image/*,application/pdf,.doc,.docx,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        ref={fileInputRef}
        multiple
        onChange={handleFileChange}
        tabIndex={-1}
      />

      <PromptInput
        className="bg-gray-50 rounded-3xl border border-gray-300 shadow-none transition-all duration-200 dark:bg-sidebar dark:border-sidebar-border hover:ring-1 hover:ring-primary/30 focus-within:ring-1 focus-within:ring-primary/50"
        onSubmit={(event) => {
          event.preventDefault();
          if (status !== 'ready') {
            toast.error('Please wait for the model to finish its response!');
          } else if (isProcessing) {
            toast.error('Please wait for audio processing to complete!');
          } else {
            // If recording, stop before submitting
            if (isRecording) {
              toggleRecording();
              return; // Don't submit immediately, wait for processing
            }
            submitForm();
          }
        }}
      >
        {(attachments.length > 0 || uploadQueue.length > 0) && (
          <div
            data-testid="attachments-preview"
            className="flex overflow-x-scroll flex-row gap-2 items-end px-3 py-2"
          >
            {attachments.map((attachment) => (
              <PreviewAttachment
                key={attachment.url}
                attachment={attachment}
                onRemove={() => {
                  setAttachments((currentAttachments) =>
                    currentAttachments.filter((a) => a.url !== attachment.url),
                  );
                  if (fileInputRef.current) {
                    fileInputRef.current.value = '';
                  }
                }}
              />
            ))}

            {uploadQueue.map((filename) => (
              <PreviewAttachment
                key={filename}
                attachment={{
                  url: '',
                  name: filename,
                  contentType: '',
                }}
                isUploading={true}
              />
            ))}
          </div>
        )}

        <PromptInputTextarea
          data-testid="multimodal-input"
          ref={textareaRef}
          placeholder={
            isRecording ? 'Recording… speak now' : 
            isProcessing ? 'Processing audio...' : 
            'Send a message...'
          }
          value={input}
          onChange={handleInput}
          minHeight={72}
          maxHeight={200}
          disableAutoResize={true}
          className="text-base resize-none py-4 px-4 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none] bg-transparent !border-0 !border-none outline-none ring-0 focus-visible:ring-0 focus-visible:ring-offset-0 focus-visible:outline-none"
          rows={1}
          autoFocus
        />
        <PromptInputToolbar className="px-4 py-2 !border-t-0 !border-top-0 shadow-none dark:!border-transparent dark:border-0">
          <PromptInputTools className="gap-2 items-center">
            <AttachmentsButton fileInputRef={fileInputRef} status={status} />
            <ModelSelectorCompact selectedModelId={selectedModelId} />

            {/* Microphone button - Whisper recording */}
            <Button
              type="button"
              data-testid="mic-button"
              onClick={(e) => {
                e.preventDefault();
                if (!isSupported) {
                  toast.error('Audio recording not supported in this browser');
                  return;
                }
                toggleRecording();
              }}
              variant="ghost"
              disabled={status !== 'ready' || isProcessing}
              className={`${
                isRecording 
                  ? 'bg-red-100 text-red-700 hover:bg-red-200 dark:bg-red-900/30 dark:text-red-300' 
                  : isProcessing 
                  ? 'bg-yellow-100 text-yellow-700 hover:bg-yellow-200 dark:bg-yellow-900/30 dark:text-yellow-300'
                  : ''
              } rounded-md p-[7px] h-fit`}
              aria-pressed={isRecording}
              aria-label={
                isRecording ? 'Stop recording' : 
                isProcessing ? 'Processing audio...' : 
                'Start voice input'
              }
              title={
                isRecording ? 'Stop recording' : 
                isProcessing ? 'Processing audio...' : 
                'Start voice input'
              }
            >
              {isRecording ? <Square size={14} /> : <Mic size={14} />}
            </Button>

            {(isRecording || isProcessing) && (
              <div className="flex items-center gap-2 text-xs select-none" aria-live="polite">
                {isRecording && (
                  <>
                    <span className="inline-flex items-center text-red-600 dark:text-red-400">
                      <span className="mr-2 inline-block size-2 rounded-full bg-red-500 animate-pulse" />
                      Recording…
                    </span>
                    <div className="ml-1 flex items-end gap-[3px] h-4">
                      <span className="w-1 bg-red-500 rounded-sm animate-bounce" style={{ height: '8px', animationDelay: '0ms' }} />
                      <span className="w-1 bg-red-500 rounded-sm animate-bounce" style={{ height: '12px', animationDelay: '100ms' }} />
                      <span className="w-1 bg-red-500 rounded-sm animate-bounce" style={{ height: '16px', animationDelay: '200ms' }} />
                      <span className="w-1 bg-red-500 rounded-sm animate-bounce" style={{ height: '12px', animationDelay: '300ms' }} />
                      <span className="w-1 bg-red-500 rounded-sm animate-bounce" style={{ height: '8px', animationDelay: '400ms' }} />
                    </div>
                  </>
                )}
                {isProcessing && (
                  <span className="inline-flex items-center text-yellow-600 dark:text-yellow-400">
                    <span className="mr-2 inline-block size-2 rounded-full bg-yellow-500 animate-pulse" />
                    Processing audio...
                  </span>
                )}
              </div>
            )}
          </PromptInputTools>

          {status === 'submitted' ? (
            <StopButton stop={stop} setMessages={setMessages} />
          ) : isRecording ? (
            // While recording, replace send with a stop-recording control
            <Button
              data-testid="stop-recording-button"
              onClick={(e) => {
                e.preventDefault();
                toggleRecording();
              }}
              className="p-3 text-red-700 bg-red-100 rounded-full hover:bg-red-200 dark:bg-red-900/30 dark:hover:bg-red-900/40 dark:text-red-300"
            >
              <Square size={20} />
            </Button>
          ) : (
            <PromptInputSubmit
              status={status}
              disabled={!input.trim() || uploadQueue.length > 0 || isProcessing}
              className="p-3 text-gray-700 bg-gray-200 rounded-full hover:bg-gray-300 dark:bg-sidebar-accent dark:hover:bg-sidebar-accent/80 dark:text-gray-300"
            >
              <ArrowUpIcon size={20} />
            </PromptInputSubmit>
          )}
        </PromptInputToolbar>
      </PromptInput>
    </div>
  );
}

export const MultimodalInput = memo(
  PureMultimodalInput,
  (prevProps, nextProps) => {
    if (prevProps.input !== nextProps.input) return false;
    if (prevProps.status !== nextProps.status) return false;
    if (!equal(prevProps.attachments, nextProps.attachments)) return false;
    if (prevProps.selectedVisibilityType !== nextProps.selectedVisibilityType)
      return false;
    if (prevProps.selectedModelId !== nextProps.selectedModelId) return false;

    return true;
  },
);

function PureAttachmentsButton({
  fileInputRef,
  status,
}: {
  fileInputRef: React.MutableRefObject<HTMLInputElement | null>;
  status: UseChatHelpers<ChatMessage>['status'];
}) {
  return (
    <Button
      data-testid="attachments-button"
      className="rounded-md rounded-bl-lg p-[7px] h-fit dark:border-zinc-700 hover:dark:bg-zinc-900 hover:bg-zinc-200"
      onClick={(event) => {
        event.preventDefault();
        fileInputRef.current?.click();
      }}
      disabled={status !== 'ready'}
      variant="ghost"
    >
      <PaperclipIcon size={14} />
    </Button>
  );
}

const AttachmentsButton = memo(PureAttachmentsButton);

function PureModelSelectorCompact({
  selectedModelId,
}: {
  selectedModelId: string;
}) {
  const [optimisticModelId, setOptimisticModelId] = useState(selectedModelId);

  const selectedModel = chatModels.find(
    (model) => model.id === optimisticModelId,
  );

  return (
    <PromptInputModelSelect
      value={selectedModel?.name}
      onValueChange={(modelName) => {
        const model = chatModels.find((m) => m.name === modelName);
        if (model) {
          setOptimisticModelId(model.id);
          startTransition(() => {
            saveChatModelAsCookie(model.id);
          });
        }
      }}
    >
      <PromptInputModelSelectTrigger
        type="button"
        className="text-xs focus:outline-none focus:ring-0 focus:ring-offset-0 focus-visible:ring-0 focus-visible:ring-offset-0 data-[state=open]:ring-0 data-[state=closed]:ring-0"
      >
        {selectedModel?.name || 'Select model'}
      </PromptInputModelSelectTrigger>
      <PromptInputModelSelectContent>
        {chatModels.map((model) => (
          <SelectItem key={model.id} value={model.name}>
            <div className="flex flex-col gap-1 items-start py-1">
              <div className="font-medium">{model.name}</div>
              <div className="text-xs text-muted-foreground">
                {model.description}
              </div>
            </div>
          </SelectItem>
        ))}
      </PromptInputModelSelectContent>
    </PromptInputModelSelect>
  );
}

const ModelSelectorCompact = memo(PureModelSelectorCompact);

function PureStopButton({
  stop,
  setMessages,
}: {
  stop: () => void;
  setMessages: UseChatHelpers<ChatMessage>['setMessages'];
}) {
  return (
    <Button
      data-testid="stop-button"
      className="rounded-full p-1.5 h-fit border dark:border-zinc-600"
      onClick={(event) => {
        event.preventDefault();
        stop();
        setMessages((messages) => messages);
      }}
    >
      <StopIcon size={14} />
    </Button>
  );
}

const StopButton = memo(PureStopButton);

function PureSendButton({
  submitForm,
  input,
  uploadQueue,
}: {
  submitForm: () => void;
  input: string;
  uploadQueue: Array<string>;
}) {
  return (
    <Button
      data-testid="send-button"
      className="rounded-full p-1.5 h-fit border dark:border-zinc-600"
      onClick={(event) => {
        event.preventDefault();
        submitForm();
      }}
      disabled={input.length === 0 || uploadQueue.length > 0}
    >
      <ArrowUpIcon size={14} />
    </Button>
  );
}

const SendButton = memo(PureSendButton, (prevProps, nextProps) => {
  if (prevProps.uploadQueue.length !== nextProps.uploadQueue.length)
    return false;
  if (prevProps.input !== nextProps.input) return false;
  return true;
});
