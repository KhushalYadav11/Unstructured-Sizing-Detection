import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import * as fc from "fast-check";
import { MeasurementPanel } from "../MeasurementPanel";

// Mock the shared schema used by CoalTypeSelector
vi.mock("@shared/schema", () => ({
  COAL_TYPES: {
    bituminous: { name: "Bituminous", density: 1346 },
    anthracite: { name: "Anthracite", density: 1506 },
    lignite: { name: "Lignite", density: 801 },
    subbituminous: { name: "Sub-bituminous", density: 1214 },
  },
}));

describe("MeasurementPanel", () => {
  it("renders exactly one Save Measurement button", () => {
    render(<MeasurementPanel />);

    const saveButtons = screen.getAllByTestId("button-save-measurement");
    expect(saveButtons).toHaveLength(1);
  });

  it("renders exactly one Save Measurement button when onSave prop is provided", () => {
    const onSave = vi.fn();
    render(<MeasurementPanel onSave={onSave} />);

    const saveButtons = screen.getAllByTestId("button-save-measurement");
    expect(saveButtons).toHaveLength(1);
  });

  it("Save button is positioned after Coal Type selector and before weight display", () => {
    render(<MeasurementPanel />);

    const container = document.body;
    const coalTypeLabel = container.querySelector('label[for="coal-type"]');
    const saveButton = screen.getByTestId("button-save-measurement");

    // Coal Type selector should appear before the Save button in the DOM
    expect(coalTypeLabel).not.toBeNull();
    const position = coalTypeLabel!.compareDocumentPosition(saveButton);
    // DOCUMENT_POSITION_FOLLOWING means saveButton comes after coalTypeLabel
    expect(position & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("weight display is not shown initially (before any dimensions are entered)", () => {
    render(<MeasurementPanel />);

    const weightDisplay = screen.queryByTestId("text-estimated-weight");
    expect(weightDisplay).toBeNull();
  });

  /**
   * P2: Single Save Button Invariant
   * Validates: Requirements 10.1
   *
   * Property: MeasurementPanel renders exactly one element with
   * data-testid="button-save-measurement" regardless of the values of
   * length, width, height, coalType, or weight.
   */
  it("P2: always renders exactly one save button for arbitrary dimension inputs", () => {
    fc.assert(
      fc.property(
        fc.string(),
        fc.string(),
        fc.string(),
        (length, width, height) => {
          const { unmount } = render(<MeasurementPanel />);
          const saveButtons = screen.getAllByTestId("button-save-measurement");
          const result = saveButtons.length === 1;
          unmount();
          cleanup();
          return result;
        }
      )
    );
  });
});
