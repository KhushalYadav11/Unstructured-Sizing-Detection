import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { useQuery } from "@tanstack/react-query";
import Analytics from "../Analytics";

// Mock @tanstack/react-query
vi.mock("@tanstack/react-query", () => ({
  useQuery: vi.fn(),
}));

// Mock API functions
vi.mock("@/lib/api", () => ({
  getTodayCount: vi.fn(),
  getAnalyticsOverview: vi.fn(),
}));

// Mock child components not under test
vi.mock("@/components/MetricCard", () => ({
  MetricCard: ({ title }: { title: string }) => (
    <div data-testid="metric-card">{title}</div>
  ),
}));

vi.mock("@/components/ui/skeleton", () => ({
  Skeleton: () => <div data-testid="skeleton" />,
}));

vi.mock("@/components/CoalTypeSelector", () => ({
  COAL_TYPES: [],
}));

const mockUseQuery = vi.mocked(useQuery);

function buildAnalyticsData(
  excellent: number,
  good: number,
  fair: number,
  poor: number
) {
  const total = excellent + good + fair + poor;
  return {
    totalMeasurements: total,
    totalVolume: 0,
    totalWeight: 0,
    coalTypeCount: {},
    qualityCount: { excellent, good, fair, poor },
  };
}

describe("Analytics quality distribution progress bars", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders progress bars with width between 0% and 100% for typical counts", () => {
    const analyticsData = buildAnalyticsData(10, 20, 5, 3);

    mockUseQuery
      .mockReturnValueOnce({ data: { count: 5 }, isLoading: false } as any)
      .mockReturnValueOnce({ data: analyticsData, isLoading: false } as any);

    render(<Analytics />);

    // Find all progress bar fills (divs inside the h-1.5 track)
    const progressFills = document
      .querySelectorAll(".h-1\\.5.bg-muted.rounded-full.overflow-hidden > div");

    expect(progressFills.length).toBeGreaterThan(0);

    progressFills.forEach((fill) => {
      const widthStyle = (fill as HTMLElement).style.width;
      const widthValue = parseFloat(widthStyle);
      expect(widthValue).toBeGreaterThanOrEqual(0);
      expect(widthValue).toBeLessThanOrEqual(100);
    });
  });

  it("renders progress bar widths between 0% and 100% when one quality dominates", () => {
    // All measurements are excellent
    const analyticsData = buildAnalyticsData(100, 0, 0, 0);

    mockUseQuery
      .mockReturnValueOnce({ data: { count: 0 }, isLoading: false } as any)
      .mockReturnValueOnce({ data: analyticsData, isLoading: false } as any);

    render(<Analytics />);

    const progressFills = document
      .querySelectorAll(".h-1\\.5.bg-muted.rounded-full.overflow-hidden > div");

    progressFills.forEach((fill) => {
      const widthValue = parseFloat((fill as HTMLElement).style.width);
      expect(widthValue).toBeGreaterThanOrEqual(0);
      expect(widthValue).toBeLessThanOrEqual(100);
    });
  });

  it("renders progress bar widths between 0% and 100% for equal distribution", () => {
    const analyticsData = buildAnalyticsData(25, 25, 25, 25);

    mockUseQuery
      .mockReturnValueOnce({ data: { count: 0 }, isLoading: false } as any)
      .mockReturnValueOnce({ data: analyticsData, isLoading: false } as any);

    render(<Analytics />);

    const progressFills = document
      .querySelectorAll(".h-1\\.5.bg-muted.rounded-full.overflow-hidden > div");

    progressFills.forEach((fill) => {
      const widthValue = parseFloat((fill as HTMLElement).style.width);
      expect(widthValue).toBeGreaterThanOrEqual(0);
      expect(widthValue).toBeLessThanOrEqual(100);
    });
  });

  it("renders EmptyState when totalMeasurements is 0", () => {
    const analyticsData = buildAnalyticsData(0, 0, 0, 0);

    mockUseQuery
      .mockReturnValueOnce({ data: { count: 0 }, isLoading: false } as any)
      .mockReturnValueOnce({ data: analyticsData, isLoading: false } as any);

    render(<Analytics />);

    expect(screen.getByText("No data yet")).toBeInTheDocument();
    expect(
      screen.getByText("Measurements will appear here once recorded")
    ).toBeInTheDocument();
  });

  it("renders EmptyState when analytics data is not yet loaded", () => {
    mockUseQuery
      .mockReturnValueOnce({ data: undefined, isLoading: false } as any)
      .mockReturnValueOnce({ data: undefined, isLoading: false } as any);

    render(<Analytics />);

    expect(screen.getByText("No data yet")).toBeInTheDocument();
  });

  it("renders quality badges for all four ratings when data is present", () => {
    const analyticsData = buildAnalyticsData(5, 10, 3, 2);

    mockUseQuery
      .mockReturnValueOnce({ data: { count: 0 }, isLoading: false } as any)
      .mockReturnValueOnce({ data: analyticsData, isLoading: false } as any);

    render(<Analytics />);

    expect(screen.getByTestId("badge-quality-excellent")).toBeInTheDocument();
    expect(screen.getByTestId("badge-quality-good")).toBeInTheDocument();
    expect(screen.getByTestId("badge-quality-fair")).toBeInTheDocument();
    expect(screen.getByTestId("badge-quality-poor")).toBeInTheDocument();
  });

  it("displays count values in font-mono spans", () => {
    const analyticsData = buildAnalyticsData(7, 14, 3, 1);

    mockUseQuery
      .mockReturnValueOnce({ data: { count: 0 }, isLoading: false } as any)
      .mockReturnValueOnce({ data: analyticsData, isLoading: false } as any);

    render(<Analytics />);

    // Count values should be visible
    expect(screen.getByText("7")).toBeInTheDocument();
    expect(screen.getByText("14")).toBeInTheDocument();
    expect(screen.getByText("3")).toBeInTheDocument();
    expect(screen.getByText("1")).toBeInTheDocument();
  });

  /**
   * P7: Analytics Progress Bar Width Bounds
   * Validates: Requirements 9.4
   *
   * For any quality distribution data where totalMeasurements >= 0 and each
   * quality count >= 0, every progress bar fill width is in the range [0%, 100%].
   */
  it("progress bar widths are always between 0% and 100% for any non-negative counts", () => {
    // Test a variety of non-negative count combinations
    const testCases = [
      { excellent: 0, good: 0, fair: 0, poor: 1 },
      { excellent: 1, good: 0, fair: 0, poor: 0 },
      { excellent: 50, good: 50, fair: 0, poor: 0 },
      { excellent: 1, good: 1, fair: 1, poor: 1 },
      { excellent: 999, good: 1, fair: 0, poor: 0 },
      { excellent: 0, good: 100, fair: 0, poor: 0 },
    ];

    for (const { excellent, good, fair, poor } of testCases) {
      vi.clearAllMocks();
      const analyticsData = buildAnalyticsData(excellent, good, fair, poor);

      mockUseQuery
        .mockReturnValueOnce({ data: { count: 0 }, isLoading: false } as any)
        .mockReturnValueOnce({ data: analyticsData, isLoading: false } as any);

      const { unmount } = render(<Analytics />);

      const progressFills = document.querySelectorAll(
        ".h-1\\.5.bg-muted.rounded-full.overflow-hidden > div"
      );

      progressFills.forEach((fill) => {
        const widthValue = parseFloat((fill as HTMLElement).style.width);
        expect(widthValue).toBeGreaterThanOrEqual(0);
        expect(widthValue).toBeLessThanOrEqual(100);
      });

      unmount();
    }
  });
});
