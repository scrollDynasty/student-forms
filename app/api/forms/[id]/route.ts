import { connection } from 'next/server';
import { deleteForm, getForm, updateForm } from '@/lib/server/forms';
import { handle, json, noContent, readJsonObject } from '@/lib/server/http';
import { getStore } from '@/lib/server/store';

type Ctx = RouteContext<'/api/forms/[id]'>;

export function GET(_request: Request, ctx: Ctx) {
  return handle(async () => {
    await connection();
    const { id } = await ctx.params;
    return json({ form: getForm(await getStore(), id) });
  });
}

export function PUT(request: Request, ctx: Ctx) {
  return handle(async () => {
    const { id } = await ctx.params;
    const store = await getStore();
    getForm(store, id); // 404 before body validation
    const form = await updateForm(store, id, await readJsonObject(request));
    return json({ form });
  });
}

export function DELETE(_request: Request, ctx: Ctx) {
  return handle(async () => {
    const { id } = await ctx.params;
    await deleteForm(await getStore(), id);
    return noContent();
  });
}
