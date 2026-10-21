import type { Metadata } from 'next';
import { Suspense } from 'react';
import { PublicFormView } from '@/components/form/PublicFormView';

export const metadata: Metadata = {
  title: 'Форма отклика',
  robots: { index: false },
};

function Fallback() {
  return (
    <div className="min-h-dvh bg-gradient-to-b from-indigo-50/80 via-background to-background">
      <div className="mx-auto w-full max-w-2xl px-4 py-6 sm:py-12">
        <div className="h-96 animate-pulse rounded-2xl border border-slate-200 bg-white motion-reduce:animate-none" aria-hidden="true" />
      </div>
    </div>
  );
}

async function Loader({ params }: { params: PageProps<'/f/[publicId]'>['params'] }) {
  const { publicId } = await params;
  return <PublicFormView publicId={publicId} />;
}

export default function PublicFormPage({ params }: PageProps<'/f/[publicId]'>) {
  return (
    <Suspense fallback={<Fallback />}>
      <Loader params={params} />
    </Suspense>
  );
}
