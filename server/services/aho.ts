export class AhoCorasick {
  private goto: Map<number, Map<string, number>> = new Map();
  private out: Map<number, Set<string>> = new Map();
  private fail: Map<number, number> = new Map();
  private stateCount = 1;

  add(word: string) {
    let s = 0;
    for (const ch of word) {
      if (!this.goto.get(s)) this.goto.set(s, new Map());
      const g = this.goto.get(s)!;
      if (!g.has(ch)) {
        g.set(ch, this.stateCount++);
      }
      s = g.get(ch)!;
    }
    if (!this.out.get(s)) this.out.set(s, new Set());
    this.out.get(s)!.add(word);
  }

  build() {
    const q: number[] = [];
    // init depth 1
    const g0 = this.goto.get(0) || new Map();
    for (const [ch, s] of g0) {
      this.fail.set(s, 0);
      q.push(s);
    }
    // others default to 0
    // BFS
    while (q.length) {
      const r = q.shift()!;
      const gr = this.goto.get(r) || new Map();
      for (const [a, s] of gr) {
        q.push(s);
        let f = this.fail.get(r) ?? 0;
        while (f !== 0 && !(this.goto.get(f) || new Map()).has(a)) {
          f = this.fail.get(f) ?? 0;
        }
        const gf = (this.goto.get(f) || new Map());
        if (gf.has(a)) f = gf.get(a)!;
        this.fail.set(s, f);
        const outF = this.out.get(f);
        if (outF) {
          if (!this.out.get(s)) this.out.set(s, new Set());
          for (const w of outF) this.out.get(s)!.add(w);
        }
      }
    }
  }

  search(text: string): Set<string> {
    let s = 0;
    const found = new Set<string>();
    for (const ch of text) {
      while (s !== 0 && !(this.goto.get(s) || new Map()).has(ch)) {
        s = this.fail.get(s) ?? 0;
      }
      const gs = this.goto.get(s) || new Map();
      if (gs.has(ch)) s = gs.get(ch)!;
      const out = this.out.get(s);
      if (out) for (const w of out) found.add(w);
    }
    return found;
  }
}
