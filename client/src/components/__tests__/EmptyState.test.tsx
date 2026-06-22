import { describe, it, expect, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { FolderOpen } from "lucide-react";
import * as fc from "fast-check";
import { EmptyState } from "../EmptyState";

describe("EmptyState", () => {
  it("renders title and description for basic string props", () => {
    render(
      <EmptyState
        icon={FolderOpen}
        title="No projects yet"
        description="Create your first project to get started"
      />
    );

    expect(screen.getByText("No projects yet")).toBeInTheDocument();
    expect(
      screen.getByText("Create your first project to get started")
    ).toBeInTheDocument();
  });

  it("renders title and description for arbitrary non-empty string props", () => {
    const titles = [
      "Hello World",
      "A",
      "Some very long title that goes on and on",
      "Title with special chars: & < > \"",
    ];
    const descriptions = [
      "Short desc",
      "B",
      "A longer description with more detail",
      "Description with special chars: & < > \"",
    ];

    titles.forEach((title, i) => {
      const description = descriptions[i];
      const { unmount } = render(
        <EmptyState icon={FolderOpen} title={title} description={description} />
      );
      expect(screen.getByText(title)).toBeInTheDocument();
      expect(screen.getByText(description)).toBeInTheDocument();
      unmount();
    });
  });

  it("does not render a Button when action prop is omitted", () => {
    render(
      <EmptyState
        icon={FolderOpen}
        title="No data"
        description="Nothing here yet"
      />
    );

    expect(screen.queryByRole("button")).toBeNull();
  });

  it("renders a Button with the action label when action prop is provided", () => {
    const onClick = vi.fn();
    render(
      <EmptyState
        icon={FolderOpen}
        title="No data"
        description="Nothing here yet"
        action={{ label: "Create Item", onClick }}
      />
    );

    const button = screen.getByRole("button", { name: "Create Item" });
    expect(button).toBeInTheDocument();
  });

  it("calls action.onClick when the action Button is clicked", async () => {
    const onClick = vi.fn();
    render(
      <EmptyState
        icon={FolderOpen}
        title="No data"
        description="Nothing here yet"
        action={{ label: "Do Something", onClick }}
      />
    );

    await userEvent.click(screen.getByRole("button", { name: "Do Something" }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("renders the container with centering classes", () => {
    const { container } = render(
      <EmptyState
        icon={FolderOpen}
        title="Title"
        description="Description"
      />
    );

    const root = container.firstChild as HTMLElement;
    expect(root.className).toContain("flex");
    expect(root.className).toContain("flex-col");
    expect(root.className).toContain("items-center");
    expect(root.className).toContain("justify-center");
    expect(root.className).toContain("text-center");
    expect(root.className).toContain("py-12");
  });

  it("renders the Icon_Badge wrapper with correct classes", () => {
    const { container } = render(
      <EmptyState
        icon={FolderOpen}
        title="Title"
        description="Description"
      />
    );

    const badge = container.querySelector(
      ".h-10.w-10.rounded-md.bg-muted"
    );
    expect(badge).not.toBeNull();
  });

  /**
   * P3: EmptyState Render Completeness
   * Validates: Requirements 7.1, 7.2
   *
   * Property: For any combination of non-empty title and description strings,
   * EmptyState renders without throwing and always displays both strings.
   */
  it("P3: always renders title and description for arbitrary non-empty string props", () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1 }).filter((s) => s.trim().length > 0),
        fc.string({ minLength: 1 }).filter((s) => s.trim().length > 0),
        (title, description) => {
          const { container, unmount } = render(
            <EmptyState icon={FolderOpen} title={title} description={description} />
          );
          // Scope queries to the rendered container to avoid cross-iteration interference
          const titleEl = container.querySelector("p.text-sm.font-medium");
          const descEl = container.querySelector("p.text-xs.text-muted-foreground");
          const result =
            titleEl !== null &&
            descEl !== null &&
            titleEl.textContent === title &&
            descEl.textContent === description;
          unmount();
          return result;
        }
      )
    );
  });
});
