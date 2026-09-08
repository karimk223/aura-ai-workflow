import { redirect } from 'next/navigation';
import { chatGPTSignInPath, getChatGPTUser } from './chatgpt-auth';
import ReviewDashboard from './review-dashboard';

export const dynamic = 'force-dynamic';

export default async function Home() {
  const user = await getChatGPTUser();

  if (!user && process.env.NODE_ENV === 'production') {
    redirect(chatGPTSignInPath('/'));
  }

  return (
    <ReviewDashboard
      reviewerName={user?.displayName ?? 'Creator preview'}
      previewMode={!user}
    />
  );
}
