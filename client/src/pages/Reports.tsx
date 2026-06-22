import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ReportConfigDialog } from "@/components/ReportConfigDialog";
import { FileText, Download, Calendar, Plus } from "lucide-react";
import { EmptyState } from "@/components/EmptyState";

export default function Reports() {
  const [showConfigDialog, setShowConfigDialog] = useState(false);

  // TODO: replace with API call — fetches list of generated reports
  const recentReports = [
    {
      id: "1",
      name: "South Stockpile - Detailed Report",
      date: "Oct 3, 2025",
      format: "PDF",
      size: "2.4 MB",
    },
    {
      id: "2",
      name: "North Yard - Executive Summary",
      date: "Oct 2, 2025",
      format: "PDF",
      size: "1.8 MB",
    },
    {
      id: "3",
      name: "Weekly Assessment Data",
      date: "Sep 30, 2025",
      format: "CSV",
      size: "450 KB",
    },
    {
      id: "4",
      name: "East Terminal - Compliance Report",
      date: "Sep 28, 2025",
      format: "Excel",
      size: "3.1 MB",
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Reports</h1>
          <p className="text-muted-foreground">
            Generate and manage assessment reports
          </p>
        </div>
        <Button
          onClick={() => setShowConfigDialog(true)}
          data-testid="button-generate-report"
        >
          <Plus className="h-4 w-4 mr-2" />
          Generate Report
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Total Reports
            </CardTitle>
            <FileText className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {/* TODO: replace with real data */}
            <div className="text-2xl font-bold">24</div>
            <p className="text-xs text-muted-foreground mt-1">
              All time generated
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              This Month
            </CardTitle>
            <Calendar className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {/* TODO: replace with real data */}
            <div className="text-2xl font-bold">8</div>
            <p className="text-xs text-muted-foreground mt-1">
              +33% from last month
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              PDF Reports
            </CardTitle>
            <FileText className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {/* TODO: replace with real data */}
            <div className="text-2xl font-bold">18</div>
            <p className="text-xs text-muted-foreground mt-1">75% of total</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Data Exports
            </CardTitle>
            <Download className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {/* TODO: replace with real data */}
            <div className="text-2xl font-bold">6</div>
            <p className="text-xs text-muted-foreground mt-1">CSV & Excel</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Recent Reports</CardTitle>
        </CardHeader>
        <CardContent className="p-5">
          {recentReports.length === 0 ? (
            <EmptyState
              icon={FileText}
              title="No reports yet"
              description="Generate your first report using the button above"
            />
          ) : (
          <div className="space-y-3">
            {recentReports.map((report) => (
              <div
                key={report.id}
                className="flex items-center justify-between p-4 rounded-lg border transition-shadow hover:shadow-md cursor-pointer"
                onClick={() => console.log("Download report:", report.id)}
                data-testid={`report-${report.id}`}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="h-10 w-10 rounded-md bg-primary/10 flex items-center justify-center flex-shrink-0">
                    <FileText className="h-5 w-5 text-primary" />
                  </div>
                  <div className="min-w-0">
                    <h3 className="font-medium truncate">{report.name}</h3>
                    <p className="text-sm text-muted-foreground">
                      {report.date} • {report.size}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3 flex-shrink-0">
                  <Badge variant="secondary">{report.format}</Badge>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={(e) => {
                      e.stopPropagation();
                      console.log("Download clicked:", report.id);
                    }}
                    data-testid="button-download"
                  >
                    <Download className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
          )}
        </CardContent>
      </Card>

      <ReportConfigDialog
        open={showConfigDialog}
        onOpenChange={setShowConfigDialog}
        onGenerate={(config) => {
          console.log("Report generated with config:", config);
        }}
      />
    </div>
  );
}
