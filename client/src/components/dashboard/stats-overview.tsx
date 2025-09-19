import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import { CheckCircle, AlertTriangle, Shield } from "lucide-react";

interface StatsOverviewProps {
  stats: any;
  isLoading: boolean;
}

export default function StatsOverview({ stats, isLoading }: StatsOverviewProps) {
  if (isLoading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {[1, 2, 3].map((i) => (
          <Card key={i}>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div className="space-y-2">
                  <Skeleton className="h-4 w-24" />
                  <Skeleton className="h-8 w-16" />
                </div>
                <Skeleton className="w-12 h-12 rounded-full" />
              </div>
              <Skeleton className="h-2 w-full mt-4" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  const getScoreColor = (score: number) => {
    if (score >= 80) return "text-green-600";
    if (score >= 60) return "text-yellow-600";
    return "text-red-600";
  };

  const getRiskColor = (risk: string) => {
    switch (risk) {
      case "Low": return "text-green-600";
      case "Medium": return "text-yellow-600";
      case "High": return "text-red-600";
      default: return "text-gray-600";
    }
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
      {/* Compliance Score Card */}
      <Card>
        <CardContent className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-muted-foreground">Overall Compliance</p>
              <p className={`text-3xl font-bold ${getScoreColor(stats?.complianceScore || 0)}`} data-testid="text-compliance-score">
                {stats?.complianceScore || 0}%
              </p>
            </div>
            <div className="w-12 h-12 bg-gradient-to-br from-green-500 to-green-600 rounded-full flex items-center justify-center">
              <CheckCircle className="text-white text-lg w-6 h-6" />
            </div>
          </div>
          <div className="mt-4">
            <Progress 
              value={stats?.complianceScore || 0} 
              className="w-full h-2"
              data-testid="progress-compliance"
            />
          </div>
        </CardContent>
      </Card>

      {/* Gap Analysis Card */}
      <Card>
        <CardContent className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-muted-foreground">Identified Gaps</p>
              <p className="text-3xl font-bold text-foreground" data-testid="text-gap-count">
                {stats?.gapCount || 0}
              </p>
            </div>
            <div className="w-12 h-12 bg-gradient-to-br from-yellow-500 to-yellow-600 rounded-full flex items-center justify-center">
              <AlertTriangle className="text-white text-lg w-6 h-6" />
            </div>
          </div>
          <p className="text-sm text-muted-foreground mt-2">Requiring attention</p>
        </CardContent>
      </Card>

      {/* Risk Level Card */}
      <Card>
        <CardContent className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-muted-foreground">Risk Level</p>
              <p className={`text-2xl font-bold ${getRiskColor(stats?.riskLevel)}`} data-testid="text-risk-level">
                {stats?.riskLevel || "Unknown"}
              </p>
            </div>
            <div className="w-12 h-12 bg-gradient-to-br from-red-500 to-red-600 rounded-full flex items-center justify-center">
              <Shield className="text-white text-lg w-6 h-6" />
            </div>
          </div>
          <p className="text-sm text-muted-foreground mt-2">Based on CCPA analysis</p>
        </CardContent>
      </Card>
    </div>
  );
}
