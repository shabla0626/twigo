import { Field } from "./fields";
import { PasswordInput } from "./password-input";

/** New password + repeat, each with a Show / Hide button. */
export function PasswordFields({ label = "New password" }: { label?: string }) {
  return (
    <>
      <Field id="password" label={label} hint="At least 12 characters, with letters and numbers.">
        <PasswordInput id="password" name="password" autoComplete="new-password" minLength={12} required aria-describedby="password-hint" />
      </Field>
      <Field id="confirm" label="Repeat the new password">
        <PasswordInput id="confirm" name="confirm" autoComplete="new-password" minLength={12} required />
      </Field>
    </>
  );
}
