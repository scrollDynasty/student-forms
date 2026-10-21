import type { Metadata } from 'next';
import { Suspense } from 'react';
import { PublicFormView } from '@/components/form/PublicFormView';

export const metadata: Metadata = {
  title: 'Форма отклика',
  robots: { index: false },
};

function Fallback() {
  return (
    <div className="mx-auto w-full max-w-[680px] flex-1 px-4 pb-[72px] pt-7 sm:px-5 sm:pt-12">
      <p role="status" className="sr-only">
        Загрузка…
      </p>
      <div className="h-96 animate-pulse rounded-[36px] bg-neutral-200 motion-reduce:animate-none" aria-hidden="true" />
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
