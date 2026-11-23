import { permanentRedirect } from "next/navigation";

/** The documents now live under /legal with their versions; this address keeps old links working. */
export default function Moved() {
  permanentRedirect("/legal/terms");
}
