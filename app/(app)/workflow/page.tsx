// Workflow feature removed — redirect to dashboard.
import { redirect } from 'next/navigation';
export default function WorkflowRemoved() {
  redirect('/dashboard');
}
