import { describe, expect, it } from "vitest";
import { parseTheme } from "@/domain/theme";

describe("parseTheme", () => {
  it("thème connu, sinon clair", () => {
    expect(parseTheme("dark")).toBe("dark");
    expect(parseTheme("auto")).toBe("auto");
    expect(parseTheme("rose")).toBe("light");
    expect(parseTheme(undefined)).toBe("light");
  });
});
