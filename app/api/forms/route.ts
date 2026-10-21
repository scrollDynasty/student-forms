import { connection } from 'next/server';
import { createForm, listForms } from '@/lib/server/forms';
import { assertSameOrigin, handle, json, readJsonObject } from '@/lib/server/http';
import { getStore } from '@/lib/server/store';

export function GET() {
  return handle(async () => {
    await connection();
    return json({ forms: listForms(await getStore()) });
  });
}

export function POST(request: Request) {
  return handle(async () => {
    assertSameOrigin(request);
    const body = await readJsonObject(request);
    const form = await createForm(await getStore(), body);
    return json({ form }, 201);
  });
}
