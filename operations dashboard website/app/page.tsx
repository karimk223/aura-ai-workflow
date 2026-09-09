import { redirect } from 'next/navigation';
import { chatGPTSignInPath, getChatGPTUser } from './chatgpt-auth';
import OperationsDashboard from './operations-dashboard';

export const dynamic = 'force-dynamic';

export default async function Home() {
  const user = await getChatGPTUser();

  if (!user && process.env.NODE_ENV === 'production') {
    redirect(chatGPTSignInPath('/'));
  }

  return (
    <OperationsDashboard
      operatorName={user?.displayName ?? 'Dashboard preview'}
      previewMode={!user}
    />
  );
}
