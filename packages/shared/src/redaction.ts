import { SECRET_ENV_NAME_PATTERN } from "./constants.js";

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function isSecretEnvName(name: string): boolean {
  return SECRET_ENV_NAME_PATTERN.test(name);
}

export function getSecretEnvValues(env: Record<string, string>): string[] {
  return Object.entries(env)
    .filter(([name, value]) => isSecretEnvName(name) && value.length > 0)
    .map(([, value]) => value)
    .sort((a, b) => b.length - a.length);
}

export function redactText(text: string, env: Record<string, string>): string {
  let redacted = text;

  for (const [name] of Object.entries(env).filter(([key]) => isSecretEnvName(key))) {
    const assignmentPattern = new RegExp(`(${escapeRegExp(name)}\\s*=\\s*)([^\\s]+)`, "gi");
    redacted = redacted.replace(assignmentPattern, "$1***REDACTED***");
  }

  for (const value of getSecretEnvValues(env)) {
    redacted = redacted.replace(new RegExp(escapeRegExp(value), "g"), "***REDACTED***");
  }

  return redacted;
}
