import { connection } from 'next/server';
import { createForm, listForms } from '@/lib/server/forms';
import { assertSameOrigin, handle, json, rateLimit, readJsonObject } from '@/lib/server/http';
import { getStore } from '@/lib/server/store';

export function GET() {
  return handle(async () => {
    await connection();
    const store = await getStore();
    const storage = store.recoveredFrom ? { recoveredFrom: store.recoveredFrom } : undefined;
    return json({ forms: listForms(store), storage });
  });
}

export function POST(request: Request) {
  return handle(async () => {
    assertSameOrigin(request);
    rateLimit(request, 'create-form', 60, 600);
    const body = await readJsonObject(request);
    const form = await createForm(await getStore(), body);
    return json({ form }, 201);
  });
}
