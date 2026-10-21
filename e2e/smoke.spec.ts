import { expect, test, type APIRequestContext } from '@playwright/test';

// The key scenario and the behaviours only a real browser can show. Every test makes its own form.

async function publishedForm(request: APIRequestContext, fields: unknown[]) {
  const created = await request.post('/api/forms', { data: { title: `E2E ${Date.now()}`, fields } });
  expect(created.status()).toBe(201);
  const { form } = await created.json();
  expect((await request.post(`/api/forms/${form.id}/publish`)).status()).toBe(200);
  return form as { id: string; publicId: string };
}

test('a manager publishes a form, a student answers it, the manager sees the answer', async ({ page }) => {
  const title = `Стажировка ${Date.now()}`;
  await page.goto('/admin');
  await page.getByRole('button', { name: 'Создать форму' }).first().click();
  await expect(page).toHaveURL(/\/admin\/forms\//);
  await page.getByLabel('Название формы').fill(title);
  await page.getByRole('button', { name: 'Добавить базовые поля' }).click();
  await page.getByRole('button', { name: 'Опубликовать' }).click();
  await expect(page.getByRole('button', { name: 'Снять с публикации' })).toBeVisible();
  const editorUrl = page.url();
  const publicPath = await page.getByRole('link', { name: 'Открыть форму в новой вкладке' }).getAttribute('href');
  expect(publicPath).toMatch(/^\/f\/[A-Za-z0-9]{10}$/);

  await page.goto(publicPath!);
  await expect(page.getByRole('heading', { name: title })).toBeVisible();
  await page.getByRole('button', { name: 'Отправить' }).click();
  await expect(page.getByText(/Проверьте ответы/)).toBeVisible();
  await page.getByLabel('Имя и фамилия').fill('Анна Смирнова');
  await page.getByLabel('Email').fill('anna@example.com');
  await page.getByLabel(/согласен/i).check();
  await page.getByRole('button', { name: 'Отправить' }).click();
  await expect(page.getByRole('heading', { name: 'Ответ отправлен' })).toBeVisible();

  await page.goto(`${editorUrl}?tab=responses`);
  await expect(page.getByRole('cell', { name: 'Анна Смирнова' })).toBeVisible();
  await expect(page.getByRole('cell', { name: 'anna@example.com' })).toBeVisible();
});

test('text a number or date input cannot parse is not sent as an empty answer', async ({ page, request }) => {
  const form = await publishedForm(request, [
    { type: 'number', label: 'Возраст' },
    { type: 'date', label: 'Дата начала' },
  ]);
  await page.goto(`/f/${form.publicId}`);
  await page.getByLabel('Возраст').pressSequentially('1-2');
  await page.getByLabel('Дата начала').focus();
  await page.keyboard.type('12'); // only the first part of the date
  await page.getByRole('button', { name: 'Отправить' }).click();
  await expect(page.getByText('Введите число').first()).toBeVisible();
  await expect(page.getByText('Введите дату полностью').first()).toBeVisible();
  const { total } = await (await request.get(`/api/forms/${form.id}/responses`)).json();
  expect(total).toBe(0);
});

test('leaving the editor with unsaved changes asks first', async ({ page, request }) => {
  const form = await publishedForm(request, [{ type: 'short_text', label: 'Имя' }]);
  await page.goto(`/admin/forms/${form.id}`);
  await page.getByLabel('Название формы').fill('Изменённое название');
  await page.getByRole('link', { name: 'Все формы' }).click();
  const dialog = page.getByRole('dialog', { name: 'Уйти без сохранения?' });
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: 'Остаться' }).click();
  await expect(page).toHaveURL(new RegExp(`/admin/forms/${form.id}`));
  await expect(page.getByLabel('Название формы')).toHaveValue('Изменённое название');
});
