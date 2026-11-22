import type { MemberProfile } from "@prisma/client";
import { Field, Input, Textarea } from "../forms/fields";

const TIME_ZONES = [
  "Eastern Time (ET)",
  "Central Time (CT)",
  "Mountain Time (MT)",
  "Arizona (MST)",
  "Pacific Time (PT)",
  "Alaska Time (AKT)",
  "Hawaii Time (HT)",
  "Outside the United States",
];

/** Profile inputs shared by the welcome page and the profile editor. */
export function ProfileFields({ p, fallbackName }: { p?: Partial<MemberProfile> | null; fallbackName?: string }) {
  return (
    <div className="space-y-5">
      <Field id="displayName" label="Display name" hint="How other members see you.">
        <Input id="displayName" name="displayName" defaultValue={p?.displayName ?? fallbackName} required minLength={2} maxLength={60} aria-describedby="displayName-hint" />
      </Field>
      <Field id="headline" label="Short headline" optional hint="For example “Bookkeeper, learning web design”.">
        <Input id="headline" name="headline" defaultValue={p?.headline ?? ""} maxLength={120} aria-describedby="headline-hint" />
      </Field>
      <Field id="intro" label="Introduce yourself" optional>
        <Textarea id="intro" name="intro" defaultValue={p?.intro ?? ""} maxLength={2000} rows={4} />
      </Field>
      <div className="grid gap-5 sm:grid-cols-2">
        <Field id="location" label="General location" optional hint="A state or region only, never an address.">
          <Input id="location" name="location" defaultValue={p?.location ?? ""} maxLength={80} aria-describedby="location-hint" />
        </Field>
        <Field id="timeZone" label="Time zone" optional>
          <Input id="timeZone" name="timeZone" list="tz-list" defaultValue={p?.timeZone ?? ""} maxLength={60} />
          <datalist id="tz-list">
            {TIME_ZONES.map((t) => (
              <option key={t} value={t} />
            ))}
          </datalist>
        </Field>
      </div>
      <Field id="skills" label="Skills" optional hint="Separate with commas, e.g. “writing, Excel, customer service”.">
        <Input id="skills" name="skills" defaultValue={p?.skills?.join(", ") ?? ""} aria-describedby="skills-hint" />
      </Field>
      <Field id="experience" label="Experience" optional>
        <Textarea id="experience" name="experience" defaultValue={p?.experience ?? ""} maxLength={2000} rows={3} />
      </Field>
      <Field id="interests" label="Areas of interest" optional>
        <Input id="interests" name="interests" defaultValue={p?.interests ?? ""} maxLength={1000} />
      </Field>
      <div className="grid gap-5 sm:grid-cols-2">
        <Field id="hoursPerWeek" label="Hours available per week" optional>
          <Input id="hoursPerWeek" name="hoursPerWeek" type="number" min={0} max={80} defaultValue={p?.hoursPerWeek ?? ""} />
        </Field>
        <Field id="availability" label="Usual availability" optional hint="e.g. “Weekday evenings”.">
          <Input id="availability" name="availability" defaultValue={p?.availability ?? ""} maxLength={200} aria-describedby="availability-hint" />
        </Field>
      </div>
      <fieldset className="rounded-2xl bg-ink-50 p-4">
        <legend className="px-1 text-sm font-medium text-ink-900">Show to other members</legend>
        <div className="mt-2 flex flex-wrap gap-x-6 gap-y-2 text-sm text-ink-700">
          {(
            [
              ["showLocation", "Location", p?.showLocation ?? true],
              ["showTimeZone", "Time zone", p?.showTimeZone ?? true],
              ["showHours", "Hours and availability", p?.showHours ?? true],
            ] as const
          ).map(([name, label, checked]) => (
            <label key={name} className="flex items-center gap-2">
              <input type="checkbox" name={name} defaultChecked={checked} className="h-4 w-4" /> {label}
            </label>
          ))}
        </div>
        <p className="mt-2 text-xs text-ink-500">Your email address, phone number and application details are never shown to other members.</p>
      </fieldset>
    </div>
  );
}
