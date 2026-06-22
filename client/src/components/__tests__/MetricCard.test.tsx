import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { BarChart3, TrendingUp } from "lucide-react";
import { MetricCard } from "../MetricCard";

describe("MetricCard", () => {
  it("renders the Icon_Badge wrapper when icon prop is provided", () => {
    const { container } = render(
      <MetricCard title="Total Volume" value="1,234" icon={BarChart3} />
    );

    // Icon_Badge: h-8 w-8 rounded-md bg-primary/10
    const badge = container.querySelector(
      ".h-8.w-8.rounded-md"
    );
    expect(badge).not.toBeNull();
    expect(badge!.className).toContain("bg-primary");
  });

  it("does not apply text-muted-foreground to the icon when icon prop is provided", () => {
    const { container } = render(
      <MetricCard title="Total Volume" value="1,234" icon={BarChart3} />
    );

    // The icon SVG should be inside the badge and use text-primary, not text-muted-foreground
    const badge = container.querySelector(".h-8.w-8.rounded-md");
    expect(badge).not.toBeNull();

    // The icon element (svg) inside the badge should not have text-muted-foreground
    const iconEl = badge!.querySelector("svg");
    expect(iconEl).not.toBeNull();
    expect(iconEl!.className.baseVal ?? iconEl!.getAttribute("class") ?? "").not.toContain(
      "text-muted-foreground"
    );
  });

  it("does not render an Icon_Badge when no icon prop is provided", () => {
    const { container } = render(
      <MetricCard title="Total Volume" value="1,234" />
    );

    const badge = container.querySelector(".h-8.w-8.rounded-md");
    expect(badge).toBeNull();
  });

  it("renders the title and value", () => {
    render(<MetricCard title="Coal Weight" value="5,678 kg" icon={BarChart3} />);

    expect(screen.getByText("Coal Weight")).toBeInTheDocument();
    expect(screen.getByText("5,678 kg")).toBeInTheDocument();
  });

  it("renders TrendingUp icon and positive percentage when trend.isPositive is true", () => {
    const { container } = render(
      <MetricCard
        title="Volume"
        value="100"
        trend={{ value: 12, isPositive: true }}
      />
    );

    expect(screen.getByText("+12%")).toBeInTheDocument();
    // TrendingUp SVG should be present inside the trend span
    const trendSpan = container.querySelector(".text-chart-2");
    expect(trendSpan).not.toBeNull();
    expect(trendSpan!.querySelector("svg")).not.toBeNull();
  });

  it("renders TrendingDown icon and negative percentage when trend.isPositive is false", () => {
    const { container } = render(
      <MetricCard
        title="Volume"
        value="100"
        trend={{ value: 5, isPositive: false }}
      />
    );

    expect(screen.getByText("5%")).toBeInTheDocument();
    const trendSpan = container.querySelector(".text-destructive");
    expect(trendSpan).not.toBeNull();
    expect(trendSpan!.querySelector("svg")).not.toBeNull();
  });

  it("uses pb-3 on CardHeader", () => {
    const { container } = render(
      <MetricCard title="Total Volume" value="1,234" />
    );

    // The CardHeader div should contain pb-3
    const header = container.querySelector(".pb-3");
    expect(header).not.toBeNull();
  });
});
