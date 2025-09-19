import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export default function PromptABTestPage() {
  const { data, isLoading } = useQuery({ queryKey: ['/api/admin/prompts'], retry: false });
  const prompts = (data as any)?.prompts || [];

  return (
    <div className="p-6">
      <Card>
        <CardHeader>
          <CardTitle>Prompt A/B Testing</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? 'Loading...' : (
            <div className="space-y-3">
              {prompts.map((p: any) => (
                <div key={p.id} className="border rounded p-3">
                  <div className="text-sm font-medium">{p.promptType} v{p.version} {p.isActive ? '(active)' : ''}</div>
                  <div className="text-xs text-muted-foreground">Accuracy: {Math.round((p.performance?.accuracyScore || 0)*100)}% | Usages: {p.performance?.totalUsages || 0}</div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}


