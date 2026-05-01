import { describe, expect, it } from "vitest";
import { redactText } from "../src/index.js";

describe("secret redaction", () => {
  it("masks secret values and assignments", () => {
    const env = {
      API_TOKEN: "super-secret-token",
      ANDROID_KEYSTORE_PASSWORD: "changeit",
      NORMAL_VALUE: "visible"
    };

    const redacted = redactText(
      "API_TOKEN=super-secret-token password changeit NORMAL_VALUE=visible",
      env
    );

    expect(redacted).toContain("API_TOKEN=***REDACTED***");
    expect(redacted).toContain("***REDACTED***");
    expect(redacted).toContain("NORMAL_VALUE=visible");
    expect(redacted).not.toContain("super-secret-token");
    expect(redacted).not.toContain("changeit");
  });
});
