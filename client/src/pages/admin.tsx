import { useQuery } from "@tanstack/react-query";
import { useAuth, type AuthUser } from "@/hooks/useAuth";
import { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { Line, LineChart, XAxis, YAxis, CartesianGrid } from "recharts";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Shield, Plus, Edit, Trash2, FileText, Users, Settings } from "lucide-react";
import { isUnauthorizedError } from "@/lib/authUtils";

interface Regulation {
  id: string;
  name: string;
  fullName: string | null;
  description: string | null;
  jurisdiction: string | null;
  effectiveDate: Date | null;
  version: string | null;
  isActive: boolean;
  lastUpdatedBy: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export default function AdminPage() {
  const { user, isLoading: authLoading, isAuthenticated } = useAuth();
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const orgId = (user as any)?.organizationId as string | undefined;

  // Check if user has admin access
  useEffect(() => {
    if (!authLoading && (!isAuthenticated || user?.role !== 'admin')) {
      toast({
        title: "Access Denied",
        description: "Admin access required to view this page.",
        variant: "destructive",
      });
      navigate("/");
    }
  }, [isAuthenticated, user, authLoading, toast, navigate]);

  const { data: regulations, isLoading } = useQuery<Regulation[]>({
    queryKey: ["/api/admin/regulations"],
    enabled: !!user && user.role === 'admin',
    retry: (failureCount, error) => {
      if (isUnauthorizedError(error as Error)) {
        return false;
      }
      return failureCount < 3;
    },
  });

  // SLOs
  const [sloMinutes, setSloMinutes] = useState<number>(60);
  const { data: sloList } = useQuery<any[]>({
    queryKey: ["/api/admin/slo", orgId],
    enabled: !!orgId,
  });
  const { data: sloBurn } = useQuery<any>({
    queryKey: ["/api/admin/slo/burn-rate", orgId, sloMinutes],
    enabled: !!orgId,
  });

  // Quotas
  const { data: quotas } = useQuery<any[]>({
    queryKey: ["/api/admin/quotas", orgId],
    enabled: !!orgId,
  });

  const [quotaFeature, setQuotaFeature] = useState<string>("policy_generate");
  const [quotaWindow, setQuotaWindow] = useState<string>("daily");
  const [quotaLimit, setQuotaLimit] = useState<number>(100);

  async function saveQuota() {
    try {
      const resp = await fetch("/api/admin/quotas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ organizationId: orgId, feature: quotaFeature, window: quotaWindow, limit: quotaLimit })
      });
      if (!resp.ok) throw new Error("Failed to save quota");
      toast({ title: "Quota updated" });
    } catch (e) {
      toast({ title: "Failed to update quota", variant: "destructive" });
    }
  }

  if (authLoading || !user || user.role !== 'admin') {
    return null;
  }

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-8" data-testid="admin-dashboard">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2" data-testid="page-title">
            <Shield className="h-8 w-8 text-blue-600" />
            Admin Dashboard
          </h1>
          <p className="text-gray-600 mt-2">Manage regulations and system settings</p>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card data-testid="stats-regulations">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Regulations</CardTitle>
            <FileText className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{regulations?.length || 0}</div>
            <p className="text-xs text-muted-foreground">
              {regulations?.filter(r => r.isActive).length || 0} active
            </p>
          </CardContent>
        </Card>

        <Card data-testid="stats-active-regulations">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active Regulations</CardTitle>
            <Settings className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {regulations?.filter(r => r.isActive).length || 0}
            </div>
            <p className="text-xs text-muted-foreground">
              Currently enforced
            </p>
          </CardContent>
        </Card>

