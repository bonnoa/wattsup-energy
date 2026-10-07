import { describe, expect, it } from "vitest";
import { publicOrigin, withSourceUrl } from "@/domain/blueprint";

describe("withSourceUrl", () => {
  it("remplace l'adresse d'origine, garde l'indentation et le reste", () => {
    const yaml =
      "blueprint:\n  name: X\n  source_url: https://github.com/bonnoa/x.yaml\n  domain: script\n";
    expect(withSourceUrl(yaml, "https://wattsup.test/api/blueprint/x.yaml")).toBe(
      "blueprint:\n  name: X\n  source_url: https://wattsup.test/api/blueprint/x.yaml\n  domain: script\n",
    );
  });
});

describe("publicOrigin", () => {
  it("en-têtes du proxy en priorité, sinon l'adresse de la requête", () => {
    expect(
      publicOrigin(
        "http://localhost:3000/api/blueprint/x.yaml",
        new Headers({ "x-forwarded-proto": "https", "x-forwarded-host": "wattsup.example.fr" }),
      ),
    ).toBe("https://wattsup.example.fr");
    expect(
      publicOrigin(
        "http://localhost:3000/api/blueprint/x.yaml",
        new Headers({ host: "localhost:3000" }),
      ),
    ).toBe("http://localhost:3000");
  });
});
