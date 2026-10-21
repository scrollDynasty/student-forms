import type { Metadata } from 'next';
import { FormsList } from '@/components/admin/FormsList';

export const metadata: Metadata = { title: { absolute: 'Мои формы · Формы откликов' } };

export default function AdminPage() {
  return <FormsList />;
}
