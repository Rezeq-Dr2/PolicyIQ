export class GrafanaDashService {
  getDashboard(org: string): any {
    // Minimal dashboard JSON for quick import covering API, LLM, Queue, Retrieval
    return {
      annotations: { list: [] },
      editable: true,
      graphTooltip: 0,
      panels: [
        {
          type: 'stat', title: 'API Requests (5m)', gridPos: { x:0,y:0,w:8,h:6 },
          targets: [{ expr: `policyiq_api_requests_total{org="${org}"}` }]
        },
        {
          type: 'gauge', title: 'API Error Rate', gridPos: { x:8,y:0,w:8,h:6 },
          targets: [{ expr: `policyiq_api_errors_total{org="${org}"} / ignoring(org) policyiq_api_requests_total{org="${org}"}` }]
        },
        {
          type: 'stat', title: 'Queue Wait', gridPos: { x:16,y:0,w:8,h:6 },
          targets: [{ expr: `policyiq_queue_wait` }]
        },
        {
          type: 'bargauge', title: 'Retrieval Source Mix (5m)', gridPos: { x:0,y:6,w:24,h:8 },
          targets: [
            { expr: `policyiq_retrieval_count{org="${org}",source="cache"}` },
            { expr: `policyiq_retrieval_count{org="${org}",source="pgvector"}` },
            { expr: `policyiq_retrieval_count{org="${org}",source="pinecone"}` },
            { expr: `policyiq_retrieval_count{org="${org}",source="sparse"}` },
            { expr: `policyiq_retrieval_count{org="${org}",source="fallback"}` },
            { expr: `policyiq_retrieval_count{org="${org}",source="colbert"}` },
          ]
        },
        {
          type: 'timeseries', title: 'LLM Requests by Model (5m)', gridPos: { x:0,y:14,w:24,h:10 },
          targets: [
            { expr: `policyiq_llm_requests_total{model=~".+"}` }
          ]
        }
      ],
      schemaVersion: 37,
      style: 'dark',
      time: { from: 'now-1h', to: 'now' },
      timezone: 'browser',
      title: 'PolicyIQ Overview',
      uid: 'policyiq-overview',
      version: 1,
    };
  }
}

export const grafanaDashService = new GrafanaDashService();


