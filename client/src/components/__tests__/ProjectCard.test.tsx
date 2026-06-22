import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { ProjectCard } from "../ProjectCard";

describe("ProjectCard", () => {
  const defaultProps = {
    id: "test-1",
    name: "Test Project",
    status: "completed" as const,
    measurements: 5,
    lastUpdated: "Oct 3, 2025",
  };

  it("does not contain hover-elevate in the root Card element className", () => {
    const { container } = render(<ProjectCard {...defaultProps} />);

    // The root element rendered by Card
    const rootCard = container.firstElementChild;
    expect(rootCard).not.toBeNull();
    expect(rootCard!.className).not.toContain("hover-elevate");
  });

  it("does not contain active-elevate-2 in the root Card element className", () => {
    const { container } = render(<ProjectCard {...defaultProps} />);

    const rootCard = container.firstElementChild;
    expect(rootCard).not.toBeNull();
    expect(rootCard!.className).not.toContain("active-elevate-2");
  });

  it("uses transition-shadow hover:shadow-md cursor-pointer as the hover pattern", () => {
    const { container } = render(<ProjectCard {...defaultProps} />);

    const rootCard = container.firstElementChild;
    expect(rootCard).not.toBeNull();
    expect(rootCard!.className).toContain("transition-shadow");
    expect(rootCard!.className).toContain("hover:shadow-md");
    expect(rootCard!.className).toContain("cursor-pointer");
  });
});
