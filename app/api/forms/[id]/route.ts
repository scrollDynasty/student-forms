import { connection } from 'next/server';
import { countResponses, deleteForm, getForm, updateForm } from '@/lib/server/forms';
import { assertSameOrigin, handle, json, noContent, readJsonObject } from '@/lib/server/http';
import { getStore } from '@/lib/server/store';

type Ctx = RouteContext<'/api/forms/[id]'>;

export function GET(_request: Request, ctx: Ctx) {
  return handle(async () => {
    await connection();
    const { id } = await ctx.params;
    const store = await getStore();
    return json({ form: getForm(store, id), responseCount: countResponses(store, id) });
  });
}

export function PUT(request: Request, ctx: Ctx) {
  return handle(async () => {
    assertSameOrigin(request);
    const { id } = await ctx.params;
    const store = await getStore();
    getForm(store, id); // 404 before body validation
    const form = await updateForm(store, id, await readJsonObject(request));
    return json({ form });
  });
}

export function DELETE(request: Request, ctx: Ctx) {
  return handle(async () => {
    assertSameOrigin(request);
    const { id } = await ctx.params;
    await deleteForm(await getStore(), id);
    return noContent();
  });
}
