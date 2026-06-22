import { useQuery } from "@tanstack/react-query";
import { MetricCard } from "@/components/MetricCard";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { QualityBadge } from "@/components/QualityBadge";
import { EmptyState } from "@/components/EmptyState";
import { COAL_TYPES } from "@/components/CoalTypeSelector";
import {
  TrendingUp,
  Scale,
  FileCheck,
  BarChart3,
  PieChart,
} from "lucide-react";
import { getTodayCount, getAnalyticsOverview } from "@/lib/api";
import { Skeleton } from "@/components/ui/skeleton";

const qualityFillColor: Record<string, string> = {
  excellent: "bg-chart-2",
  good: "bg-chart-1",
  fair: "bg-chart-3",
  poor: "bg-destructive",
};

export default function Analytics() {
  const { data: todayData } = useQuery({
    queryKey: ["/api/analytics/today"],
    queryFn: getTodayCount,
  });

  const { data: analytics, isLoading } = useQuery({
    queryKey: ["/api/analytics/overview"],
    queryFn: getAnalyticsOverview,
  });

  const todayCount = todayData?.count || 0;

  const coalDistribution = analytics
    ? Object.entries(analytics.coalTypeCount).map(([type, count]) => {
        const coalData = COAL_TYPES.find((c) => c.id === type);
        return {
          type: coalData?.name || type,
          count: count as number,
          color: "bg-chart-1",
        };
      })
    : [];

  const qualityMetrics = analytics
    ? [
        {
          rating: "excellent" as const,
          count: analytics.qualityCount.excellent || 0,
          percentage: Math.round(
            ((analytics.qualityCount.excellent || 0) / Math.max(analytics.totalMeasurements, 1)) * 100
          ),
        },
        {
          rating: "good" as const,
          count: analytics.qualityCount.good || 0,
          percentage: Math.round(
            ((analytics.qualityCount.good || 0) / Math.max(analytics.totalMeasurements, 1)) * 100
          ),
        },
        {
          rating: "fair" as const,
          count: analytics.qualityCount.fair || 0,
          percentage: Math.round(
            ((analytics.qualityCount.fair || 0) / Math.max(analytics.totalMeasurements, 1)) * 100
          ),
        },
        {
          rating: "poor" as const,
          count: analytics.qualityCount.poor || 0,
          percentage: Math.round(
            ((analytics.qualityCount.poor || 0) / Math.max(analytics.totalMeasurements, 1)) * 100
          ),
        },
      ]
    : [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Analytics</h1>
        <p className="text-muted-foreground">
          Measurement trends and quality insights
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <MetricCard
          title="Today's Measurements"
          value={todayCount}
          subtitle="Current session"
          icon={TrendingUp}
        />
        <MetricCard
          title="Total Volume"
          value={analytics ? `${analytics.totalVolume.toFixed(1)} m³` : "0 m³"}
          subtitle="All projects"
          icon={Scale}
        />
        <MetricCard
          title="Total Weight"
          value={analytics ? `${analytics.totalWeight.toFixed(1)} MT` : "0 MT"}
          subtitle="Estimated inventory"
          icon={Scale}
        />
        <MetricCard
          title="Total Measurements"
          value={analytics?.totalMeasurements || 0}
          subtitle="All time"
          icon={FileCheck}
        />
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Skeleton className="h-96" />
          <Skeleton className="h-96" />
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <PieChart className="h-5 w-5" />
                  Coal Type Distribution
                </CardTitle>
              </CardHeader>
              <CardContent className="p-5">
                {coalDistribution.length > 0 ? (
                  <div className="space-y-4">
                    {coalDistribution.map((item, index) => (
                      <div key={item.type}>
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-sm font-medium">{item.type}</span>
                          <span className="text-sm text-muted-foreground">
                            {item.count} measurements
                          </span>
                        </div>
                        <div className="h-2 bg-muted rounded-full overflow-hidden">
                          <div
                            className={`h-full bg-chart-${(index % 5) + 1}`}
                            style={{
                              width: `${(item.count / analytics!.totalMeasurements) * 100}%`,
                            }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground text-center py-8">
                    No measurements yet
                  </p>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Quality Assessment Distribution</CardTitle>
              </CardHeader>
              <CardContent className="p-5">
                {analytics && analytics.totalMeasurements > 0 ? (
                  <div className="space-y-4">
                    {qualityMetrics.map((metric) => (
                      <div key={metric.rating} className="space-y-1.5">
                        <div className="flex items-center justify-between">
                          <QualityBadge rating={metric.rating} />
                          <span className="text-sm font-mono font-medium">{metric.count}</span>
                        </div>
                        <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                          <div
                            className={qualityFillColor[metric.rating]}
                            style={{ width: `${metric.percentage}%` }}
                          />
                        </div>
                        <p className="text-xs text-muted-foreground">{metric.percentage}% of total</p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <EmptyState
                    icon={BarChart3}
                    title="No data yet"
                    description="Measurements will appear here once recorded"
                  />
                )}
              </CardContent>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
