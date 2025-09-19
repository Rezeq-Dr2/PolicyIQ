import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "@/hooks/use-toast";
import { isUnauthorizedError } from "@/lib/authUtils";
import { 
  FileText, 
  TrendingUp, 
  AlertTriangle, 
  Calendar, 
  Download, 
  Settings, 
  Users, 
  BarChart3,
  Clock,
  Target,
  ArrowUp,
  ArrowDown,
  Minus,
  Plus
} from "lucide-react";
import { LineChart, Line, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';

interface KPIMetric {
  name: string;
  value: number | string;
  trend: 'up' | 'down' | 'stable';
  trendValue: number;
  description: string;
  target?: number;
  unit: string;
  category: 'compliance' | 'risk' | 'performance' | 'efficiency';
}

interface BoardReport {
  id: string;
  title: string;
  executiveSummary: string;
  kpiMetrics: KPIMetric[];
  complianceOverview: {
    score: number;
    gapsCount: number;
    riskLevel: string;
    regulationsAnalyzed: string[];
  };
  riskAssessment: {
    level: string;
    criticalIssues: string[];
    emergingRisks: string[];
    mitigationActions: string[];
  };
  performanceTrends: {
    period: string;
    improvements: string[];
    deteriorations: string[];
    projectedOutlook: string;
  };
  actionItems: {
    immediate: string[];
    shortTerm: string[];
    longTerm: string[];
  };
  createdAt: string;
  reportPeriod: string;
}

const boardReportSchema = z.object({
  reportPeriod: z.string().min(1, "Report period is required"),
});

const kpiDashboardSchema = z.object({
  stakeholderType: z.enum(['board', 'executive', 'compliance_team', 'legal']),
  name: z.string().min(1, "Dashboard name is required"),
  description: z.string().optional(),
});

const reportScheduleSchema = z.object({
  reportType: z.string().min(1, "Report type is required"),
  name: z.string().min(1, "Schedule name is required"),
  frequency: z.enum(['daily', 'weekly', 'monthly', 'quarterly']),
  recipients: z.string().min(1, "Recipients are required").transform(s => s.split(',').map(e => e.trim())),
});

const biExportSchema = z.object({
  exportType: z.enum(['tableau', 'powerbi', 'looker', 'csv', 'json']),
  dataSource: z.enum(['compliance_trends', 'kpi_metrics', 'executive_summary']),
});

export default function ExecutivePage() {
  const { isAuthenticated, isLoading } = useAuth();
  const queryClient = useQueryClient();
  const [selectedPeriod, setSelectedPeriod] = useState(new Date().toISOString().slice(0, 7));

  // Redirect to home if not authenticated
  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      toast({
        title: "Unauthorized",
        description: "You are logged out. Logging in again...",
        variant: "destructive",
      });
      setTimeout(() => {
        window.location.href = "/api/login";
      }, 500);
      return;
    }
  }, [isAuthenticated, isLoading]);

  // Fetch executive reports
  const { data: reports = [], isLoading: reportsLoading } = useQuery({
    queryKey: ['/api/executive/reports'],
    enabled: isAuthenticated,
  });

  // Fetch KPI dashboards
  const { data: dashboards = [], isLoading: dashboardsLoading } = useQuery({
    queryKey: ['/api/executive/kpi-dashboards'],
    enabled: isAuthenticated,
  });

  // Fetch report schedules
  const { data: schedules = [], isLoading: schedulesLoading } = useQuery({
    queryKey: ['/api/executive/report-schedules'],
    enabled: isAuthenticated,
  });

  // Fetch BI exports
  const { data: biExports = [], isLoading: biExportsLoading } = useQuery({
    queryKey: ['/api/executive/bi-exports'],
    enabled: isAuthenticated,
  });

  // Create board report mutation
  const createBoardReportMutation = useMutation({
    mutationFn: async (data: z.infer<typeof boardReportSchema>) => {
      return await apiRequest('POST', `/api/executive/board-report`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/executive/reports'] });
      toast({
        title: "Success",
        description: "Board report generated successfully",
      });
    },
    onError: (error) => {
      if (isUnauthorizedError(error)) {
        toast({
          title: "Unauthorized",
          description: "You are logged out. Logging in again...",
          variant: "destructive",
        });
        setTimeout(() => {
          window.location.href = "/api/login";
        }, 500);
        return;
      }
      toast({
        title: "Error",
        description: "Failed to generate board report",
        variant: "destructive",
      });
    },
  });

  // Create KPI dashboard mutation
  const createKPIDashboardMutation = useMutation({
    mutationFn: async (data: z.infer<typeof kpiDashboardSchema>) => {
      return await apiRequest('POST', `/api/executive/kpi-dashboard`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/executive/kpi-dashboards'] });
      toast({
        title: "Success",
        description: "KPI dashboard created successfully",
      });
    },
    onError: (error) => {
      if (isUnauthorizedError(error)) {
        toast({
          title: "Unauthorized",
          description: "You are logged out. Logging in again...",
          variant: "destructive",
        });
        setTimeout(() => {
          window.location.href = "/api/login";
        }, 500);
        return;
      }
      toast({
        title: "Error",
        description: "Failed to create KPI dashboard",
        variant: "destructive",
      });
    },
  });

  // Schedule report mutation
  const scheduleReportMutation = useMutation({
    mutationFn: async (data: z.infer<typeof reportScheduleSchema>) => {
      return await apiRequest('POST', `/api/executive/schedule-report`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/executive/report-schedules'] });
      toast({
        title: "Success",
        description: "Report scheduled successfully",
      });
    },
    onError: (error) => {
      if (isUnauthorizedError(error)) {
        toast({
          title: "Unauthorized",
          description: "You are logged out. Logging in again...",
          variant: "destructive",
        });
        setTimeout(() => {
          window.location.href = "/api/login";
        }, 500);
        return;
      }
      toast({
        title: "Error",
        description: "Failed to schedule report",
        variant: "destructive",
      });
    },
  });

  // Export for BI mutation
  const exportForBIMutation = useMutation({
    mutationFn: async (data: z.infer<typeof biExportSchema>) => {
      return await apiRequest('POST', `/api/executive/export-bi`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/executive/bi-exports'] });
      toast({
        title: "Success",
        description: "Data exported successfully",
      });
    },
    onError: (error) => {
      if (isUnauthorizedError(error)) {
        toast({
          title: "Unauthorized",
          description: "You are logged out. Logging in again...",
          variant: "destructive",
        });
        setTimeout(() => {
          window.location.href = "/api/login";
        }, 500);
        return;
      }
      toast({
        title: "Error",
        description: "Failed to export data",
        variant: "destructive",
      });
    },
  });

  // Form handlers
  const boardReportForm = useForm<z.infer<typeof boardReportSchema>>({
    resolver: zodResolver(boardReportSchema),
    defaultValues: {
      reportPeriod: selectedPeriod,
    },
  });

  const kpiDashboardForm = useForm<z.infer<typeof kpiDashboardSchema>>({
    resolver: zodResolver(kpiDashboardSchema),
    defaultValues: {
      stakeholderType: 'board',
      name: '',
      description: '',
    },
  });

  const reportScheduleForm = useForm<z.infer<typeof reportScheduleSchema>>({
    resolver: zodResolver(reportScheduleSchema),
    defaultValues: {
      reportType: 'board_summary',
      name: '',
      frequency: 'monthly',
      recipients: [],
    },
  });

  const biExportForm = useForm<z.infer<typeof biExportSchema>>({
    resolver: zodResolver(biExportSchema),
    defaultValues: {
      exportType: 'csv',
      dataSource: 'compliance_trends',
    },
  });

  const handleCreateBoardReport = (data: z.infer<typeof boardReportSchema>) => {
    createBoardReportMutation.mutate(data);
  };

  const handleCreateKPIDashboard = (data: z.infer<typeof kpiDashboardSchema>) => {
    createKPIDashboardMutation.mutate(data);
  };

  const handleScheduleReport = (data: z.infer<typeof reportScheduleSchema>) => {
    scheduleReportMutation.mutate(data);
  };

  const handleExportForBI = (data: z.infer<typeof biExportSchema>) => {
    exportForBIMutation.mutate(data);
  };

  const getTrendIcon = (trend: string) => {
    switch (trend) {
      case 'up': return <ArrowUp className="h-4 w-4 text-green-500" />;
      case 'down': return <ArrowDown className="h-4 w-4 text-red-500" />;
      default: return <Minus className="h-4 w-4 text-gray-500" />;
    }
  };

  const getRiskLevelColor = (level: string) => {
    switch (level?.toLowerCase()) {
      case 'high': return 'bg-red-100 text-red-800';
      case 'medium': return 'bg-yellow-100 text-yellow-800';
      case 'low': return 'bg-green-100 text-green-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600 dark:text-gray-400">Loading executive dashboard...</p>
        </div>
      </div>
    );
  }

  const latestReport = (reports as BoardReport[])[0] || undefined;

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 p-4">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Executive Reporting Suite</h1>
              <p className="text-gray-600 dark:text-gray-400 mt-2">
                Board-ready compliance reports, KPI dashboards, and business intelligence
              </p>
            </div>
            <div className="flex space-x-3">
              <Dialog>
                <DialogTrigger asChild>
                  <Button data-testid="button-generate-board-report">
                    <FileText className="h-4 w-4 mr-2" />
                    Generate Board Report
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Generate Board Report</DialogTitle>
                    <DialogDescription>
                      Create a comprehensive board-ready compliance report with executive summary and key insights.
                    </DialogDescription>
                  </DialogHeader>
                  <Form {...boardReportForm}>
                    <form onSubmit={boardReportForm.handleSubmit(handleCreateBoardReport)} className="space-y-4">
                      <FormField
                        control={boardReportForm.control}
                        name="reportPeriod"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Report Period</FormLabel>
                            <FormControl>
                              <Input type="month" {...field} data-testid="input-report-period" />
                            </FormControl>
                            <FormDescription>
                              Select the month and year for this report
                            </FormDescription>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <DialogFooter>
                        <Button type="submit" disabled={createBoardReportMutation.isPending} data-testid="button-submit-board-report">
                          {createBoardReportMutation.isPending ? "Generating..." : "Generate Report"}
                        </Button>
                      </DialogFooter>
                    </form>
                  </Form>
                </DialogContent>
              </Dialog>
            </div>
          </div>
        </div>

        <Tabs defaultValue="dashboard" className="space-y-6">
          <TabsList className="grid w-full grid-cols-5">
            <TabsTrigger value="dashboard" data-testid="tab-dashboard">Dashboard</TabsTrigger>
            <TabsTrigger value="reports" data-testid="tab-reports">Reports</TabsTrigger>
            <TabsTrigger value="kpi" data-testid="tab-kpi">KPI Dashboards</TabsTrigger>
            <TabsTrigger value="schedules" data-testid="tab-schedules">Schedules</TabsTrigger>
            <TabsTrigger value="exports" data-testid="tab-exports">BI Exports</TabsTrigger>
          </TabsList>

          {/* Executive Dashboard */}
          <TabsContent value="dashboard" className="space-y-6">
            {latestReport ? (
              <>
                {/* KPI Overview */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                  {latestReport.kpiMetrics.map((metric, index) => (
                    <Card key={index} data-testid={`card-kpi-${index}`}>
                      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">{metric.name}</CardTitle>
                        {getTrendIcon(metric.trend)}
                      </CardHeader>
                      <CardContent>
                        <div className="text-2xl font-bold">
                          {typeof metric.value === 'number' ? metric.value.toLocaleString() : metric.value}
                          <span className="text-sm text-gray-500 ml-1">{metric.unit}</span>
                        </div>
                        <p className="text-xs text-gray-600 mt-1">{metric.description}</p>
                        {metric.target && typeof metric.value === 'number' && (
                          <div className="text-xs text-gray-500 mt-2">
                            Target: {metric.target}{metric.unit}
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  ))}
                </div>

                {/* Executive Summary */}
                <Card data-testid="card-executive-summary">
                  <CardHeader>
                    <CardTitle className="flex items-center">
                      <BarChart3 className="h-5 w-5 mr-2" />
                      Executive Summary
                    </CardTitle>
                    <CardDescription>
                      {latestReport.reportPeriod} • Generated {new Date(latestReport.createdAt).toLocaleDateString()}
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="prose dark:prose-invert max-w-none">
                      {latestReport.executiveSummary.split('\n\n').map((paragraph, index) => (
                        <p key={index} className="mb-4 text-gray-700 dark:text-gray-300">
                          {paragraph}
                        </p>
                      ))}
                    </div>
                  </CardContent>
                </Card>

                {/* Compliance Overview & Risk Assessment */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  <Card data-testid="card-compliance-overview">
                    <CardHeader>
                      <CardTitle className="flex items-center">
                        <Target className="h-5 w-5 mr-2" />
                        Compliance Overview
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="flex items-center justify-between">
                        <span className="font-medium">Overall Score</span>
                        <Badge variant="outline" className="text-lg px-3 py-1">
                          {latestReport.complianceOverview.score}%
                        </Badge>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="font-medium">Risk Level</span>
                        <Badge className={getRiskLevelColor(latestReport.complianceOverview.riskLevel)}>
                          {latestReport.complianceOverview.riskLevel}
                        </Badge>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="font-medium">Critical Gaps</span>
                        <span className="font-bold text-red-600">
                          {latestReport.complianceOverview.gapsCount}
                        </span>
                      </div>
                      <div>
                        <span className="font-medium">Regulations Analyzed:</span>
                        <div className="mt-2 flex flex-wrap gap-2">
                          {latestReport.complianceOverview.regulationsAnalyzed.map((reg, index) => (
                            <Badge key={index} variant="secondary" className="text-xs">
                              {reg}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  <Card data-testid="card-risk-assessment">
                    <CardHeader>
                      <CardTitle className="flex items-center">
                        <AlertTriangle className="h-5 w-5 mr-2" />
                        Risk Assessment
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div>
                        <h4 className="font-medium mb-2">Critical Issues</h4>
                        <ul className="list-disc list-inside space-y-1 text-sm text-gray-600 dark:text-gray-400">
                          {latestReport.riskAssessment.criticalIssues.map((issue, index) => (
                            <li key={index}>{issue}</li>
                          ))}
                        </ul>
                      </div>
                      <div>
                        <h4 className="font-medium mb-2">Emerging Risks</h4>
                        <ul className="list-disc list-inside space-y-1 text-sm text-gray-600 dark:text-gray-400">
                          {latestReport.riskAssessment.emergingRisks.map((risk, index) => (
                            <li key={index}>{risk}</li>
                          ))}
                        </ul>
                      </div>
                    </CardContent>
                  </Card>
                </div>

                {/* Action Items */}
                <Card data-testid="card-action-items">
                  <CardHeader>
                    <CardTitle className="flex items-center">
                      <Clock className="h-5 w-5 mr-2" />
                      Priority Action Items
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                      <div>
                        <h4 className="font-medium text-red-600 mb-3">Immediate (0-30 days)</h4>
                        <ul className="space-y-2">
                          {latestReport.actionItems.immediate.map((action, index) => (
                            <li key={index} className="flex items-start">
                              <div className="w-2 h-2 bg-red-500 rounded-full mt-2 mr-3 flex-shrink-0"></div>
                              <span className="text-sm">{action}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                      <div>
                        <h4 className="font-medium text-yellow-600 mb-3">Short Term (1-3 months)</h4>
                        <ul className="space-y-2">
                          {latestReport.actionItems.shortTerm.map((action, index) => (
                            <li key={index} className="flex items-start">
                              <div className="w-2 h-2 bg-yellow-500 rounded-full mt-2 mr-3 flex-shrink-0"></div>
                              <span className="text-sm">{action}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                      <div>
                        <h4 className="font-medium text-green-600 mb-3">Long Term (3+ months)</h4>
                        <ul className="space-y-2">
                          {latestReport.actionItems.longTerm.map((action, index) => (
                            <li key={index} className="flex items-start">
                              <div className="w-2 h-2 bg-green-500 rounded-full mt-2 mr-3 flex-shrink-0"></div>
                              <span className="text-sm">{action}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </>
            ) : (
              <Card data-testid="card-no-reports">
                <CardContent className="text-center py-12">
                  <FileText className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                  <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">
                    No Executive Reports Available
                  </h3>
                  <p className="text-gray-600 dark:text-gray-400 mb-6">
                    Generate your first board report to see executive dashboard insights.
                  </p>
                  <Button onClick={() => boardReportForm.setValue('reportPeriod', selectedPeriod)} data-testid="button-generate-first-report">
                    Generate Your First Report
                  </Button>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          {/* Reports Tab */}
          <TabsContent value="reports" className="space-y-6">
            <div className="grid gap-6">
              {reportsLoading ? (
                <Card>
                  <CardContent className="p-6">
                    <div className="animate-pulse space-y-4">
                      <div className="h-4 bg-gray-200 rounded w-3/4"></div>
                      <div className="h-4 bg-gray-200 rounded w-1/2"></div>
                    </div>
                  </CardContent>
                </Card>
              ) : (reports as any[]).length > 0 ? (
                (reports as any[]).map((report: any, index: number) => (
                  <Card key={report.id} data-testid={`card-report-${index}`}>
                    <CardHeader>
                      <div className="flex items-center justify-between">
                        <div>
                          <CardTitle>{report.title}</CardTitle>
                          <CardDescription>
                            {report.reportPeriod} • Generated {new Date(report.createdAt).toLocaleDateString()}
                          </CardDescription>
                        </div>
                        <div className="flex items-center space-x-2">
                          <Badge className={getRiskLevelColor(report.riskLevel)}>
                            {report.riskLevel} Risk
                          </Badge>
                          <Button variant="outline" size="sm" data-testid={`button-download-report-${index}`}>
                            <Download className="h-4 w-4 mr-2" />
                            Download PDF
                          </Button>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <div className="grid grid-cols-3 gap-4 mb-4">
                        <div className="text-center">
                          <div className="text-2xl font-bold text-blue-600">{report.complianceScore}%</div>
                          <div className="text-sm text-gray-600">Compliance Score</div>
                        </div>
                        <div className="text-center">
                          <div className="text-2xl font-bold text-red-600">{report.priorityActions?.length || 0}</div>
                          <div className="text-sm text-gray-600">Priority Actions</div>
                        </div>
                        <div className="text-center">
                          <div className="text-2xl font-bold text-green-600">{report.keyInsights?.length || 0}</div>
                          <div className="text-sm text-gray-600">Key Insights</div>
                        </div>
                      </div>
                      {report.keyInsights && report.keyInsights.length > 0 && (
                        <div>
                          <h4 className="font-medium mb-2">Key Insights:</h4>
                          <ul className="list-disc list-inside space-y-1 text-sm text-gray-600 dark:text-gray-400">
                            {report.keyInsights.slice(0, 3).map((insight: string, i: number) => (
                              <li key={i}>{insight}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                ))
              ) : (
                <Card data-testid="card-no-executive-reports">
                  <CardContent className="text-center py-12">
                    <FileText className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                    <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">
                      No Executive Reports
                    </h3>
                    <p className="text-gray-600 dark:text-gray-400">
                      Generate your first board report to get started.
                    </p>
                  </CardContent>
                </Card>
              )}
            </div>
          </TabsContent>

          {/* KPI Dashboards Tab */}
          <TabsContent value="kpi" className="space-y-6">
            <div className="flex justify-between items-center">
              <div>
                <h2 className="text-2xl font-bold">KPI Dashboards</h2>
                <p className="text-gray-600 dark:text-gray-400">
                  Customizable dashboards for different stakeholder groups
                </p>
              </div>
              <Dialog>
                <DialogTrigger asChild>
                  <Button data-testid="button-create-kpi-dashboard">
                    <Plus className="h-4 w-4 mr-2" />
                    Create Dashboard
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Create KPI Dashboard</DialogTitle>
                    <DialogDescription>
                      Create a customized dashboard for specific stakeholder groups.
                    </DialogDescription>
                  </DialogHeader>
                  <Form {...kpiDashboardForm}>
                    <form onSubmit={kpiDashboardForm.handleSubmit(handleCreateKPIDashboard)} className="space-y-4">
                      <FormField
                        control={kpiDashboardForm.control}
                        name="name"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Dashboard Name</FormLabel>
                            <FormControl>
                              <Input placeholder="e.g., Board Compliance Dashboard" {...field} data-testid="input-dashboard-name" />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={kpiDashboardForm.control}
                        name="stakeholderType"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Stakeholder Type</FormLabel>
                            <Select onValueChange={field.onChange} defaultValue={field.value} data-testid="select-stakeholder-type">
                              <FormControl>
                                <SelectTrigger>
                                  <SelectValue placeholder="Select stakeholder type" />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                <SelectItem value="board">Board of Directors</SelectItem>
                                <SelectItem value="executive">Executive Team</SelectItem>
                                <SelectItem value="compliance_team">Compliance Team</SelectItem>
                                <SelectItem value="legal">Legal Team</SelectItem>
                              </SelectContent>
                            </Select>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={kpiDashboardForm.control}
                        name="description"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Description</FormLabel>
                            <FormControl>
                              <Textarea placeholder="Dashboard description..." {...field} data-testid="textarea-dashboard-description" />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <DialogFooter>
                        <Button type="submit" disabled={createKPIDashboardMutation.isPending} data-testid="button-submit-kpi-dashboard">
                          {createKPIDashboardMutation.isPending ? "Creating..." : "Create Dashboard"}
                        </Button>
                      </DialogFooter>
                    </form>
                  </Form>
                </DialogContent>
              </Dialog>
            </div>

            <div className="grid gap-6">
              {dashboardsLoading ? (
                <Card>
                  <CardContent className="p-6">
                    <div className="animate-pulse space-y-4">
                      <div className="h-4 bg-gray-200 rounded w-3/4"></div>
                      <div className="h-4 bg-gray-200 rounded w-1/2"></div>
                    </div>
                  </CardContent>
                </Card>
              ) : (dashboards as any[]).length > 0 ? (
                (dashboards as any[]).map((dashboard: any, index: number) => (
                  <Card key={dashboard.id} data-testid={`card-dashboard-${index}`}>
                    <CardHeader>
                      <div className="flex items-center justify-between">
                        <div>
                          <CardTitle>{dashboard.name}</CardTitle>
                          <CardDescription>
                            {dashboard.stakeholderType.replace('_', ' ').toUpperCase()} • Created {new Date(dashboard.createdAt).toLocaleDateString()}
                          </CardDescription>
                        </div>
                        <div className="flex space-x-2">
                          <Button variant="outline" size="sm" data-testid={`button-view-dashboard-${index}`}>
                            <BarChart3 className="h-4 w-4 mr-2" />
                            View Dashboard
                          </Button>
                          <Button variant="outline" size="sm" data-testid={`button-configure-dashboard-${index}`}>
                            <Settings className="h-4 w-4 mr-2" />
                            Configure
                          </Button>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <p className="text-gray-600 dark:text-gray-400 mb-4">{dashboard.description}</p>
                      <div className="flex items-center space-x-4 text-sm text-gray-500">
                        <span>Refresh: {dashboard.refreshFrequency}</span>
                        <span>•</span>
                        <span>Last updated: {new Date(dashboard.lastModified).toLocaleDateString()}</span>
                      </div>
                    </CardContent>
                  </Card>
                ))
              ) : (
                <Card data-testid="card-no-dashboards">
                  <CardContent className="text-center py-12">
                    <BarChart3 className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                    <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">
                      No KPI Dashboards
                    </h3>
                    <p className="text-gray-600 dark:text-gray-400">
                      Create customized dashboards for your stakeholder groups.
                    </p>
                  </CardContent>
                </Card>
              )}
            </div>
          </TabsContent>

          {/* Schedules Tab */}
          <TabsContent value="schedules" className="space-y-6">
            <div className="flex justify-between items-center">
              <div>
                <h2 className="text-2xl font-bold">Report Schedules</h2>
                <p className="text-gray-600 dark:text-gray-400">
                  Automated report generation and distribution
                </p>
              </div>
              <Dialog>
                <DialogTrigger asChild>
                  <Button data-testid="button-schedule-report">
                    <Calendar className="h-4 w-4 mr-2" />
                    Schedule Report
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Schedule Automated Report</DialogTitle>
                    <DialogDescription>
                      Set up automated generation and distribution of reports.
                    </DialogDescription>
                  </DialogHeader>
                  <Form {...reportScheduleForm}>
                    <form onSubmit={reportScheduleForm.handleSubmit(handleScheduleReport)} className="space-y-4">
                      <FormField
                        control={reportScheduleForm.control}
                        name="name"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Schedule Name</FormLabel>
                            <FormControl>
                              <Input placeholder="e.g., Monthly Board Report" {...field} data-testid="input-schedule-name" />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={reportScheduleForm.control}
                        name="reportType"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Report Type</FormLabel>
                            <Select onValueChange={field.onChange} defaultValue={field.value} data-testid="select-report-type">
                              <FormControl>
                                <SelectTrigger>
                                  <SelectValue placeholder="Select report type" />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                <SelectItem value="board_summary">Board Summary</SelectItem>
                                <SelectItem value="quarterly_review">Quarterly Review</SelectItem>
                                <SelectItem value="risk_assessment">Risk Assessment</SelectItem>
                              </SelectContent>
                            </Select>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={reportScheduleForm.control}
                        name="frequency"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Frequency</FormLabel>
                            <Select onValueChange={field.onChange} defaultValue={field.value} data-testid="select-frequency">
                              <FormControl>
                                <SelectTrigger>
                                  <SelectValue placeholder="Select frequency" />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                <SelectItem value="daily">Daily</SelectItem>
                                <SelectItem value="weekly">Weekly</SelectItem>
                                <SelectItem value="monthly">Monthly</SelectItem>
                                <SelectItem value="quarterly">Quarterly</SelectItem>
                              </SelectContent>
                            </Select>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={reportScheduleForm.control}
                        name="recipients"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Recipients</FormLabel>
                            <FormControl>
                              <Input placeholder="email1@company.com, email2@company.com" {...field} data-testid="input-recipients" />
                            </FormControl>
                            <FormDescription>
                              Enter email addresses separated by commas
                            </FormDescription>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <DialogFooter>
                        <Button type="submit" disabled={scheduleReportMutation.isPending} data-testid="button-submit-schedule">
                          {scheduleReportMutation.isPending ? "Scheduling..." : "Schedule Report"}
                        </Button>
                      </DialogFooter>
                    </form>
                  </Form>
                </DialogContent>
              </Dialog>
            </div>

            <div className="grid gap-6">
              {schedulesLoading ? (
                <Card>
                  <CardContent className="p-6">
                    <div className="animate-pulse space-y-4">
                      <div className="h-4 bg-gray-200 rounded w-3/4"></div>
                      <div className="h-4 bg-gray-200 rounded w-1/2"></div>
                    </div>
                  </CardContent>
                </Card>
              ) : (schedules as any[]).length > 0 ? (
                (schedules as any[]).map((schedule: any, index: number) => (
                  <Card key={schedule.id} data-testid={`card-schedule-${index}`}>
                    <CardHeader>
                      <div className="flex items-center justify-between">
                        <div>
                          <CardTitle>{schedule.name}</CardTitle>
                          <CardDescription>
                            {schedule.reportType.replace('_', ' ').toUpperCase()} • {schedule.frequency.toUpperCase()}
                          </CardDescription>
                        </div>
                        <div className="flex space-x-2">
                          <Badge variant={schedule.isActive ? "default" : "secondary"}>
                            {schedule.isActive ? "Active" : "Inactive"}
                          </Badge>
                          <Button variant="outline" size="sm" data-testid={`button-edit-schedule-${index}`}>
                            <Settings className="h-4 w-4 mr-2" />
                            Edit
                          </Button>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-2 text-sm">
                        <div className="flex justify-between">
                          <span className="text-gray-600">Recipients:</span>
                          <span>{schedule.recipients.length} recipients</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-600">Next Run:</span>
                          <span>{schedule.nextRunDate ? new Date(schedule.nextRunDate).toLocaleDateString() : 'Not scheduled'}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-600">Last Run:</span>
                          <span>{schedule.lastRunDate ? new Date(schedule.lastRunDate).toLocaleDateString() : 'Never'}</span>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))
              ) : (
                <Card data-testid="card-no-schedules">
                  <CardContent className="text-center py-12">
                    <Calendar className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                    <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">
                      No Scheduled Reports
                    </h3>
                    <p className="text-gray-600 dark:text-gray-400">
                      Set up automated report generation and distribution.
                    </p>
                  </CardContent>
                </Card>
              )}
            </div>
          </TabsContent>

          {/* BI Exports Tab */}
          <TabsContent value="exports" className="space-y-6">
            <div className="flex justify-between items-center">
              <div>
                <h2 className="text-2xl font-bold">Business Intelligence Exports</h2>
                <p className="text-gray-600 dark:text-gray-400">
                  Export data for integration with BI tools like Tableau, Power BI, and Looker
                </p>
              </div>
              <Dialog>
                <DialogTrigger asChild>
                  <Button data-testid="button-export-bi">
                    <Download className="h-4 w-4 mr-2" />
                    Export Data
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Export for Business Intelligence</DialogTitle>
                    <DialogDescription>
                      Export compliance data for analysis in your BI tools.
                    </DialogDescription>
                  </DialogHeader>
                  <Form {...biExportForm}>
                    <form onSubmit={biExportForm.handleSubmit(handleExportForBI)} className="space-y-4">
                      <FormField
                        control={biExportForm.control}
                        name="dataSource"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Data Source</FormLabel>
                            <Select onValueChange={field.onChange} defaultValue={field.value} data-testid="select-data-source">
                              <FormControl>
                                <SelectTrigger>
                                  <SelectValue placeholder="Select data source" />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                <SelectItem value="compliance_trends">Compliance Trends</SelectItem>
                                <SelectItem value="kpi_metrics">KPI Metrics</SelectItem>
                                <SelectItem value="executive_summary">Executive Summary</SelectItem>
                              </SelectContent>
                            </Select>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={biExportForm.control}
                        name="exportType"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Export Type</FormLabel>
                            <Select onValueChange={field.onChange} defaultValue={field.value} data-testid="select-export-type">
                              <FormControl>
                                <SelectTrigger>
                                  <SelectValue placeholder="Select export type" />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                <SelectItem value="csv">CSV File</SelectItem>
                                <SelectItem value="json">JSON File</SelectItem>
                                <SelectItem value="tableau">Tableau Extract</SelectItem>
                                <SelectItem value="powerbi">Power BI Dataset</SelectItem>
                                <SelectItem value="looker">Looker Data</SelectItem>
                              </SelectContent>
                            </Select>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <DialogFooter>
                        <Button type="submit" disabled={exportForBIMutation.isPending} data-testid="button-submit-export">
                          {exportForBIMutation.isPending ? "Exporting..." : "Export Data"}
                        </Button>
                      </DialogFooter>
                    </form>
                  </Form>
                </DialogContent>
              </Dialog>
            </div>

            <div className="grid gap-6">
              {biExportsLoading ? (
                <Card>
                  <CardContent className="p-6">
                    <div className="animate-pulse space-y-4">
                      <div className="h-4 bg-gray-200 rounded w-3/4"></div>
                      <div className="h-4 bg-gray-200 rounded w-1/2"></div>
                    </div>
                  </CardContent>
                </Card>
              ) : (biExports as any[]).length > 0 ? (
                (biExports as any[]).map((exportItem: any, index: number) => (
                  <Card key={exportItem.id} data-testid={`card-export-${index}`}>
                    <CardHeader>
                      <div className="flex items-center justify-between">
                        <div>
                          <CardTitle className="flex items-center">
                            <Download className="h-5 w-5 mr-2" />
                            {exportItem.dataSource.replace('_', ' ').toUpperCase()}
                          </CardTitle>
                          <CardDescription>
                            {exportItem.exportType.toUpperCase()} • {exportItem.recordCount} records
                          </CardDescription>
                        </div>
                        <div className="flex space-x-2">
                          <Button variant="outline" size="sm" data-testid={`button-download-export-${index}`}>
                            <Download className="h-4 w-4 mr-2" />
                            Download
                          </Button>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-2 text-sm">
                        <div className="flex justify-between">
                          <span className="text-gray-600">Export Format:</span>
                          <Badge variant="outline">{exportItem.exportFormat.toUpperCase()}</Badge>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-600">Created:</span>
                          <span>{new Date(exportItem.createdAt).toLocaleDateString()}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-600">Last Export:</span>
                          <span>
                            {exportItem.lastExported 
                              ? new Date(exportItem.lastExported).toLocaleDateString() 
                              : 'Never'
                            }
                          </span>
                        </div>
                        {exportItem.exportPath && (
                          <div className="flex justify-between">
                            <span className="text-gray-600">File Path:</span>
                            <code className="text-xs bg-gray-100 dark:bg-gray-800 px-2 py-1 rounded">
                              {exportItem.exportPath}
                            </code>
                          </div>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                ))
              ) : (
                <Card data-testid="card-no-exports">
                  <CardContent className="text-center py-12">
                    <Download className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                    <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">
                      No Data Exports
                    </h3>
                    <p className="text-gray-600 dark:text-gray-400">
                      Export compliance data for analysis in your BI tools.
                    </p>
                  </CardContent>
                </Card>
              )}
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}