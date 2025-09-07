import { redirect } from 'next/navigation';
import { auth } from '@/app/(auth)/auth';
import { ChatPageClient } from '@/components/chat-page-client';

export default async function Page(props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const { id } = params;

  // Only check authentication server-side
  const session = await auth();

  if (!session) {
    redirect('/api/auth/guest');
  }

  // All data fetching is now handled client-side with tRPC
  return <ChatPageClient id={id} session={session} />;
}