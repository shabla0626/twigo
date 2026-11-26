"use client";

import { useState, type ComponentProps } from "react";
import { IconEye, IconEyeOff } from "../ui/icons";
import { Input } from "./fields";

/** Password box with a show / hide control. */
export function PasswordInput(props: Omit<ComponentProps<typeof Input>, "type">) {
  const [shown, setShown] = useState(false);
  return (
    <div className="relative">
      <Input {...props} type={shown ? "text" : "password"} className="pr-12" />
      <button
        type="button"
        onClick={() => setShown((v) => !v)}
        aria-pressed={shown}
        aria-label={shown ? "Hide password" : "Show password"}
        className="absolute inset-y-0 right-0 flex w-11 items-center justify-center rounded-r-xl text-ink-400 hover:text-ink-800"
      >
        {shown ? <IconEyeOff className="h-[18px] w-[18px]" /> : <IconEye className="h-[18px] w-[18px]" />}
      </button>
    </div>
  );
}
