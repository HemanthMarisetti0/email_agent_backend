import { Send } from "lucide-react";

export default function Logo({ size = "md" }: { size?: "md" | "lg" }) {
  return (
    <span className={`logo logo-${size}`}>
      <span className="logo-mark">
        <Send aria-hidden />
      </span>
      <span className="logo-text">MailPilot</span>
    </span>
  );
}
