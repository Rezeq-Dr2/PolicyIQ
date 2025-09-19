import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { apiRequest } from "@/lib/queryClient";
import { 
  Eye, 
  Play, 
  RefreshCw, 
  AlertTriangle, 
  CheckCircle, 
  Clock, 
  Settings,
  ExternalLink,
  Calendar,
  TrendingUp,
  Bell,
  Download,
  Search
} from "lucide-react";
import { format } from "date-fns";
import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";

type RegulatorySource = {
  id: string;
  name: string;
  jurisdiction: string;
  sourceType: string;
  baseUrl: string;
  updateFrequency: string;
  isActive: boolean;
  lastCrawled: string | null;
  nextCrawl: string | null;
  reliability: number;
  priority: number;
  tags: string[];
};

type RegulatoryUpdate = {
  id: string;
  title: string;
  description: string;
  updateType: string;
  publishedDate: string | null;
  sourceUrl: string;
  status: string;
  impact: string;
  confidence: number;
  keywords: string[];
};

type CrawlerJob = {
  id: string;
  sourceId: string;
  jobType: string;
  status: string;
  startedAt: string | null;
  completedAt: string | null;
  updatesFound: number;
  newUpdates: number;
  executionTime: number | null;
  errorMessage: string | null;
};

export default function RegulatoryPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [selectedTab, setSelectedTab] = useState("sources");
  const [updateFilter, setUpdateFilter] = useState("all");
  const [searchTerm, setSearchTerm] = useState("");

  // Queries
  const { data: sources = [], isLoading: sourcesLoading } = useQuery({
    queryKey: ["/api/regulatory/sources"],
  });

  const { data: updates = [], isLoading: updatesLoading } = useQuery<RegulatoryUpdate[]>({
    queryKey: ["/api/regulatory/updates", updateFilter],
    queryFn: async () => {
      const res = await apiRequest('GET', `/api/regulatory/updates${updateFilter !== 'all' ? `?status=${updateFilter}` : ''}`);
      return res.json();
    },
  });

  const { data: crawlerStats, isLoading: statsLoading } = useQuery({
    queryKey: ["/api/regulatory/crawler/stats"],
  });

  const { data: recentJobs = [], isLoading: jobsLoading } = useQuery({
    queryKey: ["/api/regulatory/jobs"],
  });

  const { data: notifications = [] } = useQuery({
    queryKey: ["/api/regulatory/notifications"],
  });

  // Mutations
  const runCrawlerMutation = useMutation({
    mutationFn: async (sourceId: string) => await apiRequest('POST', `/api/regulatory/crawler/run/${sourceId}`),
    onSuccess: () => {
      toast({
        title: "Crawler Started",
        description: "The regulatory crawler has been started successfully.",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/regulatory"] });
    },
    onError: (error) => {
      toast({
        title: "Crawler Failed",
        description: `Failed to start crawler: ${error.message}`,
        variant: "destructive",
      });
    },
  });

  const runAllCrawlersMutation = useMutation({
    mutationFn: async () => await apiRequest('POST', "/api/regulatory/crawler/run-all"),
    onSuccess: () => {
      toast({
        title: "All Crawlers Started",
        description: "All regulatory crawlers have been started successfully.",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/regulatory"] });
    },
    onError: (error) => {
      toast({
        title: "Crawlers Failed",
        description: `Failed to start crawlers: ${error.message}`,
        variant: "destructive",
      });
    },
  });

  // Filter updates based on search term
  const filteredUpdates = (updates as RegulatoryUpdate[]).filter((update: RegulatoryUpdate) =>
    update.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
    update.description?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    update.keywords?.some(keyword => keyword.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  const getStatusBadge = (status: string) => {
    const statusConfig = {
      active: { variant: "default" as const, label: "Active" },
      inactive: { variant: "secondary" as const, label: "Inactive" },
      pending: { variant: "outline" as const, label: "Pending" },
      running: { variant: "default" as const, label: "Running" },
      completed: { variant: "secondary" as const, label: "Completed" },
      failed: { variant: "destructive" as const, label: "Failed" },
      reviewed: { variant: "default" as const, label: "Reviewed" },
      implemented: { variant: "secondary" as const, label: "Implemented" },
    };
    return statusConfig[status as keyof typeof statusConfig] || { variant: "outline" as const, label: status };
  };

  const getImpactBadge = (impact: string) => {
    const impactConfig = {
      low: { variant: "secondary" as const, label: "Low Impact" },
      medium: { variant: "outline" as const, label: "Medium Impact" },
      high: { variant: "destructive" as const, label: "High Impact" },
      critical: { variant: "destructive" as const, label: "Critical Impact" },
    };
    return impactConfig[impact as keyof typeof impactConfig] || { variant: "outline" as const, label: impact };
  };

  const getReliabilityColor = (reliability: number) => {
    if (reliability >= 0.9) return "text-green-600";
    if (reliability >= 0.7) return "text-yellow-600";
    return "text-red-600";
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Regulatory Monitoring</h1>
          <p className="text-muted-foreground">
            Automated tracking of regulatory updates and compliance changes
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            onClick={() => runAllCrawlersMutation.mutate()}
            disabled={runAllCrawlersMutation.isPending}
            data-testid="button-run-all-crawlers"
          >
            {runAllCrawlersMutation.isPending ? (
              <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Play className="mr-2 h-4 w-4" />
            )}
            Run All Crawlers
          </Button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active Sources</CardTitle>
            <Settings className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-active-sources">
              {(crawlerStats as any)?.activeSources || 0}
            </div>
            <p className="text-xs text-muted-foreground">
              of {(crawlerStats as any)?.totalSources || 0} total sources
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Pending Updates</CardTitle>
            <AlertTriangle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-orange-600" data-testid="text-pending-updates">
              {(crawlerStats as any)?.pendingUpdatesCount || 0}
            </div>
            <p className="text-xs text-muted-foreground">
              require review
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Recent Jobs</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-recent-jobs">
              {(recentJobs as CrawlerJob[]).filter((job: CrawlerJob) => job.status === 'completed').length}
            </div>
            <p className="text-xs text-muted-foreground">
              completed successfully
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Notifications</CardTitle>
            <Bell className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-notifications">
              {(notifications as any[]).filter((n: any) => n.status === 'pending').length}
            </div>
            <p className="text-xs text-muted-foreground">
              unread notifications
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Main Content */}
      <Tabs value={selectedTab} onValueChange={setSelectedTab} className="space-y-4">
        <TabsList>
          <TabsTrigger value="sources" data-testid="tab-sources">Sources</TabsTrigger>
          <TabsTrigger value="updates" data-testid="tab-updates">Updates</TabsTrigger>
          <TabsTrigger value="jobs" data-testid="tab-jobs">Crawler Jobs</TabsTrigger>
          <TabsTrigger value="notifications" data-testid="tab-notifications">Notifications</TabsTrigger>
        </TabsList>

        {/* Sources Tab */}
        <TabsContent value="sources" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Regulatory Sources</CardTitle>
              <CardDescription>
                Configure and monitor regulatory sources for automated updates
              </CardDescription>
            </CardHeader>
            <CardContent>
              {sourcesLoading ? (
                <div className="flex items-center justify-center py-8">
                  <RefreshCw className="h-8 w-8 animate-spin" />
                </div>
              ) : (
                <div className="space-y-4">
                  {(sources as RegulatorySource[]).map((source: RegulatorySource) => (
                    <div
                      key={source.id}
                      className="flex items-center justify-between p-4 border rounded-lg"
                      data-testid={`card-source-${source.id}`}
                    >
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-2">
                          <h3 className="font-semibold">{source.name}</h3>
                          <Badge variant="outline">{source.jurisdiction}</Badge>
                          <Badge variant="secondary">{source.sourceType}</Badge>
                          <Badge {...getStatusBadge(source.isActive ? 'active' : 'inactive')}>
                            {source.isActive ? 'Active' : 'Inactive'}
                          </Badge>
                        </div>
                        <div className="text-sm text-muted-foreground space-y-1">
                          <p>URL: {source.baseUrl}</p>
                          <p>Frequency: {source.updateFrequency}</p>
                          <p>Last crawled: {source.lastCrawled ? format(new Date(source.lastCrawled), 'PPp') : 'Never'}</p>
                          <p>Next crawl: {source.nextCrawl ? format(new Date(source.nextCrawl), 'PPp') : 'Not scheduled'}</p>
                          <div className="flex items-center gap-2">
                            <span>Reliability:</span>
                            <span className={`font-medium ${getReliabilityColor(source.reliability)}`}>
                              {(source.reliability * 100).toFixed(1)}%
                            </span>
                            <Progress value={source.reliability * 100} className="w-20" />
                          </div>
                        </div>
                        <div className="flex flex-wrap gap-1 mt-2">
                          {source.tags?.map((tag, index) => (
                            <Badge key={index} variant="outline" className="text-xs">
                              {tag}
                            </Badge>
                          ))}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => runCrawlerMutation.mutate(source.id)}
                          disabled={runCrawlerMutation.isPending}
                          data-testid={`button-run-crawler-${source.id}`}
                        >
                          {runCrawlerMutation.isPending ? (
                            <RefreshCw className="h-4 w-4 animate-spin" />
                          ) : (
                            <Play className="h-4 w-4" />
                          )}
                        </Button>
                        <Button variant="outline" size="sm" asChild>
                          <a href={source.baseUrl} target="_blank" rel="noopener noreferrer">
                            <ExternalLink className="h-4 w-4" />
                          </a>
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Updates Tab */}
        <TabsContent value="updates" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Regulatory Updates</CardTitle>
              <CardDescription>
                Monitor detected regulatory changes and their impact
              </CardDescription>
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2">
                  <Search className="h-4 w-4" />
                  <Input
                    placeholder="Search updates..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-64"
                    data-testid="input-search-updates"
                  />
                </div>
                <Select value={updateFilter} onValueChange={setUpdateFilter}>
                  <SelectTrigger className="w-40" data-testid="select-update-filter">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Updates</SelectItem>
                    <SelectItem value="pending">Pending</SelectItem>
                    <SelectItem value="reviewed">Reviewed</SelectItem>
                    <SelectItem value="implemented">Implemented</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardHeader>
            <CardContent>
              {updatesLoading ? (
                <div className="flex items-center justify-center py-8">
                  <RefreshCw className="h-8 w-8 animate-spin" />
                </div>
              ) : (
                <div className="space-y-4">
                  {filteredUpdates.map((update: RegulatoryUpdate) => (
                    <Dialog key={update.id}>
                      <DialogTrigger asChild>
                        <div
                          className="p-4 border rounded-lg cursor-pointer hover:bg-muted/50 transition-colors"
                          data-testid={`card-update-${update.id}`}
                        >
                          <div className="flex items-start justify-between mb-2">
                            <h3 className="font-semibold line-clamp-2">{update.title}</h3>
                            <div className="flex items-center gap-2 ml-4">
                              <Badge {...getStatusBadge(update.status)}>
                                {getStatusBadge(update.status).label}
                              </Badge>
                              {update.impact && (
                                <Badge {...getImpactBadge(update.impact)}>
                                  {getImpactBadge(update.impact).label}
                                </Badge>
                              )}
                            </div>
                          </div>
                          <p className="text-sm text-muted-foreground mb-2 line-clamp-2">
                            {update.description}
                          </p>
                          <div className="flex items-center justify-between text-xs text-muted-foreground">
                            <div className="flex items-center gap-4">
                              <span>Type: {update.updateType}</span>
                              {update.publishedDate && (
                                <span>Published: {format(new Date(update.publishedDate), 'PP')}</span>
                              )}
                              <span>Confidence: {(update.confidence * 100).toFixed(0)}%</span>
                            </div>
                            <Button variant="outline" size="sm">
                              <Eye className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                      </DialogTrigger>
                      <DialogContent className="max-w-4xl max-h-[80vh]">
                        <DialogHeader>
                          <DialogTitle>{update.title}</DialogTitle>
                          <DialogDescription>
                            {update.updateType} • Published {update.publishedDate ? format(new Date(update.publishedDate), 'PPP') : 'Unknown'}
                          </DialogDescription>
                        </DialogHeader>
                        <ScrollArea className="max-h-[60vh]">
                          <div className="space-y-4">
                            <div>
                              <h4 className="font-semibold mb-2">Description</h4>
                              <p className="text-sm">{update.description}</p>
                            </div>
                            <Separator />
                            <div className="grid grid-cols-2 gap-4">
                              <div>
                                <h4 className="font-semibold mb-2">Status</h4>
                                <Badge {...getStatusBadge(update.status)}>
                                  {getStatusBadge(update.status).label}
                                </Badge>
                              </div>
                              <div>
                                <h4 className="font-semibold mb-2">Impact Level</h4>
                                {update.impact ? (
                                  <Badge {...getImpactBadge(update.impact)}>
                                    {getImpactBadge(update.impact).label}
                                  </Badge>
                                ) : (
                                  <span className="text-sm text-muted-foreground">Not assessed</span>
                                )}
                              </div>
                            </div>
                            <div>
                              <h4 className="font-semibold mb-2">Keywords</h4>
                              <div className="flex flex-wrap gap-1">
                                {update.keywords?.map((keyword, index) => (
                                  <Badge key={index} variant="outline" className="text-xs">
                                    {keyword}
                                  </Badge>
                                ))}
                              </div>
                            </div>
                            <div>
                              <h4 className="font-semibold mb-2">Source</h4>
                              <Button variant="outline" size="sm" asChild>
                                <a href={update.sourceUrl} target="_blank" rel="noopener noreferrer">
                                  <ExternalLink className="mr-2 h-4 w-4" />
                                  View Original
                                </a>
                              </Button>
                            </div>
                          </div>
                        </ScrollArea>
                      </DialogContent>
                    </Dialog>
                  ))}
                  {filteredUpdates.length === 0 && (
                    <div className="text-center py-8 text-muted-foreground">
                      No regulatory updates found matching your criteria.
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Crawler Jobs Tab */}
        <TabsContent value="jobs" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Crawler Jobs</CardTitle>
              <CardDescription>
                Monitor the execution of regulatory crawling jobs
              </CardDescription>
            </CardHeader>
            <CardContent>
              {jobsLoading ? (
                <div className="flex items-center justify-center py-8">
                  <RefreshCw className="h-8 w-8 animate-spin" />
                </div>
              ) : (
                <div className="space-y-4">
                  {(recentJobs as CrawlerJob[]).map((job: CrawlerJob) => (
                    <div
                      key={job.id}
                      className="p-4 border rounded-lg"
                      data-testid={`card-job-${job.id}`}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <Badge {...getStatusBadge(job.status)}>
                            {getStatusBadge(job.status).label}
                          </Badge>
                          <Badge variant="outline">{job.jobType}</Badge>
                        </div>
                        <div className="text-sm text-muted-foreground">
                          {job.startedAt && format(new Date(job.startedAt), 'PPp')}
                        </div>
                      </div>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                        <div>
                          <span className="font-medium">Updates Found:</span>
                          <p>{job.updatesFound}</p>
                        </div>
                        <div>
                          <span className="font-medium">New Updates:</span>
                          <p>{job.newUpdates}</p>
                        </div>
                        <div>
                          <span className="font-medium">Execution Time:</span>
                          <p>{job.executionTime ? `${(job.executionTime / 1000).toFixed(2)}s` : 'N/A'}</p>
                        </div>
                        <div>
                          <span className="font-medium">Completed:</span>
                          <p>{job.completedAt ? format(new Date(job.completedAt), 'pp') : 'In progress'}</p>
                        </div>
                      </div>
                      {job.errorMessage && (
                        <div className="mt-2 p-2 bg-destructive/10 rounded text-sm text-destructive">
                          <span className="font-medium">Error:</span> {job.errorMessage}
                        </div>
                      )}
                    </div>
                  ))}
                  {(recentJobs as CrawlerJob[]).length === 0 && (
                    <div className="text-center py-8 text-muted-foreground">
                      No crawler jobs found.
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Notifications Tab */}
        <TabsContent value="notifications" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Regulatory Notifications</CardTitle>
              <CardDescription>
                Stay informed about important regulatory changes
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {(notifications as any[]).map((notification: any) => (
                  <div
                    key={notification.id}
                    className="p-4 border rounded-lg"
                    data-testid={`card-notification-${notification.id}`}
                  >
                    <div className="flex items-start justify-between mb-2">
                      <h3 className="font-semibold">{notification.subject}</h3>
                      <Badge {...getStatusBadge(notification.status)}>
                        {getStatusBadge(notification.status).label}
                      </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground mb-2">
                      {notification.message}
                    </p>
                    <div className="text-xs text-muted-foreground">
                      {notification.createdAt && format(new Date(notification.createdAt), 'PPp')}
                    </div>
                  </div>
                ))}
                {(notifications as any[]).length === 0 && (
                  <div className="text-center py-8 text-muted-foreground">
                    No notifications found.
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}