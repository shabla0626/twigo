import type { BusinessIdea } from "@prisma/client";
import { IDEA_CATEGORIES } from "@/lib/validation/community";
import { Field, Input, Select, Textarea } from "../forms/fields";

/**
 * Idea form inputs. Only the title, the description and the area are
 * required; everything else can be filled in later by the author or the group.
 */
export function IdeaFields({ idea }: { idea?: BusinessIdea | null }) {
  const moreOpen = Boolean(idea?.description || idea?.proposal || idea?.customers || idea?.skillsNeeded || idea?.timeEstimate || idea?.links.length);
  return (
    <div className="space-y-6">
      <Field id="title" label="Idea title" hint="A short name. Example: “Meal prep for busy families”">
        <Input id="title" name="title" defaultValue={idea?.title} required minLength={5} maxLength={120} aria-describedby="title-hint" />
      </Field>
      <Field id="summary" label="What is the idea?" hint="A few sentences in plain words: what would you offer, and to whom?">
        <Textarea
          id="summary"
          name="summary"
          defaultValue={idea?.summary}
          required
          minLength={20}
          maxLength={500}
          rows={4}
          aria-describedby="summary-hint"
          placeholder="Example: Many busy parents in our area don’t have time to cook. We could prepare healthy weekly meals and deliver them on Sundays."
        />
      </Field>
      <Field id="problem" label="What problem or opportunity does it address?" optional hint="Skip this if you are not sure yet.">
        <Textarea id="problem" name="problem" defaultValue={idea?.problem ?? ""} maxLength={3000} rows={3} aria-describedby="problem-hint" />
      </Field>
      <Field id="revenueModel" label="How might it make money?" optional hint="Who would pay, and for what? Money must come from real customers, never from members.">
        <Textarea id="revenueModel" name="revenueModel" defaultValue={idea?.revenueModel ?? ""} maxLength={2000} rows={2} aria-describedby="revenueModel-hint" />
      </Field>
      <Field id="category" label="Which area fits best?">
        <Select id="category" name="category" defaultValue={idea?.category ?? ""} required>
          <option value="" disabled>
            Choose one
          </option>
          {Object.entries(IDEA_CATEGORIES).map(([v, l]) => (
            <option key={v} value={v}>
              {l}
            </option>
          ))}
        </Select>
      </Field>
      <details className="rounded-2xl border border-ink-100 bg-ink-50/60 p-4" open={moreOpen}>
        <summary className="cursor-pointer text-sm font-semibold text-ink-900">Add more details (optional)</summary>
        <p className="mt-1 text-sm text-ink-600">Early ideas are welcome. Fill in only what you know; the group can research the rest.</p>
        <div className="mt-4 space-y-5">
          <Field id="proposal" label="The product or service in more detail" optional>
            <Textarea id="proposal" name="proposal" defaultValue={idea?.proposal ?? ""} maxLength={3000} rows={3} />
          </Field>
          <Field id="customers" label="Who would the customers be?" optional>
            <Textarea id="customers" name="customers" defaultValue={idea?.customers ?? ""} maxLength={2000} rows={2} />
          </Field>
          <Field id="skillsNeeded" label="Skills that would help" optional>
            <Input id="skillsNeeded" name="skillsNeeded" defaultValue={idea?.skillsNeeded ?? ""} maxLength={1000} />
          </Field>
          <Field id="timeEstimate" label="How much time it might take, if you know" optional>
            <Input id="timeEstimate" name="timeEstimate" defaultValue={idea?.timeEstimate ?? ""} maxLength={300} />
          </Field>
          <Field id="description" label="Anything else" optional>
            <Textarea id="description" name="description" defaultValue={idea?.description ?? ""} maxLength={10000} rows={5} />
          </Field>
          <Field id="links" label="Useful links" optional hint="One per line, starting with https://">
            <Textarea id="links" name="links" defaultValue={idea?.links.join("\n") ?? ""} rows={3} aria-describedby="links-hint" />
          </Field>
        </div>
      </details>
    </div>
  );
}
