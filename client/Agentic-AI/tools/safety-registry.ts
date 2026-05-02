// Adds a safety registry to mark actions as auto-fix, approval-needed, or blocked.

import { SafetyClass } from "../agent/types";

export function getSafetyClass(action: string): SafetyClass {
  switch (action) {
    case "generate_fix":
      return "safe";
    case "rollback":
      return "needs_approval";
    case "human_only":
      return "blocked";
    case "alert_only":
      return "safe";
    case "unknown":
      return "blocked";
    default:
      return "blocked";
  }
}
