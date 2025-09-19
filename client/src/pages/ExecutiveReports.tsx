import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { 
  TrendingUp, 
  TrendingDown, 
  AlertTriangle, 
  Shield, 
  FileText, 
  Calendar,
  DollarSign,
  Users,
  CheckCircle,
  XCircle,
  Clock,
  Download
} from "lucide-react";

interface ExecutiveSummary {
  organizationName: string;
  reportPeriod: string;
  generatedAt: string;
  overallComplianceScore: number;
  riskDistribution: {
    critical: number;
    high: number;
    medium: number;
    low: number;
  };
  totalPoliciesAnalyzed: number;
  totalGapsIdentified: number;
  priorityActions: string[];
  regulatoryBreakdown: {
    regulation: string;
    score: number;
    status: 'Compliant' | 'Needs Attention' | 'Critical';
    keyIssues: string[];
  }[];
  complianceTrend: 'Improving' | 'Declining' | 'Stable';
  businessImpactAssessment: {
    potentialFineExposure: string;
    reputationalRisk: 'Low' | 'Medium' | 'High' | 'Critical';
    operationalImpact: string;
  };
  keyRecommendations: string[];
  auditTrail: any[];
}

interface DetailedComplianceReport {
  executiveSummary: ExecutiveSummary;
  policyDetails: any[];
  regulationComparison: any[];
  improvementRoadmap: {
    immediate: string[];
    shortTerm: string[];
    longTerm: string[];
  };
  nextReviewDate: string;
}

