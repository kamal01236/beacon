import { ICON } from "@/lib/nav";

/** Renders a stroke icon from the shared ICON map. */
export function Icon({ name, size = 18 }: { name: string; size?: number }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      aria-hidden="true"
      dangerouslySetInnerHTML={{ __html: ICON[name] ?? "" }}
    />
  );
}
