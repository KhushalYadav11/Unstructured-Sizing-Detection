import { render, screen, fireEvent, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import Settings from "../Settings";

// Mock useToast
vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({
    toast: vi.fn(),
  }),
}));

describe("Settings API Configuration Tab - API Key Reveal Toggle (P8)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // Render Settings with the API tab active from the start to avoid
  // Radix Tabs lazy-mounting inactive tab content in jsdom.
  function renderOnApiTab() {
    return render(<Settings initialTab="api" />);
  }

  it("renders the API key input as type='password' by default", () => {
    const { container } = renderOnApiTab();
    const input = container.querySelector("#api-key") as HTMLInputElement;
    expect(input).not.toBeNull();
    expect(input).toHaveAttribute("type", "password");
  });

  it("toggles API key input to type='text' when reveal button is clicked", () => {
    const { container } = renderOnApiTab();
    const input = container.querySelector("#api-key") as HTMLInputElement;
    expect(input).not.toBeNull();
    expect(input).toHaveAttribute("type", "password");

    // The toggle button is inside the relative wrapper (parent of input)
    const wrapper = input.parentElement!;
    const toggleButton = wrapper.querySelector("button") as HTMLButtonElement;
    expect(toggleButton).not.toBeNull();

    act(() => {
      fireEvent.click(toggleButton);
    });

    expect(input).toHaveAttribute("type", "text");
  });

  it("toggles back to type='password' when reveal button is clicked again (idempotent toggle)", () => {
    const { container } = renderOnApiTab();
    const input = container.querySelector("#api-key") as HTMLInputElement;
    expect(input).not.toBeNull();

    const wrapper = input.parentElement!;
    const toggleButton = wrapper.querySelector("button") as HTMLButtonElement;
    expect(toggleButton).not.toBeNull();

    // First click: reveal
    act(() => {
      fireEvent.click(toggleButton);
    });
    expect(input).toHaveAttribute("type", "text");

    // Second click: hide again
    act(() => {
      fireEvent.click(toggleButton);
    });
    expect(input).toHaveAttribute("type", "password");
  });

  it("renders the API key input with an empty string default (no hardcoded placeholder)", () => {
    const { container } = renderOnApiTab();
    const input = container.querySelector("#api-key") as HTMLInputElement;
    expect(input).not.toBeNull();
    expect(input.value).toBe("");
  });

  it("renders the Shield security note below the API key field", () => {
    const { container } = renderOnApiTab();
    // Find the security note paragraph inside the active API tab panel
    const paragraphs = container.querySelectorAll("p");
    const securityNote = Array.from(paragraphs).find((p) =>
      /api key is stored securely/i.test(p.textContent ?? "")
    );
    expect(securityNote).not.toBeUndefined();
    expect(securityNote!.textContent).toMatch(
      /api key is stored securely and never transmitted in plain text/i
    );
  });
});