export default function ExecutiveReports() {
  const { data: executiveSummary, isLoading: summaryLoading } = useQuery<ExecutiveSummary>({
    queryKey: ['/api/reports/executive-summary'],
    retry: false,
  });

  const { data: detailedReport, isLoading: detailLoading } = useQuery<DetailedComplianceReport>({
    queryKey: ['/api/reports/detailed-compliance'],
    retry: false,
  });

  const getRiskColor = (risk: string) => {
    switch (risk) {
      case 'Critical': return 'bg-red-100 text-red-800 border-red-200';
      case 'High': return 'bg-orange-100 text-orange-800 border-orange-200';
      case 'Medium': return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      case 'Low': return 'bg-green-100 text-green-800 border-green-200';
      default: return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'Compliant': return 'bg-green-100 text-green-800 border-green-200';
      case 'Needs Attention': return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      case 'Critical': return 'bg-red-100 text-red-800 border-red-200';
      default: return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  const getTrendIcon = (trend: string) => {
    switch (trend) {
      case 'Improving': return <TrendingUp className="h-4 w-4 text-green-500" />;
      case 'Declining': return <TrendingDown className="h-4 w-4 text-red-500" />;
      default: return <div className="h-4 w-4 bg-gray-400 rounded-full" />;
    }
  };

  if (summaryLoading || detailLoading) {
    return (
      <div className="h-full overflow-auto">
          <header className="bg-card border-b border-border px-6 py-4">
            <div>
              <h1 className="text-2xl font-bold mb-2">Executive Reports</h1>
              <p className="text-gray-600">Comprehensive compliance insights for executive decision making</p>
            </div>
          </header>
          
          <main className="p-6">
            <div className="space-y-6">
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
                {Array.from({ length: 4 }).map((_, i) => (
                  <Card key={i}>
                    <CardHeader>
                      <Skeleton className="h-6 w-48" />
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-3">
                        {Array.from({ length: 3 }).map((_, j) => (
                          <Skeleton key={j} className="h-4 w-full" />
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          </main>
      </div>
    );
  }

  if (!executiveSummary) {
    return (
      <div className="h-full overflow-auto">
          <header className="bg-card border-b border-border px-6 py-4">
            <div>
              <h1 className="text-2xl font-bold mb-2">Executive Reports</h1>
              <p className="text-gray-600">Comprehensive compliance insights for executive decision making</p>
            </div>
          </header>
          
          <main className="p-6">
            <Card className="text-center py-12">
              <CardContent>
                <FileText className="h-16 w-16 text-gray-400 mx-auto mb-4" />
                <h3 className="text-lg font-semibold mb-2">No Executive Reports Available</h3>
                <p className="text-gray-600 mb-6 max-w-md mx-auto">
                  Upload and analyze policy documents to generate comprehensive executive compliance reports.
                </p>
                <Button data-testid="button-upload-policy" onClick={() => window.location.href = '/upload'}>
                  Upload Policy Documents
                </Button>
              </CardContent>
            </Card>
          </main>
      </div>
    );
  }

  return (
    <div className="h-full overflow-auto">
        <header className="bg-card border-b border-border px-6 py-4">
          <div className="flex justify-between items-start">
            <div>
              <h1 className="text-2xl font-bold mb-2" data-testid="text-page-title">Executive Reports</h1>
              <p className="text-gray-600">Comprehensive compliance insights for {executiveSummary.organizationName}</p>
              <p className="text-sm text-gray-500 mt-1">Report Period: {executiveSummary.reportPeriod}</p>
            </div>
            <div className="flex space-x-2">
              <Button variant="outline" size="sm" data-testid="button-download-summary">
                <Download className="w-4 h-4 mr-2" />
                Download Summary
              </Button>
              <Button variant="outline" size="sm" data-testid="button-schedule-review">
                <Calendar className="w-4 h-4 mr-2" />
                Schedule Review
              </Button>
            </div>
          </div>
        </header>

        <main className="p-6">
          <Tabs defaultValue="overview" className="w-full">
            <TabsList className="grid w-full grid-cols-4 mb-6">
              <TabsTrigger value="overview" data-testid="tab-overview">Overview</TabsTrigger>
              <TabsTrigger value="regulatory" data-testid="tab-regulatory">Regulatory</TabsTrigger>
              <TabsTrigger value="roadmap" data-testid="tab-roadmap">Roadmap</TabsTrigger>
              <TabsTrigger value="audit" data-testid="tab-audit">Audit Trail</TabsTrigger>
            </TabsList>

            {/* Overview Tab */}
            <TabsContent value="overview">
              <div className="space-y-6">
                {/* Key Metrics */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                  <Card data-testid="card-compliance-score">
                    <CardHeader className="pb-3">
                      <CardDescription>Overall Compliance Score</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="flex items-center space-x-2">
                        <span className="text-3xl font-bold text-primary">
                          {executiveSummary.overallComplianceScore}%
                        </span>
                        {getTrendIcon(executiveSummary.complianceTrend)}
                      </div>
                      <p className="text-sm text-gray-600 mt-1 capitalize">
                        {executiveSummary.complianceTrend} trend
                      </p>
                    </CardContent>
                  </Card>

                  <Card data-testid="card-policies-analyzed">
                    <CardHeader className="pb-3">
                      <CardDescription>Policies Analyzed</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="flex items-center space-x-2">
                        <FileText className="h-4 w-4 text-blue-500" />
                        <span className="text-3xl font-bold">{executiveSummary.totalPoliciesAnalyzed}</span>
                      </div>
                      <p className="text-sm text-gray-600 mt-1">Total documents</p>
                    </CardContent>
                  </Card>

                  <Card data-testid="card-gaps-identified">
                    <CardHeader className="pb-3">
                      <CardDescription>Gaps Identified</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="flex items-center space-x-2">
                        <AlertTriangle className="h-4 w-4 text-orange-500" />
                        <span className="text-3xl font-bold">{executiveSummary.totalGapsIdentified}</span>
                      </div>
                      <p className="text-sm text-gray-600 mt-1">Compliance gaps</p>
                    </CardContent>
                  </Card>

                  <Card data-testid="card-risk-level">
                    <CardHeader className="pb-3">
                      <CardDescription>Risk Distribution</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-1">
                        <div className="flex justify-between text-sm">
                          <span>Critical</span>
                          <span className="font-medium text-red-600">{executiveSummary.riskDistribution.critical}</span>
                        </div>
                        <div className="flex justify-between text-sm">
                          <span>High</span>
                          <span className="font-medium text-orange-600">{executiveSummary.riskDistribution.high}</span>
                        </div>
                        <div className="flex justify-between text-sm">
                          <span>Medium</span>
                          <span className="font-medium text-yellow-600">{executiveSummary.riskDistribution.medium}</span>
                        </div>
                        <div className="flex justify-between text-sm">
                          <span>Low</span>
                          <span className="font-medium text-green-600">{executiveSummary.riskDistribution.low}</span>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </div>

                {/* Business Impact & Priority Actions */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  <Card data-testid="card-business-impact">
                    <CardHeader>
                      <CardTitle className="flex items-center space-x-2">
                        <DollarSign className="h-5 w-5 text-orange-500" />
                        <span>Business Impact Assessment</span>
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div>
                        <Label className="text-sm font-medium">Potential Fine Exposure</Label>
                        <p className="text-lg font-semibold text-red-600">
                          {executiveSummary.businessImpactAssessment.potentialFineExposure}
                        </p>
                      </div>
                      <div>
                        <Label className="text-sm font-medium">Reputational Risk</Label>
                        <Badge className={getRiskColor(executiveSummary.businessImpactAssessment.reputationalRisk)}>
                          {executiveSummary.businessImpactAssessment.reputationalRisk}
                        </Badge>
                      </div>
                      <div>
                        <Label className="text-sm font-medium">Operational Impact</Label>
                        <p className="text-sm text-gray-600">
                          {executiveSummary.businessImpactAssessment.operationalImpact}
                        </p>
                      </div>
                    </CardContent>
                  </Card>

                  <Card data-testid="card-priority-actions">
                    <CardHeader>
                      <CardTitle className="flex items-center space-x-2">
                        <AlertTriangle className="h-5 w-5 text-red-500" />
                        <span>Priority Actions</span>
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <ul className="space-y-3">
                        {executiveSummary.priorityActions.map((action, index) => (
                          <li key={index} className="flex items-start space-x-2" data-testid={`action-${index}`}>
                            <div className={`w-2 h-2 rounded-full mt-2 flex-shrink-0 ${
                              action.includes('IMMEDIATE') ? 'bg-red-500' : 
                              action.includes('urgent') ? 'bg-orange-500' : 'bg-yellow-500'
                            }`}></div>
                            <span className="text-sm">{action}</span>
                          </li>
                        ))}
                      </ul>
                    </CardContent>
                  </Card>
                </div>

                {/* Key Recommendations */}
                <Card data-testid="card-recommendations">
                  <CardHeader>
                    <CardTitle className="flex items-center space-x-2">
                      <CheckCircle className="h-5 w-5 text-green-500" />
                      <span>Key Recommendations</span>
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {executiveSummary.keyRecommendations.map((recommendation, index) => (
                        <div key={index} className="flex items-start space-x-2" data-testid={`recommendation-${index}`}>
                          <CheckCircle className="w-4 h-4 text-green-500 mt-0.5 flex-shrink-0" />
                          <span className="text-sm">{recommendation}</span>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              </div>
            </TabsContent>

            {/* Regulatory Tab */}
            <TabsContent value="regulatory">
              <div className="space-y-6">
                <Card data-testid="card-regulatory-breakdown">
                  <CardHeader>
                    <CardTitle>Regulatory Compliance Breakdown</CardTitle>
                    <CardDescription>
                      Detailed analysis of compliance status across key regulations
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-6">
                      {executiveSummary.regulatoryBreakdown.map((regulation, index) => (
                        <div key={index} className="border rounded-lg p-4" data-testid={`regulation-${index}`}>
                          <div className="flex items-center justify-between mb-3">
                            <h4 className="font-semibold text-lg">{regulation.regulation}</h4>
                            <div className="flex items-center space-x-3">
                              <span className="text-2xl font-bold">{regulation.score}%</span>
                              <Badge className={getStatusColor(regulation.status)}>
                                {regulation.status}
                              </Badge>
                            </div>
                          </div>
                          
                          {regulation.keyIssues.length > 0 && (
                            <div>
                              <Label className="text-sm font-medium text-gray-700 mb-2 block">Key Issues</Label>
                              <ul className="space-y-1">
                                {regulation.keyIssues.map((issue, issueIndex) => (
                                  <li key={issueIndex} className="flex items-start space-x-2">
                                    <XCircle className="w-4 h-4 text-red-500 mt-0.5 flex-shrink-0" />
                                    <span className="text-sm text-gray-600">{issue}</span>
                                  </li>
                                ))}
                              </ul>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              </div>
            </TabsContent>

            {/* Roadmap Tab */}
            <TabsContent value="roadmap">
              {detailedReport && (
                <div className="space-y-6">
                  <Card data-testid="card-improvement-roadmap">
                    <CardHeader>
                      <CardTitle>Compliance Improvement Roadmap</CardTitle>
                      <CardDescription>
                        Strategic plan for achieving and maintaining compliance excellence
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                        {/* Immediate Actions */}
                        <div className="space-y-3">
                          <div className="flex items-center space-x-2">
                            <AlertTriangle className="h-5 w-5 text-red-500" />
                            <h4 className="font-semibold text-red-700">Immediate (0-30 days)</h4>
                          </div>
                          <ul className="space-y-2">
                            {detailedReport.improvementRoadmap.immediate.map((item, index) => (
                              <li key={index} className="flex items-start space-x-2">
                                <Clock className="w-4 h-4 text-red-500 mt-0.5 flex-shrink-0" />
                                <span className="text-sm">{item}</span>
                              </li>
                            ))}
                          </ul>
                        </div>

                        {/* Short-term Actions */}
                        <div className="space-y-3">
                          <div className="flex items-center space-x-2">
                            <TrendingUp className="h-5 w-5 text-orange-500" />
                            <h4 className="font-semibold text-orange-700">Short-term (1-6 months)</h4>
                          </div>
                          <ul className="space-y-2">
                            {detailedReport.improvementRoadmap.shortTerm.map((item, index) => (
                              <li key={index} className="flex items-start space-x-2">
                                <Calendar className="w-4 h-4 text-orange-500 mt-0.5 flex-shrink-0" />
                                <span className="text-sm">{item}</span>
                              </li>
                            ))}
                          </ul>
                        </div>

                        {/* Long-term Actions */}
                        <div className="space-y-3">
                          <div className="flex items-center space-x-2">
                            <Shield className="h-5 w-5 text-green-500" />
                            <h4 className="font-semibold text-green-700">Long-term (6+ months)</h4>
                          </div>
                          <ul className="space-y-2">
                            {detailedReport.improvementRoadmap.longTerm.map((item, index) => (
                              <li key={index} className="flex items-start space-x-2">
                                <CheckCircle className="w-4 h-4 text-green-500 mt-0.5 flex-shrink-0" />
                                <span className="text-sm">{item}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      </div>

                      <div className="mt-6 p-4 bg-blue-50 rounded-lg">
                        <div className="flex items-center space-x-2 mb-2">
                          <Calendar className="h-5 w-5 text-blue-500" />
                          <h4 className="font-semibold text-blue-700">Next Review Scheduled</h4>
                        </div>
                        <p className="text-sm text-blue-600">
                          {new Date(detailedReport.nextReviewDate).toLocaleDateString()} - Quarterly compliance assessment
                        </p>
                      </div>
                    </CardContent>
                  </Card>
                </div>
              )}
            </TabsContent>

            {/* Audit Trail Tab */}
            <TabsContent value="audit">
              <Card data-testid="card-audit-trail">
                <CardHeader>
                  <CardTitle>Compliance Audit Trail</CardTitle>
                  <CardDescription>
                    Complete record of compliance activities and changes
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4 max-h-96 overflow-y-auto">
                    {executiveSummary.auditTrail.map((entry, index) => (
                      <div key={index} className="flex items-start space-x-4 p-3 border-l-2 border-gray-200" data-testid={`audit-entry-${index}`}>
                        <div className="flex-shrink-0">
                          <div className="w-2 h-2 bg-blue-500 rounded-full mt-2"></div>
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between">
                            <p className="text-sm font-medium text-gray-900">{entry.action}</p>
                            <p className="text-xs text-gray-500">
                              {new Date(entry.timestamp).toLocaleDateString()}
                            </p>
                          </div>
                          <p className="text-sm text-gray-600">{entry.details}</p>
                          {entry.riskChange && (
                            <Badge className={getRiskColor(entry.riskChange)}>
                              {entry.riskChange} Risk
                            </Badge>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </main>
    </div>
  );
}