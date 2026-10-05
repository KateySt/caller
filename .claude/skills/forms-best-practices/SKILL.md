---
name: forms-best-practices
description: How every form in `front/` must be built — react-hook-form + zod (via @hookform/resolvers), the shared `FormField`/`CharacterCounter` components, schemas in `lib/schemas/`. Use whenever adding, editing, or reviewing a form, dialog with inputs, or any code that validates user input in the frontend (create/edit/send dialogs, settings forms, composers). Never hand-roll field state with `useState`.
---

# Forms in `front/`

Every form uses **`react-hook-form` + `zod`** (`@hookform/resolvers/zod`). Do not hand-roll
`useState` for field values, validation errors, or "is submitting", and do not add Formik or
another form library — one pattern keeps the dialogs consistent.

## The pattern

1. **Schema** in `lib/schemas/<feature>.ts`. Build text fields with `requiredTrimmedText({ max, emptyMessage, tooLongMessage })` from `lib/schemas/fields.ts` (trim first, then validate — mirrors the backend DTOs, so whitespace-only counts as empty). Reuse limit constants (`MAX_*`, `E164_PATTERN`) from `lib/api.ts`; never duplicate them. Export `z.input` and `z.output` types.
2. **Form** — `useForm<Input, unknown, Output>({ resolver: zodResolver(schema), defaultValues })`. Always give `defaultValues` for every field (edit forms: the entity's current values). `<form onSubmit={submit} noValidate>` where `const submit = handleSubmit(async (values) => { ... })`; the handler receives the **trimmed, parsed output**.
3. **Fields** — wrap each control in `components/form-field.tsx`:
   ```tsx
   <FormField label="Name" error={errors.name?.message} counter={<CharacterCounter length={n} max={MAX} />}>
     {(controlProps) => <Input {...controlProps} {...register("name")} disabled={isSubmitting} />}
   </FormField>
   ```
   `FormField` owns the label, `id`, `aria-invalid`, `aria-describedby` and the `role="alert"` error, so never write that wiring by hand. Use `hint` for always-visible helper text (e.g. why a field is disabled).
4. **Counters** — `useWatch({ control, name })` (not `watch()`: the React Compiler lint rejects it).
5. **Submitting state** — `formState.isSubmitting` drives `disabled`, button labels, and blocking dialog dismissal (`handleOpenChange` ignores close while submitting; `showCloseButton={!isSubmitting}`). No separate `isSaving`/`isSending` state.
6. **Server errors** — catch inside the submit handler, `toast.error(...)`, and leave the values untouched so the user can retry. On success: `onClose()` for dialogs, or `reset(newValues)` for in-place forms (e.g. `AgentSettingsForm`) so the field shows what the server stored.
7. **Clean state per open** — dialogs are mounted only while open (and `key`ed by entity id), so each open gets a fresh `useForm`; don't add manual resets.
8. Need the parent to know about submission (e.g. to block a sibling "Delete" button)? Report it up with an `onSubmittingChange(isSubmitting)` effect, as `telegram-composer.tsx` does.

## Reference implementations
- Dialog with two fields: `components/create-user-dialog.tsx`, `edit-user-dialog.tsx`
- Textarea + counter: `send-sms-dialog.tsx`, `send-message-dialog.tsx`, `agent-settings-form.tsx`
- Inline form with status-gated disabled state and refocus: `telegram-composer.tsx`

## Checklist before finishing
- [ ] No `useState` holding a field value, error, or submitting flag
- [ ] Schema lives in `lib/schemas/`, limits imported from `lib/api.ts`
- [ ] Every control inside `FormField`; `noValidate` on the form
- [ ] `npm run lint && npx tsc --noEmit` pass (lint flags `watch()` and sync `setState` in effects)
- [ ] Backend DTO validation still the authority — client rules only mirror it
