"use client";

import { useState, type ComponentProps } from "react";
import { Input } from "./fields";

/** Password box with a Show / Hide button. */
export function PasswordInput(props: Omit<ComponentProps<typeof Input>, "type">) {
  const [shown, setShown] = useState(false);
  return (
    <div className="relative">
      <Input {...props} type={shown ? "text" : "password"} className="pr-16" />
      <button
        type="button"
        onClick={() => setShown((v) => !v)}
        aria-pressed={shown}
        aria-label={shown ? "Hide password" : "Show password"}
        className="absolute inset-y-0 right-1 my-1 rounded-md px-3 text-sm font-medium text-accent-800 hover:bg-accent-50"
      >
        {shown ? "Hide" : "Show"}
      </button>
    </div>
  );
}
