import { avatarHue, initials } from "../lib/email";

export default function Avatar({ name, size = 32 }: { name: string; size?: number }) {
  return (
    <span
      className="avatar"
      style={{
        width: size,
        height: size,
        fontSize: size * 0.4,
        ["--hue" as string]: avatarHue(name),
      }}
      aria-hidden
    >
      {initials(name)}
    </span>
  );
}