        <Card data-testid="stats-jurisdictions">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Jurisdictions</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {new Set(regulations?.map(r => r.jurisdiction).filter(Boolean)).size || 0}
            </div>
            <p className="text-xs text-muted-foreground">
              Covered regions
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Regulations Management */}
      <Card data-testid="regulations-management">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Regulations Management</CardTitle>
              <CardDescription>
                Manage regulatory frameworks and compliance requirements
              </CardDescription>
            </div>
            <Button
              onClick={() => navigate("/admin/regulations/new")}
              data-testid="button-add-regulation"
            >
              <Plus className="h-4 w-4 mr-2" />
              Add Regulation
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center h-32" data-testid="loading-spinner">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            </div>
          ) : (regulations && regulations.length) ? (
            <Table data-testid="regulations-table">
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Jurisdiction</TableHead>
                  <TableHead>Version</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Last Updated</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {regulations!.map((regulation) => (
                  <TableRow key={regulation.id} data-testid={`regulation-row-${regulation.id}`}>
                    <TableCell>
                      <div>
                        <div className="font-medium" data-testid={`regulation-name-${regulation.id}`}>
                          {regulation.name}
                        </div>
                        {regulation.fullName && (
                          <div className="text-sm text-gray-500" data-testid={`regulation-fullname-${regulation.id}`}>
                            {regulation.fullName}
                          </div>
                        )}
                      </div>
                    </TableCell>
                    <TableCell data-testid={`regulation-jurisdiction-${regulation.id}`}>
                      {regulation.jurisdiction || '-'}
                    </TableCell>
                    <TableCell data-testid={`regulation-version-${regulation.id}`}>
                      {regulation.version || '-'}
                    </TableCell>
                    <TableCell>
                      <Badge 
                        variant={regulation.isActive ? "default" : "secondary"}
                        data-testid={`regulation-status-${regulation.id}`}
                      >
                        {regulation.isActive ? 'Active' : 'Inactive'}
                      </Badge>
                    </TableCell>
                    <TableCell data-testid={`regulation-updated-${regulation.id}`}>
                      {new Date(regulation.updatedAt).toLocaleDateString()}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => navigate(`/admin/regulations/${regulation.id}`)}
                          data-testid={`button-edit-regulation-${regulation.id}`}
                        >
                          <Edit className="h-3 w-3" />
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => navigate(`/admin/regulations/${regulation.id}/clauses`)}
                          data-testid={`button-manage-clauses-${regulation.id}`}
                        >
                          <FileText className="h-3 w-3" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <div className="text-center py-8" data-testid="no-regulations-message">
              <FileText className="h-12 w-12 text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">No regulations found</h3>
              <p className="text-gray-500 mb-4">Start by adding your first regulation framework.</p>
              <Button
                onClick={() => navigate("/admin/regulations/new")}
                data-testid="button-add-first-regulation"
              >
                <Plus className="h-4 w-4 mr-2" />
                Add First Regulation
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* SLO Dashboard */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>SLO Dashboard</CardTitle>
              <CardDescription>Latency and error budgets</CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <Select value={String(sloMinutes)} onValueChange={(v) => setSloMinutes(parseInt(v))}>
                <SelectTrigger className="w-[140px]"><SelectValue placeholder="Window" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="15">Last 15 min</SelectItem>
                  <SelectItem value="60">Last 60 min</SelectItem>
                  <SelectItem value="240">Last 4 hours</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="text-sm text-muted-foreground mb-2">SLOs configured: {(sloList || []).length}</div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <Card>
              <CardHeader><CardTitle className="text-sm">Target Latency (ms)</CardTitle></CardHeader>
              <CardContent><div className="text-2xl font-bold">{sloBurn?.targetLatencyMs ?? "-"}</div></CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle className="text-sm">Observed Avg Latency (ms)</CardTitle></CardHeader>
              <CardContent><div className="text-2xl font-bold">{sloBurn?.observedAvgLatencyMs ?? 0}</div></CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle className="text-sm">Latency Burn</CardTitle></CardHeader>
              <CardContent><div className="text-2xl font-bold">{sloBurn?.latencyBurn ? (sloBurn.latencyBurn * 100).toFixed(0) + "%" : "-"}</div></CardContent>
            </Card>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-4">
            <Card>
              <CardHeader><CardTitle className="text-sm">Max Error Rate</CardTitle></CardHeader>
              <CardContent><div className="text-2xl font-bold">{sloBurn?.maxErrorRate ? (sloBurn.maxErrorRate * 100).toFixed(2) + "%" : "-"}</div></CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle className="text-sm">Observed Error Rate</CardTitle></CardHeader>
              <CardContent><div className="text-2xl font-bold">{((sloBurn?.observedErrorRate || 0) * 100).toFixed(2)}%</div></CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle className="text-sm">Error Burn</CardTitle></CardHeader>
              <CardContent><div className="text-2xl font-bold">{sloBurn?.errorBurn ? (sloBurn.errorBurn * 100).toFixed(0) + "%" : "-"}</div></CardContent>
            </Card>
          </div>
          {/* Chart */}
          <div className="mt-6">
            <ChartContainer config={{ latency: { label: "Latency", color: "hsl(var(--primary))" } }}>
              <LineChart data={(sloBurn?.metrics || []).map((m: any) => ({ x: new Date(m.bucket).toLocaleTimeString(), y: Math.round((m.latencySum || 0) / Math.max(1, m.count || 1)) }))}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="x" hide/>
                <YAxis />
                <Line type="monotone" dataKey="y" stroke="var(--color-latency)" dot={false} />
                <ChartTooltip content={<ChartTooltipContent />} />
              </LineChart>
            </ChartContainer>
          </div>
          {/* Error rate chart */}
          <div className="mt-6">
            <ChartContainer config={{ errors: { label: "Error Rate", color: "hsl(var(--destructive))" } }}>
              <LineChart data={(sloBurn?.metrics || []).map((m: any) => ({ x: new Date(m.bucket).toLocaleTimeString(), y: Math.round(((m.errors || 0) / Math.max(1, m.count || 1)) * 10000) / 100 }))}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="x" hide/>
                <YAxis domain={[0, 100]} tickFormatter={(v) => `${v}%`} />
                <Line type="monotone" dataKey="y" stroke="var(--color-errors)" dot={false} />
                <ChartTooltip content={<ChartTooltipContent />} />
              </LineChart>
            </ChartContainer>
          </div>
          {/* Throughput chart */}
          <div className="mt-6">
            <ChartContainer config={{ tps: { label: "Requests", color: "hsl(var(--muted-foreground))" } }}>
              <LineChart data={(sloBurn?.metrics || []).map((m: any) => ({ x: new Date(m.bucket).toLocaleTimeString(), y: m.count || 0 }))}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="x" hide/>
                <YAxis />
                <Line type="monotone" dataKey="y" stroke="var(--color-tps)" dot={false} />
                <ChartTooltip content={<ChartTooltipContent />} />
              </LineChart>
            </ChartContainer>
          </div>
        </CardContent>
      </Card>

      {/* Quotas Management */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Feature Quotas</CardTitle>
              <CardDescription>Set per-feature limits</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3 items-end">
            <div>
              <label className="text-sm text-muted-foreground">Feature</label>
              <Input value={quotaFeature} onChange={(e) => setQuotaFeature(e.target.value)} />
            </div>
            <div>
              <label className="text-sm text-muted-foreground">Window</label>
              <Select value={quotaWindow} onValueChange={setQuotaWindow}>
                <SelectTrigger><SelectValue placeholder="Window" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="hourly">Hourly</SelectItem>
                  <SelectItem value="daily">Daily</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-sm text-muted-foreground">Limit</label>
              <Input type="number" value={quotaLimit} onChange={(e) => setQuotaLimit(parseInt(e.target.value || '0'))} />
            </div>
            <div>
              <Button onClick={saveQuota}>Save</Button>
            </div>
          </div>
          <div className="mt-4">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Feature</TableHead>
                  <TableHead>Window</TableHead>
                  <TableHead>Limit</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(quotas || []).map((q: any, idx: number) => (
                  <TableRow key={idx}>
                    <TableCell>{q.feature}</TableCell>
                    <TableCell>{q.window}</TableCell>
                    <TableCell>{q.limit_count}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* SSO Settings */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>SSO</CardTitle>
              <CardDescription>Test configured identity providers</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex gap-3">
            <Button asChild variant="outline"><a href="/auth/oidc/login">Test OIDC Login</a></Button>
            <Button asChild variant="outline"><a href="/auth/saml/metadata" target="_blank" rel="noreferrer">View SAML Metadata</a></Button>
            <Button asChild variant="outline"><a href="/auth/saml/login">Test SAML Login</a></Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}