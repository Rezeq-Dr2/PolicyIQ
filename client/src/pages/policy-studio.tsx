import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';

export default function PolicyStudio() {
  const [prompt, setPrompt] = useState('');
  const [title, setTitle] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ id: string; title: string } | null>(null);

  const generate = async () => {
    setLoading(true);
    setResult(null);
    const res = await fetch('/api/policy-studio/generate', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt, title }),
    });
    const data = await res.json();
    setResult(data);
    setLoading(false);
  };

  return (
    <div className="p-6">
      <Card>
        <CardHeader>
          <CardTitle>Policy Studio</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <input
            className="w-full border rounded p-2 text-sm"
            placeholder="Optional title (e.g., Working From Home Policy)"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
          <Textarea
            placeholder="Describe your needs (e.g., GDPR-compliant WFH policy for a 100-person UK tech company)"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
          />
          <Button onClick={generate} disabled={loading || !prompt.trim()}>
            {loading ? 'Generating…' : 'Generate Policy'}
          </Button>
          {result && (
            <div className="text-sm mt-2">
              Generated policy: <a className="underline" href={`/reports`}>{result.title}</a>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}


