import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { useQuery } from "@tanstack/react-query";
import { useParams } from "wouter";
import { isUnauthorizedError } from "@/lib/authUtils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { 
  FileText, 
  Download, 
  AlertTriangle, 
  CheckCircle, 
  XCircle,
  Calendar,
  BarChart3
} from "lucide-react";
import { useEffect, useMemo, useState, useRef } from "react";
import * as Y from 'yjs';

export default function Reports() {
  const { id } = useParams();
  const { toast } = useToast();
  const { isAuthenticated, isLoading: authLoading } = useAuth();

  // Redirect to login if not authenticated
  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
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
  }, [isAuthenticated, authLoading, toast]);

  const { data: reports, isLoading: reportsLoading } = useQuery({
    queryKey: ["/api/reports"],
    retry: false,
    refetchInterval: 5000,
  });

  const { data: reportDetail, isLoading: detailLoading, refetch: refetchReportDetail } = useQuery({
    queryKey: id ? ["/api/reports", id] : [],
    retry: false,
    enabled: !!id,
  });

  const { data: progress } = useQuery({
    queryKey: id ? ["/api/reports", id, "progress"] : [],
    queryFn: async () => {
      const res = await fetch(`/api/reports/${id}/progress`, { credentials: 'include' });
      return res.ok ? res.json() : null;
    },
    enabled: !!id,
    refetchInterval: (q) => {
      const status = (reportDetail as any)?.status;
      return status === 'processing' ? 3000 : false;
    },
  });

  const [showEvidence, setShowEvidence] = useState(false);
  const [lastApplied, setLastApplied] = useState<Record<string, { originalText: string; replacementText: string }>>({});
  const { data: evidence } = useQuery({
    queryKey: id && showEvidence ? ["/api/gov/evidence", id] : [],
    queryFn: async () => {
      const res = await fetch(`/api/gov/evidence?reportId=${id}`, { credentials: 'include' });
      return res.ok ? res.json() : [];
    },
    enabled: !!id && showEvidence,
    refetchInterval: showEvidence ? 5000 : false,
  });
  const [evidenceList, setEvidenceList] = useState<any[] | null>(null);
  useEffect(() => {
    if (showEvidence && Array.isArray(evidence)) setEvidenceList(evidence);
  }, [showEvidence, evidence]);

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

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "completed":
        return <CheckCircle className="w-5 h-5 text-green-500" />;
      case "processing":
        return <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />;
      case "failed":
        return <XCircle className="w-5 h-5 text-red-500" />;
      default:
        return <AlertTriangle className="w-5 h-5 text-yellow-500" />;
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

  if (authLoading) {
    return (
      <div className="min-h-screen w-full flex items-center justify-center bg-background">
        <div className="text-lg text-muted-foreground">Loading...</div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return null;
  }

  // Auto-refresh report detail while processing
  useEffect(() => {
    if (!id || !reportDetail) return;
    if ((reportDetail as any).status !== 'processing') return;
    const interval = setInterval(() => {
      refetchReportDetail();
    }, 3000);
    return () => clearInterval(interval);
  }, [id, reportDetail, refetchReportDetail]);

  // Show single report detail if ID is provided
  if (id && reportDetail) {
    const report = reportDetail as any;
    const analysisResults = report.analysisResults || [];
    const [wsProgress, setWsProgress] = useState<{ completedChunks: number; totalChunks: number; percent: number } | null>(null);
    useEffect(() => {
      if (!id || (report as any).status !== 'processing') return;
      try {
        const loc = window.location;
        const proto = loc.protocol === 'https:' ? 'wss' : 'ws';
        const ws = new WebSocket(`${proto}://${loc.host}/ws?topic=analysis.progress&reportId=${encodeURIComponent(id)}`);
        ws.onmessage = (ev) => {
          try {
            const msg = JSON.parse(ev.data);
            if (msg?.topic === 'analysis.progress' && msg?.payload?.reportId === id) {
              setWsProgress({ completedChunks: msg.payload.completedChunks, totalChunks: msg.payload.totalChunks, percent: msg.payload.percent });
            }
          } catch {}
        };
        return () => { try { ws.close(); } catch {} };
      } catch {}
    }, [id, (report as any).status]);
    const [scenarioName, setScenarioName] = useState('Upcoming Reg X change');
    const [scenarioHypothesis, setScenarioHypothesis] = useState('{"change":"tighten retention policy by 1 year"}');
    const [scenarioOut, setScenarioOut] = useState<any | null>(null);
    const [mappingFrameworkName, setMappingFrameworkName] = useState('ISO 27001');
    const [mappingControlsText, setMappingControlsText] = useState('A.5.1 Information security policies\nA.6.1 Internal organization');
    const [mappingOut, setMappingOut] = useState<any | null>(null);
    const riskCounts = useMemo(() => {
      const counts: Record<string, number> = { Low: 0, Medium: 0, High: 0, Critical: 0 };
      analysisResults.forEach((r: any) => { if (r.riskLevel && counts[r.riskLevel] !== undefined) counts[r.riskLevel]++; });
      const total = Object.values(counts).reduce((a, b) => a + b, 0) || 1;
      return { counts, total };
    }, [analysisResults]);
    // Collaborative editor state
    const [collabText, setCollabText] = useState<string>("");
    const [collabStatus, setCollabStatus] = useState<"connecting" | "synced" | "saving" | "offline">("connecting");
    const [presenceCount, setPresenceCount] = useState<number>(0);
    const wsRef = useRef<WebSocket | null>(null);
    const ydocRef = useRef<Y.Doc | null>(null);
    const ytextRef = useRef<Y.Text | null>(null);
    const suppressLocalChangeRef = useRef<boolean>(false);

    useEffect(() => {
      if (!report?.policyDocumentId) return;
      const loc = window.location;
      const proto = loc.protocol === 'https:' ? 'wss' : 'ws';
      const ws = new WebSocket(`${proto}://${loc.host}/ws/collab?docId=${encodeURIComponent(report.policyDocumentId)}`);
      ws.binaryType = 'arraybuffer';
      wsRef.current = ws;
      setCollabStatus('connecting');

      const ydoc = new Y.Doc();
      const ytext = ydoc.getText('content');
      ydocRef.current = ydoc;
      ytextRef.current = ytext;

      // Reflect remote (and local) Yjs changes into textarea state
      const handleYTextChange = () => {
        const next = ytext.toString();
        suppressLocalChangeRef.current = true;
        setCollabText(next);
        suppressLocalChangeRef.current = false;
      };
      ytext.observe(handleYTextChange);

      // Send Yjs updates over WS
      const handleYUpdate = (update: Uint8Array) => {
        try { ws.send(update); setCollabStatus('saving'); } catch { setCollabStatus('offline'); }
      };
      ydoc.on('update', handleYUpdate);

      ws.onopen = () => { setCollabStatus('synced'); };
      ws.onmessage = (ev) => {
        try {
          if (typeof ev.data === 'string') {
            // presence broadcast from server
            const msg = JSON.parse(ev.data);
            if (msg && msg.type === 'presence' && typeof msg.count === 'number') {
              setPresenceCount(msg.count);
              return;
            }
          } else {
            const buf = new Uint8Array(ev.data as ArrayBuffer);
            if (buf.byteLength > 0) {
              Y.applyUpdate(ydoc, buf);
              setCollabStatus('synced');
            }
          }
        } catch { /* noop */ }
      };
      ws.onclose = () => { setCollabStatus('offline'); };
      ws.onerror = () => { setCollabStatus('offline'); };

      return () => {
        try { ytext.unobserve(handleYTextChange); } catch {}
        try { ydoc.off('update', handleYUpdate as any); } catch {}
        try { ws.close(); } catch {}
      };
    }, [report?.policyDocumentId]);
    useEffect(() => {
      if (!id || !showEvidence) return;
      try {
        const loc = window.location;
        const proto = loc.protocol === 'https:' ? 'wss' : 'ws';
        const ws = new WebSocket(`${proto}://${loc.host}/ws?topic=evidence.created&reportId=${encodeURIComponent(id)}`);
        ws.onmessage = (ev) => {
          try {
            const msg = JSON.parse(ev.data);
            if (msg?.topic === 'evidence.created') {
              const pid = msg.payload?.report_id || msg.payload?.reportId;
              if (String(pid) === String(id)) {
                setEvidenceList((prev) => {
                  const cur = Array.isArray(prev) ? prev : Array.isArray(evidence) ? evidence : [];
                  // avoid duplicates by id
                  if (cur.find((e: any) => (e.id === msg.payload.id))) return cur;
                  const next = [msg.payload, ...cur];
                  return next.slice(0, 200);
                });
              }
            }
          } catch {}
        };
        return () => { try { ws.close(); } catch {} };
      } catch {}
    }, [id, showEvidence]);
    
    return (
      <div className="h-full overflow-auto">
          <header className="bg-card border-b border-border px-6 py-4">
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-2xl font-bold text-foreground" data-testid="text-report-title">
                  Compliance Report
                </h1>
                <p className="text-sm text-muted-foreground">
                  Detailed analysis results
                </p>
              </div>
              <Button 
                onClick={() => handleDownloadPDF(id)}
                disabled={report.status !== "completed"}
                data-testid="button-download-pdf"
              >
                <Download className="w-4 h-4 mr-2" />
                Download PDF
              </Button>
            </div>
          </header>

          <main className="p-6 space-y-6">
            {/* Report Summary */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <Card>
                <CardContent className="p-4">
                  <div className="flex items-center space-x-2">
                    {getStatusIcon(report.status)}
                    <div>
                      <p className="text-sm font-medium">Status</p>
                      <p className="text-xs text-muted-foreground capitalize">
                        {report.status}{report.status === 'processing' ? ' – analyzing…' : ''}
                      </p>
                    </div>
                  </div>
                  {report.status === 'processing' && (
                    <div className="mt-3">
                      <Progress value={(wsProgress?.percent ?? progress?.percent) || 0} />
                      <p className="text-xs text-muted-foreground mt-1">
                        {(wsProgress?.completedChunks ?? progress?.completedChunks) || 0} / {(wsProgress?.totalChunks ?? progress?.totalChunks) || 0} chunks
                      </p>
                    </div>
                  )}
                </CardContent>
              </Card>
              
              <Card>
                <CardContent className="p-4">
                  <div className="flex items-center space-x-2">
                    <BarChart3 className="w-5 h-5 text-blue-500" />
                    <div>
                      <p className="text-sm font-medium">Score</p>
                      <p className="text-xs text-muted-foreground">
                        {report.overallScore ? Math.round(report.overallScore) : 0}%
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="p-4">
                  <div className="flex items-center space-x-2">
                    <AlertTriangle className="w-5 h-5 text-yellow-500" />
                    <div>
                      <p className="text-sm font-medium">Gaps</p>
                      <p className="text-xs text-muted-foreground">{report.gapCount || 0}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="p-4">
                  <div className="flex items-center space-x-2">
                    <div className="w-5 h-5">
                      <Badge variant={getRiskBadgeVariant(report.riskLevel || "")}>
                        {report.riskLevel || "Unknown"}
                      </Badge>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Risk Heatmap */}
            <Card>
              <CardHeader>
                <CardTitle>Risk Heatmap</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="w-full h-3 rounded overflow-hidden flex">
                  {(['Low','Medium','High','Critical'] as const).map((level) => {
                    const val = riskCounts.counts[level] || 0;
                    const pct = Math.round((val / riskCounts.total) * 100);
                    const color = level === 'Low' ? 'bg-green-500' : level === 'Medium' ? 'bg-yellow-500' : level === 'High' ? 'bg-orange-500' : 'bg-red-600';
                    return (
                      <div key={level} className={`${color}`} style={{ width: `${pct}%` }} title={`${level}: ${val}`} />
                    );
                  })}
                </div>
                <div className="mt-2 flex justify-between text-xs text-muted-foreground">
                  <span>Low: {riskCounts.counts.Low}</span>
                  <span>Medium: {riskCounts.counts.Medium}</span>
                  <span>High: {riskCounts.counts.High}</span>
                  <span>Critical: {riskCounts.counts.Critical}</span>
                </div>
              </CardContent>
            </Card>

            {/* Scenarios & Framework Mapping (minimal UI) */}
            <Card>
              <CardHeader>
                <CardTitle>Scenarios & Framework Mapping</CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  {/* Scenario Runner */}
                  <div className="border border-border rounded-md p-3 space-y-2">
                    <div className="text-sm font-medium">Run Scenario</div>
                    <input
                      className="w-full text-sm border rounded px-2 py-1"
                      placeholder="Scenario name"
                      value={scenarioName}
                      onChange={(e) => setScenarioName(e.target.value)}
                    />
                    <textarea
                      className="w-full text-sm border rounded px-2 py-1 h-20"
                      placeholder='Hypothesis JSON, e.g. {"change":"tighten X"}'
                      value={scenarioHypothesis}
                      onChange={(e) => setScenarioHypothesis(e.target.value)}
                    />
                    <div className="flex justify-end">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={async () => {
                          let hypothesis: any = {};
                          try { hypothesis = JSON.parse(scenarioHypothesis || '{}'); } catch {}
                          const res = await fetch('/api/bets/scenario/run', {
                            method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ name: scenarioName || 'Scenario', hypothesis })
                          });
                          const data = await res.json();
                          if (data?.id) {
                            const r2 = await fetch(`/api/bets/scenario/${data.id}`, { credentials: 'include' });
                            const s = await r2.json();
                            setScenarioOut(s);
                          }
                        }}
                      >Run</Button>
                    </div>
                    {scenarioOut && (
                      <div className="text-xs text-muted-foreground space-y-1">
                        <div>Baseline: high {scenarioOut.baseline?.high || 0}, medium {scenarioOut.baseline?.medium || 0}, low {scenarioOut.baseline?.low || 0}</div>
                        <div>Projected: high {scenarioOut.projected?.high || 0}, medium {scenarioOut.projected?.medium || 0}, low {scenarioOut.projected?.low || 0}</div>
                      </div>
                    )}
                  </div>

                  {/* Framework Mapping */}
                  <div className="border border-border rounded-md p-3 space-y-2">
                    <div className="text-sm font-medium">Map Controls to Framework</div>
                    <input
                      className="w-full text-sm border rounded px-2 py-1"
                      placeholder="Framework name"
                      value={mappingFrameworkName}
                      onChange={(e) => setMappingFrameworkName(e.target.value)}
                    />
                    <textarea
                      className="w-full text-sm border rounded px-2 py-1 h-20"
                      placeholder="One control per line"
                      value={mappingControlsText}
                      onChange={(e) => setMappingControlsText(e.target.value)}
                    />
                    <div className="flex justify-end">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={async () => {
                          const controls = (mappingControlsText || '')
                            .split('\n')
                            .map((t, i) => t.trim())
                            .filter(Boolean)
                            .map((t, i) => ({ id: `C${i+1}`, text: t }));
                          const res = await fetch('/api/bets/framework/map', {
                            method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ frameworkName: mappingFrameworkName || 'Framework', controls })
                          });
                          const data = await res.json();
                          setMappingOut(data);
                        }}
                      >Map</Button>
                    </div>
                    {mappingOut && (
                      <div className="text-xs text-muted-foreground space-y-1">
                        <div>Coverage: {mappingOut.coveragePercent || 0}%</div>
                        <div className="max-h-24 overflow-auto">
                          {(mappingOut.mapping || []).slice(0, 5).map((m: any) => (
                            <div key={m.controlId}>
                              <span className="font-medium">{m.controlId}</span>: {(m.matches || []).slice(0,1).map((mm: any) => mm.preview).join(', ')}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Collaborative Editor */}
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle>Collaborative Editor</CardTitle>
                  <div className="text-xs text-muted-foreground">
                    {collabStatus === 'connecting' && 'Connecting…'}
                    {collabStatus === 'saving' && 'Saving…'}
                    {collabStatus === 'synced' && 'Synced'}
                    {collabStatus === 'offline' && 'Offline'}
                    {presenceCount > 0 && ` · ${presenceCount} active ${presenceCount === 1 ? 'editor' : 'editors'}`}
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <textarea
                  className="w-full h-64 border border-border rounded-md p-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  placeholder="Edit the extracted policy text collaboratively…"
                  value={collabText}
                  onChange={(e) => {
                    if (suppressLocalChangeRef.current) return;
                    const ytext = ytextRef.current;
                    const ydoc = ydocRef.current;
                    if (!ytext || !ydoc) return;
                    const next = e.target.value;
                    Y.transact(ydoc, () => {
                      ytext.delete(0, ytext.length);
                      ytext.insert(0, next);
                    });
                  }}
                />
                <div className="mt-2 text-xs text-muted-foreground">
                  Changes auto-save and sync with other editors.
                </div>
              </CardContent>
            </Card>

            {/* Analysis Results */}
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle>Analysis Results</CardTitle>
                  <Button variant="outline" size="sm" onClick={() => setShowEvidence(v => !v)}>
                    {showEvidence ? 'Hide' : 'Show'} Evidence
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {analysisResults.length === 0 ? (
                  <p className="text-muted-foreground text-center py-8">
                    No analysis results available.
                  </p>
                ) : (
                  <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                    <div className="lg:col-span-2 space-y-4">
                      {analysisResults.map((result: any, index: number) => (
                        <div key={result.id || index} className="border border-border rounded-lg p-4">
                          <div className="flex items-start justify-between mb-3">
                            <div className="flex-1">
                              <div className="flex items-center space-x-2 mb-2">
                                <Badge variant={getRiskBadgeVariant(result.riskLevel)}>
                                  {result.riskLevel}
                                </Badge>
                                <span className="text-sm font-medium">
                                  Score: {Math.round((result.complianceScore || 0) * 100)}%
                                </span>
                              </div>
                              <p className="text-sm text-muted-foreground mb-3">
                                {result.summary}
                              </p>
                              {result.suggestedWording && (
                                <div className="bg-muted p-3 rounded-md">
                                  <p className="text-xs font-medium text-foreground mb-1">
                                    Recommended Action:
                                  </p>
                                  <p className="text-xs text-muted-foreground">
                                    {result.suggestedWording}
                                  </p>
                                </div>
                              )}
                              <div className="mt-2 flex items-center space-x-2">
                                <button
                                  className="text-xs px-2 py-1 rounded border hover:bg-accent"
                                  title="Suggest compliant fix"
                                  onClick={async () => {
                                    const res = await fetch('/api/remediation/suggest', {
                                      method: 'POST',
                                      credentials: 'include',
                                      headers: { 'Content-Type': 'application/json' },
                                      body: JSON.stringify({
                                        textSnippet: result.suggestedWording || result.summary,
                                        regulationName: report?.regulationName || 'General',
                                      }),
                                    });
                                    const data = await res.json();
                                    if (data?.suggestions?.length) {
                                      const suggestion = data.suggestions[0];
                                      const ok = confirm(`Apply this fix?\n\n${suggestion}`);
                                      if (ok) {
                                        await fetch('/api/remediation/apply', {
                                          method: 'POST',
                                          credentials: 'include',
                                          headers: { 'Content-Type': 'application/json' },
                                          body: JSON.stringify({
                                            policyDocumentId: report.policyDocumentId,
                                            originalText: result.suggestedWording || result.summary,
                                            replacementText: suggestion,
                                          }),
                                        });
                                        window.location.reload();
                                      }
                                    }
                                  }}
                                >✨ Suggest Fix</button>
                                {result.suggestedWording && (
                                  <button
                                    className="text-xs px-2 py-1 rounded border hover:bg-accent"
                                    title="Apply fix optimistically"
                                    onClick={async () => {
                                      const original = (result as any).originalText || (result as any).clauseText || result.summary || '';
                                      const policyDocumentId = report.policyDocumentId;
                                      // optimistic UI: update local display immediately
                                      try {
                                        await fetch('/api/remediation/apply', {
                                          method: 'POST',
                                          credentials: 'include',
                                          headers: { 'Content-Type': 'application/json' },
                                          body: JSON.stringify({ policyDocumentId, originalText: original, replacementText: result.suggestedWording, changeDescription: 'User applied fix' }),
                                        });
                                        const key = String(result.id || index);
                                        setLastApplied((prev) => ({ ...prev, [key]: { originalText: original, replacementText: result.suggestedWording } }));
                                      } catch {}
                                    }}
                                  >✅ Apply</button>
                                )}
                                {lastApplied[String(result.id || index)] && (
                                  <button
                                    className="text-xs px-2 py-1 rounded border hover:bg-accent"
                                    title="Revert last applied fix"
                                    onClick={async () => {
                                      const key = String(result.id || index);
                                      const pair = lastApplied[key];
                                      if (!pair) return;
                                      try {
                                        await fetch('/api/remediation/revert', {
                                          method: 'POST',
                                          credentials: 'include',
                                          headers: { 'Content-Type': 'application/json' },
                                          body: JSON.stringify({ policyDocumentId: report.policyDocumentId, originalText: pair.originalText, replacementText: pair.replacementText }),
                                        });
                                        setLastApplied((prev) => {
                                          const next = { ...prev };
                                          delete next[key];
                                          return next;
                                        });
                                      } catch {}
                                    }}
                                  >↩ Revert</button>
                                )}
                              </div>
                            </div>
                            <div className="ml-4 flex items-center space-x-2">
                              <button
                                className="text-xs px-2 py-1 rounded border hover:bg-accent"
                                title="Mark analysis as accurate"
                                onClick={async () => {
                                  await fetch('/api/prompt-feedback', {
                                    method: 'POST',
                                    credentials: 'include',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify({
                                      analysisId: result.id,
                                      userFeedback: 'accurate',
                                    }),
                                  });
                                }}
                              >👍</button>
                              <button
                                className="text-xs px-2 py-1 rounded border hover:bg-accent"
                                title="Mark analysis as inaccurate"
                                onClick={async () => {
                                  await fetch('/api/prompt-feedback', {
                                    method: 'POST',
                                    credentials: 'include',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify({
                                      analysisId: result.id,
                                      userFeedback: 'inaccurate',
                                    }),
                                  });
                                }}
                              >👎</button>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                    {showEvidence && (
                      <div className="border border-border rounded-lg p-4 space-y-3">
                        <div className="flex items-center justify-between">
                          <div className="text-sm font-medium">Evidence & Activity</div>
                          <ActiveEditorsBadge evidence={evidence || []} />
                        </div>
                        <div className="space-y-2 max-h-[50vh] overflow-auto">
                          {(!(evidenceList && evidenceList.length) && (!evidence || evidence.length === 0)) ? (
                            <p className="text-xs text-muted-foreground">No evidence yet.</p>
                          ) : (
                            (evidenceList || evidence || []).map((e: any) => (
                              <div key={e.id} className="text-xs">
                                <div className="flex justify-between">
                                  <span className="font-medium">{e.kind}</span>
                                  <span className="text-muted-foreground">{new Date(e.created_at || e.createdAt).toLocaleString()}</span>
                                </div>
                                <div className="text-muted-foreground whitespace-pre-wrap break-words">{e.content}</div>
                              </div>
                            ))
                          )}
                        </div>
                        <EvidenceComposer reportId={id!} />
                      </div>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          </main>
      </div>
    );
  }

  // Show reports list
  return (
    <div className="h-full overflow-auto">
        <header className="bg-card border-b border-border px-6 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-foreground" data-testid="text-page-title">
                Compliance Reports
              </h1>
              <p className="text-sm text-muted-foreground">
                View all your compliance analysis reports
              </p>
            </div>
          </div>
        </header>

        <main className="p-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <FileText className="w-5 h-5" />
                <span>All Reports</span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {reportsLoading ? (
                <div className="space-y-4">
                  {[1, 2, 3].map((i) => (
                    <div key={i} className="border border-border rounded-lg p-4">
                      <Skeleton className="h-4 w-1/3 mb-2" />
                      <Skeleton className="h-3 w-2/3 mb-2" />
                      <Skeleton className="h-3 w-1/2" />
                    </div>
                  ))}
                </div>
              ) : !reports || (reports as any[]).length === 0 ? (
                <div className="text-center py-8">
                  <FileText className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                  <p className="text-muted-foreground">No reports available yet.</p>
                  <p className="text-sm text-muted-foreground">Upload a policy document to get started.</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {(reports as any[]).map((report: any) => (
                    <ReportListItem key={report.id} report={report} onDownload={() => handleDownloadPDF(report.id)} />
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </main>
    </div>
  );
}

function ReportListItem({ report, onDownload }: { report: any; onDownload: () => void }) {
  const { data: prog } = useQuery({
    queryKey: report?.id && report?.status === 'processing' ? ["/api/reports", report.id, "progress", "list"] : [],
    queryFn: async () => {
      const res = await fetch(`/api/reports/${report.id}/progress`, { credentials: 'include' });
      return res.ok ? res.json() : null;
    },
    enabled: report?.status === 'processing',
    refetchInterval: report?.status === 'processing' ? 3000 : false,
  });

  return (
    <div className="border border-border rounded-lg p-4 hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <div className="flex items-center space-x-3 mb-2">
            {report && (report.status === 'completed' ? <CheckCircle className="w-5 h-5 text-green-500" /> : report.status === 'processing' ? <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" /> : report.status === 'failed' ? <XCircle className="w-5 h-5 text-red-500" /> : <AlertTriangle className="w-5 h-5 text-yellow-500" />)}
            <div>
              <h3 className="font-medium text-foreground" data-testid={`text-report-${report.id}`}>
                Report #{String(report.id).slice(0, 8)}
              </h3>
              <p className="text-sm text-muted-foreground flex items-center">
                <Calendar className="w-3 h-3 mr-1" />
                {new Date(report.createdAt).toLocaleDateString()}
              </p>
            </div>
          </div>

          {report.status === 'processing' ? (
            <div className="mt-2">
              <Progress value={prog?.percent || 0} />
              <p className="text-xs text-muted-foreground mt-1">
                {prog?.completedChunks || 0} / {prog?.totalChunks || 0} chunks
              </p>
            </div>
          ) : (
            <div className="flex items-center space-x-4 mt-3">
              <div className="text-sm">
                <span className="text-muted-foreground">Score: </span>
                <span className="font-medium">
                  {report.overallScore ? Math.round(report.overallScore) : 0}%
                </span>
              </div>
              <div className="text-sm">
                <span className="text-muted-foreground">Gaps: </span>
                <span className="font-medium">{report.gapCount || 0}</span>
              </div>
              <Badge variant={report.riskLevel ? (report.riskLevel === 'High' ? 'destructive' : report.riskLevel === 'Medium' ? 'secondary' : report.riskLevel === 'Low' ? 'default' : 'outline') : 'outline'}>
                {report.riskLevel || 'Unknown'}
              </Badge>
            </div>
          )}
        </div>

        <div className="flex space-x-2">
          <Button 
            variant="outline" 
            size="sm"
            onClick={() => window.location.href = `/reports/${report.id}`}
            data-testid={`button-view-${report.id}`}
          >
            View Details
          </Button>
          {report.status === "completed" && (
            <Button 
              variant="outline" 
              size="sm"
              onClick={onDownload}
              data-testid={`button-download-${report.id}`}
            >
              <Download className="w-4 h-4" />
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

function EvidenceComposer({ reportId }: { reportId: string }) {
  const [content, setContent] = useState('');
  const [saving, setSaving] = useState(false);
  const add = async () => {
    if (!content.trim()) return;
    setSaving(true);
    try {
      await fetch('/api/gov/evidence', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reportId, kind: 'note', content }),
      });
      setContent('');
    } finally {
      setSaving(false);
    }
  };
  return (
    <div className="flex items-center space-x-2">
      <input
        className="flex-1 text-xs border rounded px-2 py-1"
        placeholder="Add note or link..."
        value={content}
        onChange={(e) => setContent(e.target.value)}
      />
      <Button size="sm" variant="outline" onClick={add} disabled={saving || !content.trim()}>
        Add
      </Button>
    </div>
  );
}

function ActiveEditorsBadge({ evidence }: { evidence: any[] }) {
  // naive presence cue: count unique uploaders in last 10 minutes
  const recent = (evidence || []).filter((e) => {
    const t = new Date(e.created_at || e.createdAt).getTime();
    return Date.now() - t < 10 * 60 * 1000;
  });
  const users = new Set<string>(recent.map((e) => String(e.uploaded_by || e.uploadedBy || 'unknown')));
  const count = users.size;
  if (count === 0) return null;
  return (
    <div className="text-xs text-muted-foreground">
      {count} active {count === 1 ? 'editor' : 'editors'}
    </div>
  );
}

