# API-контракт

Все ответы — JSON. Ошибки имеют единый формат:

```json
{ "error": { "code": "VALIDATION_ERROR", "message": "Человекочитаемое описание", "fields": { "<key>": "сообщение" } } }
```

| HTTP | code | Когда |
|------|------|-------|
| 400 | `INVALID_JSON` | Тело запроса — не JSON / не объект |
| 400 | `VALIDATION_ERROR` | Ошибки валидации; `fields` — карта ошибок |
| 403 | `FORM_NOT_PUBLISHED` | Публичное обращение к неопубликованной форме |
| 404 | `NOT_FOUND` | Неизвестный id / publicId / маршрут API |
| 413 | `PAYLOAD_TOO_LARGE` | Тело больше 200 КБ |
| 500 | `INTERNAL` | Непредвиденная ошибка |

## Модель данных

```ts
type FieldType =
  | 'short_text' | 'long_text' | 'email' | 'phone' | 'number'
  | 'select'        // выпадающий список, один вариант
  | 'radio'         // обычный список вариантов, один вариант
  | 'multi_select'  // множественный выбор (чекбоксы)
  | 'date'          // YYYY-MM-DD
  | 'checkbox';     // одиночный флажок (например, согласие)

interface Option { id: string; label: string }

interface Field {
  id: string;            // /^[A-Za-z0-9_-]{1,64}$/, уникален в форме
  type: FieldType;
  label: string;         // 1..300 символов
  hint: string;          // 0..500, подсказка под подписью
  placeholder: string;   // 0..200, только для текстовых, email, phone, number
  required: boolean;
  options: Option[];     // только для select/radio/multi_select: 1..50 шт., label уникальны
  min: number | null;    // только для number
  max: number | null;    // только для number
}

interface Form {
  id: string;            // внутренний id (админка)
  publicId: string;      // id публичной ссылки /f/:publicId
  title: string;         // 1..200
  description: string;   // 0..2000
  status: 'draft' | 'published';
  fields: Field[];       // 0..100
  version: number;       // увеличивается при каждом сохранении
  createdAt: string; updatedAt: string; publishedAt: string | null; // ISO
}
```

Значения ответов по типам: текстовые/email/phone/date — `string`; number — `number`;
select/radio — `string` (id варианта); multi_select — `string[]` (id вариантов);
checkbox — `boolean`. Необязательное незаполненное поле можно не передавать или передать `null`/`""`/`[]`.
Обязательный checkbox должен быть `true`.

## Админ API (без авторизации)

- `GET /api/forms` → `{ forms: FormSummary[] }`, где
  `FormSummary = { id, publicId, title, description, status, fieldCount, responseCount, createdAt, updatedAt, publishedAt }`, сортировка по `updatedAt` убыв.
- `POST /api/forms` body `{ title, description?, fields? }` → `201 { form }`
- `GET /api/forms/:id` → `{ form }`
- `PUT /api/forms/:id` body `{ title, description, fields }` → `{ form }` (полная замена содержимого, `version + 1`).
  Ключи ошибок: `title`, `description`, `fields`, `fields.<index>.label`, `fields.<index>.options`, `fields.<index>.options.<j>`, `fields.<index>.min` и т.д.
  Поле без `id` получает сгенерированный id; так же для вариантов.
- `POST /api/forms/:id/publish` → `{ form }`. Требует ≥1 поля, иначе `400 VALIDATION_ERROR` с ключом `fields`.
- `POST /api/forms/:id/unpublish` → `{ form }`
- `DELETE /api/forms/:id` → `204` (удаляет форму, её ответы и аналитику)
- `GET /api/forms/:id/responses` → `{ responses: ResponseView[], total }` (новые сверху), где

```ts
interface ResponseView {
  id: string;
  submittedAt: string;       // ISO
  formVersion: number;       // версия формы на момент отправки
  items: {                   // в порядке полей на момент отправки (снимок схемы)
    fieldId: string; label: string; type: FieldType;
    value: unknown;          // исходное значение
    display: string;         // готовая строка: варианты → подписи, boolean → «Да»/«Нет», пусто → «—»
  }[];
}
```

- `GET /api/forms/:id/responses.csv` → `text/csv` (UTF-8 с BOM, разделитель `;`).
- `GET /api/forms/:id/analytics` → см. ниже.

## Публичное API

- `GET /api/public/forms/:publicId` → `{ form: { publicId, title, description, fields } }`;
  `404 NOT_FOUND` — нет формы; `403 FORM_NOT_PUBLISHED` — форма не опубликована (содержимое не отдаётся).
- `POST /api/public/forms/:publicId/responses` body `{ answers: { [fieldId]: value }, submissionId: uuid, sessionId?: uuid }`
  → `201 { response: { id, submittedAt } }`.
  Сервер сам загружает актуальную схему формы и валидирует ответы. Неизвестные ключи `answers` отбрасываются.
  Ошибки: `400 VALIDATION_ERROR` (`fields: { [fieldId]: сообщение }`), `403`, `404`.
  Повтор с тем же `submissionId` → `200` с тем же ответом (идемпотентность, защита от двойной отправки).
- `POST /api/public/forms/:publicId/events` body `{ sessionId: uuid, type: 'view' | 'start' | 'field', fieldId? }` → `204`.

## Аналитика

Методика (клиент хранит `sessionId` в `sessionStorage` для каждой формы, поэтому перезагрузка страницы не создаёт новый сеанс):

- **Просмотр** (`view`) — форма загрузилась и отрисовалась у студента.
- **Начало заполнения** (`start`) — студент впервые изменил значение любого поля (не фокус и не загрузка).
- **Поле** (`field`) — студент впервые изменил значение конкретного поля.
- **Отправка** — успешный `POST .../responses`, связанный с `sessionId`.

`GET /api/forms/:id/analytics` →

```ts
{
  views: number; starts: number; submissions: number;   // submissions — все сохранённые ответы
  startRate: number | null;        // starts / views
  completionRate: number | null;   // отправки сеансов, начавших заполнение / starts
  abandoned: number;               // начали, но не отправили
  fields: { fieldId: string; label: string; filled: number; lastBeforeAbandon: number }[];
}
```
`filled` — сколько сеансов изменили поле; `lastBeforeAbandon` — сколько брошенных сеансов
остановились именно на этом поле (последнее изменённое поле).
