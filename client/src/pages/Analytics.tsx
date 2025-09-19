import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { TrendingUp, TrendingDown, Minus, Activity, AlertTriangle, CheckCircle, Clock } from "lucide-react";

interface ComplianceHistoryAnalysis {
  overallTrend: 'improving' | 'declining' | 'stable';
  scoreChange: number;
  lastMeasurement: any;
  improvementVelocity: number;
  riskTrend: 'decreasing' | 'increasing' | 'stable';
  keyImprovements: any[];
  recommendedActions: string[];
}

interface TrendComparison {
  period: string;
  scoreImprovement: number;
  gapReduction: number;
  riskLevelChange: string;
  regulationBreakdown: {
    regulation: string;
    scoreChange: number;
    trend: 'improving' | 'declining' | 'stable';
  }[];
}

export default function Analytics() {
  const { data: complianceHistory, isLoading: historyLoading } = useQuery<ComplianceHistoryAnalysis>({
    queryKey: ['/api/analytics/compliance-history'],
    retry: false,
  });

  const { data: trendComparisons, isLoading: trendsLoading } = useQuery<TrendComparison[]>({
    queryKey: ['/api/analytics/trend-comparison'],
    retry: false,
  });

  const { data: improvementSuggestions, isLoading: suggestionsLoading } = useQuery<{ suggestions: string[] }>({
    queryKey: ['/api/analytics/improvement-suggestions'],
    retry: false,
  });

  const getTrendIcon = (trend: string) => {
    switch (trend) {
      case 'improving': return <TrendingUp className="h-4 w-4 text-green-500" />;
      case 'declining': return <TrendingDown className="h-4 w-4 text-red-500" />;
      default: return <Minus className="h-4 w-4 text-gray-500" />;
    }
  };

  const getTrendColor = (trend: string) => {
    switch (trend) {
      case 'improving': return 'text-green-600 bg-green-50 border-green-200';
      case 'declining': return 'text-red-600 bg-red-50 border-red-200';
      default: return 'text-gray-600 bg-gray-50 border-gray-200';
    }
  };

  const getRiskTrendColor = (trend: string) => {
    switch (trend) {
      case 'decreasing': return 'text-green-600 bg-green-50 border-green-200';
      case 'increasing': return 'text-red-600 bg-red-50 border-red-200';
      default: return 'text-gray-600 bg-gray-50 border-gray-200';
    }
  };

  const formatPeriod = (period: string) => {
    return period.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
  };

  if (historyLoading || trendsLoading || suggestionsLoading) {
    return (
      <div className="space-y-6 p-6">
        <div>
          <h1 className="text-2xl font-bold mb-2">Compliance Analytics</h1>
          <p className="text-gray-600">Track your compliance improvements over time</p>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Card key={i}>
              <CardHeader className="pb-3">
                <Skeleton className="h-4 w-24" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-8 w-16 mb-2" />
                <Skeleton className="h-3 w-32" />
              </CardContent>
            </Card>
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card>
            <CardHeader>
              <Skeleton className="h-6 w-48" />
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {Array.from({ length: 3 }).map((_, i) => (
                  <Skeleton key={i} className="h-4 w-full" />
                ))}
              </div>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader>
              <Skeleton className="h-6 w-48" />
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {Array.from({ length: 4 }).map((_, i) => (
                  <Skeleton key={i} className="h-4 w-full" />
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  const hasData = complianceHistory?.lastMeasurement || (trendComparisons && trendComparisons.length > 0);

  if (!hasData) {
    return (
      <div className="space-y-6 p-6">
        <div>
          <h1 className="text-2xl font-bold mb-2">Compliance Analytics</h1>
          <p className="text-gray-600">Track your compliance improvements over time</p>
        </div>

        <Card className="text-center py-12">
          <CardContent>
            <Activity className="h-16 w-16 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-semibold mb-2">No Analytics Data Available</h3>
            <p className="text-gray-600 mb-6 max-w-md mx-auto">
              Upload and analyze policy documents to start tracking your compliance trends and improvements over time.
            </p>
            <Button data-testid="button-upload-policy" onClick={() => window.location.href = '/'}>
              Upload Your First Policy Document
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6" data-testid="analytics-dashboard">
      <div>
        <h1 className="text-2xl font-bold mb-2">Compliance Analytics</h1>
        <p className="text-gray-600">Track your compliance improvements over time</p>
      </div>

      {/* Key Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card data-testid="card-overall-trend">
          <CardHeader className="pb-3">
            <CardDescription>Overall Trend</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center space-x-2">
              {getTrendIcon(complianceHistory?.overallTrend || 'stable')}
              <span className="text-2xl font-bold capitalize">
                {complianceHistory?.overallTrend || 'Stable'}
              </span>
            </div>
            <p className="text-sm text-gray-600 mt-1">
              {complianceHistory?.scoreChange ? 
                `${complianceHistory.scoreChange > 0 ? '+' : ''}${complianceHistory.scoreChange.toFixed(1)}% change` : 
                'No change recorded'
              }
            </p>
          </CardContent>
        </Card>

        <Card data-testid="card-improvement-velocity">
          <CardHeader className="pb-3">
            <CardDescription>Improvement Velocity</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center space-x-2">
              <Clock className="h-4 w-4 text-blue-500" />
              <span className="text-2xl font-bold">
                {complianceHistory?.improvementVelocity ? 
                  `${complianceHistory.improvementVelocity.toFixed(1)}%` : 
                  '0%'
                }
              </span>
            </div>
            <p className="text-sm text-gray-600 mt-1">Per month improvement rate</p>
          </CardContent>
        </Card>

        <Card data-testid="card-risk-trend">
          <CardHeader className="pb-3">
            <CardDescription>Risk Trend</CardDescription>
          </CardHeader>
          <CardContent>
            <Badge 
              className={`${getRiskTrendColor(complianceHistory?.riskTrend || 'stable')} capitalize`}
              data-testid={`badge-risk-${complianceHistory?.riskTrend || 'stable'}`}
            >
              {complianceHistory?.riskTrend || 'Stable'}
            </Badge>
            <p className="text-sm text-gray-600 mt-2">
              {complianceHistory?.lastMeasurement ? 
                `Current: ${complianceHistory.lastMeasurement.riskLevel}` : 
                'No data available'
              }
            </p>
          </CardContent>
        </Card>

        <Card data-testid="card-key-improvements">
          <CardHeader className="pb-3">
            <CardDescription>Key Improvements</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center space-x-2">
              <CheckCircle className="h-4 w-4 text-green-500" />
              <span className="text-2xl font-bold">
                {complianceHistory?.keyImprovements?.length || 0}
              </span>
            </div>
            <p className="text-sm text-gray-600 mt-1">Recent improvements made</p>
          </CardContent>
        </Card>
      </div>

      {/* Period Comparisons */}
      {trendComparisons && trendComparisons.length > 0 && (
        <Card data-testid="card-period-comparisons">
          <CardHeader>
            <CardTitle>Period Comparisons</CardTitle>
            <CardDescription>
              Compare your compliance progress across different time periods
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {trendComparisons.map((comparison, index) => (
                <div key={index} className="flex items-center justify-between p-4 border rounded-lg" data-testid={`comparison-${comparison.period}`}>
                  <div>
                    <h4 className="font-medium">{formatPeriod(comparison.period)}</h4>
                    <p className="text-sm text-gray-600">
                      Score: {comparison.scoreImprovement > 0 ? '+' : ''}{comparison.scoreImprovement.toFixed(1)}% | 
                      Gaps: {comparison.gapReduction > 0 ? '-' : '+'}{Math.abs(comparison.gapReduction)} | 
                      Risk: {comparison.riskLevelChange}
                    </p>
                  </div>
                  <Badge 
                    className={getTrendColor(
                      comparison.scoreImprovement > 5 ? 'improving' : 
                      comparison.scoreImprovement < -5 ? 'declining' : 'stable'
                    )}
                    data-testid={`badge-trend-${comparison.period}`}
                  >
                    {comparison.scoreImprovement > 5 ? 'Improving' : 
                     comparison.scoreImprovement < -5 ? 'Declining' : 'Stable'}
                  </Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Recommendations */}
      {improvementSuggestions?.suggestions && improvementSuggestions.suggestions.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card data-testid="card-recommendations">
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <AlertTriangle className="h-5 w-5 text-orange-500" />
                <span>Improvement Recommendations</span>
              </CardTitle>
              <CardDescription>
                AI-powered suggestions based on your compliance history
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ul className="space-y-3">
                {improvementSuggestions.suggestions.map((suggestion, index) => (
                  <li key={index} className="flex items-start space-x-2" data-testid={`suggestion-${index}`}>
                    <div className="w-2 h-2 bg-blue-500 rounded-full mt-2 flex-shrink-0"></div>
                    <span className="text-sm">{suggestion}</span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>

          <Card data-testid="card-latest-measurement">
            <CardHeader>
              <CardTitle>Latest Measurement</CardTitle>
              <CardDescription>
                Most recent compliance assessment details
              </CardDescription>
            </CardHeader>
            <CardContent>
              {complianceHistory?.lastMeasurement ? (
                <div className="space-y-3">
                  <div className="flex justify-between">
                    <span className="text-sm font-medium">Overall Score</span>
                    <span className="text-sm">{complianceHistory.lastMeasurement.overallScore.toFixed(1)}%</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm font-medium">Risk Level</span>
                    <Badge variant={complianceHistory.lastMeasurement.riskLevel === 'High' ? 'destructive' : 'secondary'}>
                      {complianceHistory.lastMeasurement.riskLevel}
                    </Badge>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm font-medium">Gap Count</span>
                    <span className="text-sm">{complianceHistory.lastMeasurement.gapCount}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm font-medium">Business Impact Score</span>
                    <span className="text-sm">{complianceHistory.lastMeasurement.businessImpactScore?.toFixed(1) || 'N/A'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm font-medium">Remediation Urgency</span>
                    <Badge variant={complianceHistory.lastMeasurement.remediationUrgency === 'Immediate' ? 'destructive' : 'outline'}>
                      {complianceHistory.lastMeasurement.remediationUrgency}
                    </Badge>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-gray-600">No measurement data available</p>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}