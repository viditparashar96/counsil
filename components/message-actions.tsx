import { useCopyToClipboard } from 'usehooks-ts';

import type { Vote } from '@/lib/db/schema';

import { CopyIcon, ThumbDownIcon, ThumbUpIcon } from './icons';
import { Actions, Action } from './elements/actions';
import { memo } from 'react';
import equal from 'fast-deep-equal';
import { toast } from 'sonner';
import type { ChatMessage } from '@/lib/types';
import { api } from '@/lib/trpc';

export function PureMessageActions({
  chatId,
  message,
  vote,
  isLoading,
}: {
  chatId: string;
  message: ChatMessage;
  vote: Vote | undefined;
  isLoading: boolean;
}) {
  const utils = api.useUtils();
  const [_, copyToClipboard] = useCopyToClipboard();

  // Vote mutation with optimistic updates
  const voteMutation = api.vote.voteMessage.useMutation({
    onMutate: async (variables) => {
      // Cancel any outgoing refetches
      await utils.vote.getVotes.cancel({ chatId });
      
      // Snapshot the previous value
      const previousVotes = utils.vote.getVotes.getData({ chatId });
      
      // Optimistically update the vote
      utils.vote.getVotes.setData(
        { chatId },
        (oldVotes) => {
          if (!oldVotes) return [];
          
          // Remove any existing vote for this message
          const votesWithoutCurrent = oldVotes.filter(
            (v) => v.messageId !== variables.messageId
          );
          
          // Add the new vote
          return [
            ...votesWithoutCurrent,
            {
              chatId: variables.chatId,
              messageId: variables.messageId,
              isUpvoted: variables.type === 'up',
            } as Vote,
          ];
        }
      );
      
      return { previousVotes };
    },
    onError: (error, variables, context) => {
      // Revert the optimistic update on error
      if (context?.previousVotes) {
        utils.vote.getVotes.setData({ chatId }, context.previousVotes);
      }
      toast.error(`Failed to ${variables.type}vote response`);
    },
    onSuccess: (_, variables) => {
      toast.success(`${variables.type === 'up' ? 'Upvoted' : 'Downvoted'} response!`);
    },
  });

  if (isLoading) return null;
  if (message.role === 'user') return null;

  return (
    <Actions>
        <Action
          tooltip="Copy"
          onClick={async () => {
            const textFromParts = message.parts
              ?.filter((part) => part.type === 'text')
              .map((part) => part.text)
              .join('\n')
              .trim();

            if (!textFromParts) {
              toast.error("There's no text to copy!");
              return;
            }

            await copyToClipboard(textFromParts);
            toast.success('Copied to clipboard!');
          }}
        >
          <CopyIcon />
        </Action>

        <Action
          tooltip="Upvote Response"
          data-testid="message-upvote"
          disabled={vote?.isUpvoted || voteMutation.isPending}
          onClick={() => {
            voteMutation.mutate({
              chatId,
              messageId: message.id,
              type: 'up',
            });
          }}
        >
          <ThumbUpIcon />
        </Action>

        <Action
          tooltip="Downvote Response"
          data-testid="message-downvote"
          disabled={(vote && !vote.isUpvoted) || voteMutation.isPending}
          onClick={() => {
            voteMutation.mutate({
              chatId,
              messageId: message.id,
              type: 'down',
            });
          }}
        >
          <ThumbDownIcon />
        </Action>
    </Actions>
  );
}

export const MessageActions = memo(
  PureMessageActions,
  (prevProps, nextProps) => {
    if (!equal(prevProps.vote, nextProps.vote)) return false;
    if (prevProps.isLoading !== nextProps.isLoading) return false;

    return true;
  },
);
