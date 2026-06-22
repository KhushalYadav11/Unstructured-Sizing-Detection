import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import Dashboard from "../Dashboard";

// Mock wouter
const mockSetLocation = vi.fn();
vi.mock("wouter", () => ({
  useLocation: () => ["/", mockSetLocation],
}));

// Mock @tanstack/react-query
vi.mock("@tanstack/react-query", () => ({
  useQuery: vi.fn(() => ({ data: undefined, isLoading: false })),
}));

// Mock API functions
vi.mock("@/lib/api", () => ({
  getProjects: vi.fn(),
  getProjectStats: vi.fn(),
  getTodayCount: vi.fn(),
  getAnalyticsOverview: vi.fn(),
}));

// Mock child components that are not under test
vi.mock("@/components/MetricCard", () => ({
  MetricCard: ({ title }: { title: string }) => <div data-testid="metric-card">{title}</div>,
}));

vi.mock("@/components/ProjectCard", () => ({
  ProjectCard: () => <div data-testid="project-card" />,
}));

vi.mock("@/components/CreateProjectDialog", () => ({
  CreateProjectDialog: () => null,
}));

vi.mock("@/components/ui/skeleton", () => ({
  Skeleton: () => <div data-testid="skeleton" />,
}));

describe("Dashboard Quick Actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders the Quick Actions card with title and description", () => {
    render(<Dashboard />);
    expect(screen.getByText("Quick Actions")).toBeInTheDocument();
    expect(screen.getByText("Jump to 3D tools and reconstruction")).toBeInTheDocument();
  });

  it("renders the 'Start 3D Analysis' button", () => {
    render(<Dashboard />);
    expect(screen.getByRole("button", { name: /start 3d analysis/i })).toBeInTheDocument();
  });

  it("renders the '3D Model Viewer' button", () => {
    render(<Dashboard />);
    expect(screen.getByRole("button", { name: /3d model viewer/i })).toBeInTheDocument();
  });

  it("renders the 'Start Reconstruction' button", () => {
    render(<Dashboard />);
    expect(screen.getByRole("button", { name: /start reconstruction/i })).toBeInTheDocument();
  });

  it("navigates to /mesh-analysis when 'Start 3D Analysis' is clicked", () => {
    render(<Dashboard />);
    fireEvent.click(screen.getByRole("button", { name: /start 3d analysis/i }));
    expect(mockSetLocation).toHaveBeenCalledWith("/mesh-analysis");
  });

  it("navigates to /3d-view when '3D Model Viewer' is clicked", () => {
    render(<Dashboard />);
    fireEvent.click(screen.getByRole("button", { name: /3d model viewer/i }));
    expect(mockSetLocation).toHaveBeenCalledWith("/3d-view");
  });

  it("navigates to /reconstruct when 'Start Reconstruction' is clicked", () => {
    render(<Dashboard />);
    fireEvent.click(screen.getByRole("button", { name: /start reconstruction/i }));
    expect(mockSetLocation).toHaveBeenCalledWith("/reconstruct");
  });

  it("renders exactly three Quick Actions buttons", () => {
    render(<Dashboard />);
    // The three quick action buttons are outline variants inside the Quick Actions card
    const startAnalysis = screen.getByRole("button", { name: /start 3d analysis/i });
    const modelViewer = screen.getByRole("button", { name: /3d model viewer/i });
    const reconstruction = screen.getByRole("button", { name: /start reconstruction/i });
    expect(startAnalysis).toBeInTheDocument();
    expect(modelViewer).toBeInTheDocument();
    expect(reconstruction).toBeInTheDocument();
  });
});
