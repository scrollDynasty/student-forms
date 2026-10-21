import type { Metadata } from 'next';
import { Suspense } from 'react';
import { EditorSkeleton, FormEditor } from '@/components/admin/editor/FormEditor';

export const metadata: Metadata = { title: 'Редактор формы' };

async function Loader({ params }: { params: PageProps<'/admin/forms/[id]'>['params'] }) {
  const { id } = await params;
  return <FormEditor formId={id} />;
}

export default function FormEditorPage({ params }: PageProps<'/admin/forms/[id]'>) {
  return (
    <Suspense fallback={<EditorSkeleton />}>
      <Loader params={params} />
    </Suspense>
  );
}
