import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { 
  BarChart3, 
  ArrowRight, 
  Settings, 
  AlertTriangle, 
  CheckCircle,
  ExternalLink,
  RefreshCw,
  Download
} from "lucide-react";

interface AnalysisResultsProps {
  reports: any[];
  isLoading: boolean;
}

export default function AnalysisResults({ reports, isLoading }: AnalysisResultsProps) {
  const { toast } = useToast();
  const latestReport = reports?.[0];
  const isProcessing = latestReport?.status === "processing";

  const handleDownloadPDF = async (reportId: string) => {
    try {
      const response = await fetch(`/api/reports/${reportId}/pdf`, {
        credentials: "include",
      });
      
      if (!response.ok) {
        throw new Error("Failed to download PDF");
      }
      
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `compliance-report-${reportId}.pdf`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      
      toast({
        title: "Download Started",
        description: "Your compliance report PDF is downloading.",
      });
    } catch (error) {
      toast({
        title: "Download Failed",
        description: "Failed to download the PDF report.",
        variant: "destructive",
      });
    }
  };

  const getRiskBadgeVariant = (riskLevel: string) => {
    switch (riskLevel) {
      case "High":
        return "destructive";
      case "Medium":
        return "secondary";
      case "Low":
        return "default";
      default:
        return "outline";
    }
  };

  const getRiskIcon = (riskLevel: string) => {
    switch (riskLevel) {
      case "High":
        return <AlertTriangle className="w-4 h-4 text-red-500" />;
      case "Medium":
        return <AlertTriangle className="w-4 h-4 text-yellow-500" />;
      case "Low":
        return <CheckCircle className="w-4 h-4 text-green-500" />;
      default:
        return <AlertTriangle className="w-4 h-4 text-gray-500" />;
    }
  };

  return (
    <Card>
      <CardHeader className="pb-4 border-b border-border">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center space-x-2">
            <BarChart3 className="w-5 h-5" />
            <span>Compliance Analysis Results</span>
          </CardTitle>
          <Button 
            variant="ghost" 
            size="sm"
            onClick={() => window.location.href = "/reports"}
            data-testid="button-view-all-reports"
          >
            View All Reports <ArrowRight className="w-4 h-4 ml-1" />
          </Button>
        </div>
      </CardHeader>
      
      <CardContent className="p-6">
        {isLoading ? (
          <div className="space-y-4">
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-32 w-full" />
            <Skeleton className="h-16 w-full" />
          </div>
        ) : !reports || reports.length === 0 ? (
          <div className="text-center py-12">
            <BarChart3 className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-lg font-medium text-foreground mb-2">No Analysis Available</h3>
            <p className="text-muted-foreground mb-4">
              Upload a policy document to start your first compliance analysis.
            </p>
            <Button 
              onClick={() => window.location.href = "/upload"}
              data-testid="button-start-analysis"
            >
              Upload Policy Document
            </Button>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Analysis Status */}
            {isProcessing && (
              <div className="p-4 bg-muted rounded-lg border-l-4 border-l-blue-500">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-3">
                    <div className="w-8 h-8 bg-blue-500 rounded-full flex items-center justify-center">
                      <Settings className="text-white text-sm w-4 h-4 animate-spin" />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-foreground" data-testid="text-analysis-status">
                        Analysis in Progress
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Privacy Policy vs. CCPA Requirements
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-medium text-foreground">Processing...</p>
                    <p className="text-xs text-muted-foreground">Please wait</p>
                  </div>
                </div>
                <div className="mt-3">
                  <Progress 
                    value={75} 
                    className="w-full h-2"
                    data-testid="progress-analysis"
                  />
                </div>
              </div>
            )}

            {/* Latest Completed Analysis */}
            {latestReport && latestReport.status === "completed" && (
              <div className="space-y-4">
                <h4 className="font-medium text-foreground">Latest Analysis Results</h4>
                
                <div className="border border-border rounded-lg p-4 hover:shadow-md transition-shadow">
                  <div className="flex items-start justify-between">
                    <div className="flex items-start space-x-3">
                      {getRiskIcon(latestReport.riskLevel)}
                      <div className="flex-1">
                        <div className="flex items-center space-x-2 mb-2">
                          <h4 className="text-sm font-semibold text-foreground">
                            Overall Compliance Analysis
                          </h4>
                          <Badge variant={getRiskBadgeVariant(latestReport.riskLevel)}>
                            {latestReport.riskLevel} Risk
                          </Badge>
                        </div>
                        <p className="text-sm text-muted-foreground mb-3">
                          Compliance score: {Math.round(latestReport.overallScore || 0)}% | 
                          Gaps identified: {latestReport.gapCount || 0}
                        </p>
                        <div className="bg-muted p-3 rounded-md">
                          <p className="text-xs font-medium text-foreground mb-1">
                            Analysis Summary:
                          </p>
                          <p className="text-xs text-muted-foreground">
                            Your policy has been analyzed against CCPA requirements. 
                            {latestReport.gapCount > 0 
                              ? ` ${latestReport.gapCount} areas need attention.`
                              : " No major gaps identified."
                            }
                          </p>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center space-x-2 ml-4">
                      <span className="text-xs text-muted-foreground">
                        {new Date(latestReport.completedAt || latestReport.createdAt).toLocaleDateString()}
                      </span>
                      <div className="flex space-x-2">
                        <Button 
                          variant="outline" 
                          size="sm"
                          onClick={() => handleDownloadPDF(latestReport.id)}
                          data-testid="button-download-pdf"
                          title="Download PDF Report"
                        >
                          <Download className="w-3 h-3" />
                        </Button>
                        <Button 
                          variant="outline" 
                          size="sm"
                          onClick={() => window.location.href = `/reports/${latestReport.id}`}
                          data-testid="button-view-details"
                        >
                          <ExternalLink className="w-3 h-3 mr-1" />
                          Details
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Action Buttons */}
            <div className="flex items-center justify-between pt-4 border-t border-border">
              <div className="text-sm text-muted-foreground">
                {latestReport?.completedAt ? (
                  <>Analysis completed: {new Date(latestReport.completedAt).toLocaleDateString()}</>
                ) : (
                  <>Last updated: {new Date().toLocaleDateString()}</>
                )}
              </div>
              <div className="flex space-x-3">
                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={() => window.location.href = "/reports"}
                  data-testid="button-all-reports"
                >
                  <BarChart3 className="w-4 h-4 mr-2" />
                  All Reports
                </Button>
                <Button 
                  size="sm"
                  onClick={() => window.location.href = "/upload"}
                  data-testid="button-new-analysis"
                >
                  <RefreshCw className="w-4 h-4 mr-2" />
                  New Analysis
                </Button>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
