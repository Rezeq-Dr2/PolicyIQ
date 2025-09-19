import fs from "fs";
import path from "path";
import { execAsync } from "../utils/execAsync";
import mammoth from "mammoth";
// rtf-parser has no types; shim is provided in types declarations
import * as rtfParser from "rtf-parser";
import OpenAI from "openai";
import { withSpan } from './telemetry';
import pdfParse from "pdf-parse";
import crypto from 'crypto';
import os from 'os';
import { db } from '../db';
import { sql } from 'drizzle-orm';

if (!process.env.OPENAI_API_KEY) {
  throw new Error('OPENAI_API_KEY must be set');
}

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

export async function processDocument(filePath: string, documentId: string): Promise<string> {
  const extension = path.extname(filePath).toLowerCase();
  
  let rawText: string;
  
  try {
    switch (extension) {
      case '.docx':
        rawText = await extractFromDOCX(filePath);
        break;
      case '.pdf':
        rawText = await extractFromPDF(filePath);
        break;
      case '.doc':
        rawText = await extractFromDOCUsingPython(filePath, documentId);
        break;
      case '.txt':
        rawText = await extractFromTXT(filePath);
        break;
      case '.rtf':
        rawText = await extractFromRTF(filePath);
        break;
      default:
        throw new Error(`Unsupported file type: ${extension}`);
    }

    // Enhanced data cleaning
    const cleanedText = await enhancedDataCleaning(rawText);
    const simhash = computeSimHash(cleanedText);
    await recordOcrMetrics({ documentId, filePath, usedOcr: cleanedText.length > (rawText?.length || 0), simhash });
    await flagNearDuplicate(documentId, simhash);

    if (!cleanedText || cleanedText.trim().length === 0) {
      throw new Error("No text content could be extracted from the document");
    }

    return cleanedText;
  } catch (error) {
    console.error("Error processing document:", error);
    throw new Error(`Document processing failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

async function extractFromDOCX(filePath: string): Promise<string> {
  try {
    const result = await mammoth.extractRawText({ path: filePath });
    return result.value;
  } catch (error) {
    throw new Error(`Failed to extract text from DOCX: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

async function extractFromPDF(filePath: string): Promise<string> {
  try {
    const t0 = Date.now();
    const data = await withSpan('doc.pdf.parse', async () => pdfParse(fs.readFileSync(filePath)));
    let text = (data.text || '').trim();
    const ocrEnabled = process.env.ENABLE_OCR === '1';
    if (ocrEnabled && text.length < 200) {
      const ocrText = await withSpan('doc.ocr.parallel', async () => tryOcrPdfParallel(filePath));
      if (ocrText && ocrText.trim().length > text.length) {
        text = ocrText.trim();
      }
    }
    try { await db.execute(sql`insert into processing_metrics (document_id, kind, metric) values (${filePath}::text, 'pdf_extract_ms', ${Date.now()-t0})` as any); } catch {}
    return text;
  } catch (error) {
    throw new Error(`Failed to extract text from PDF: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

async function extractFromDOCUsingPython(filePath: string, documentId: string): Promise<string> {
  // Use python-docx for older .doc files (fallback method)
  const pythonScript = `
import sys
from docx import Document
import json

def extract_text_from_doc(file_path):
    try:
        doc = Document(file_path)
        text_content = []
        
        for paragraph in doc.paragraphs:
            if paragraph.text.strip():
                text_content.append(paragraph.text.strip())
        
        # Also extract text from tables
        for table in doc.tables:
            for row in table.rows:
                for cell in row.cells:
                    if cell.text.strip():
                        text_content.append(cell.text.strip())
        
        return "\\n\\n".join(text_content)
    except Exception as e:
        print(f"Error extracting text: {e}", file=sys.stderr)
        return ""

if __name__ == "__main__":
    file_path = sys.argv[1]
    text = extract_text_from_doc(file_path)
    print(text)
`;

  const scriptPath = `/tmp/extract_${documentId}.py`;
  fs.writeFileSync(scriptPath, pythonScript);

  try {
    const { stdout, stderr } = await execAsync(`python3 ${scriptPath} "${filePath}"`);
    
    if (stderr) {
      console.warn(`Python script warning: ${stderr}`);
    }

    const extractedText = stdout.trim();
    fs.unlinkSync(scriptPath);
    
    return extractedText;
  } catch (error) {
    try {
      fs.unlinkSync(scriptPath);
    } catch (cleanupError) {
      console.warn("Could not clean up Python script:", cleanupError);
    }
    throw new Error(`Failed to extract text from DOC file: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

async function extractFromTXT(filePath: string): Promise<string> {
  try {
    return fs.readFileSync(filePath, 'utf-8');
  } catch (error) {
    throw new Error(`Failed to read TXT file: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

async function extractFromRTF(filePath: string): Promise<string> {
  try {
    const rtfContent = fs.readFileSync(filePath, 'utf-8');
    const parsed = rtfParser.parseRtf(rtfContent);
    return parsed.content.map((item: any) => item.text || '').join('');
  } catch (error) {
    throw new Error(`Failed to parse RTF file: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

// Enhanced data cleaning with AI assistance
async function enhancedDataCleaning(rawText: string): Promise<string> {
  // Basic cleaning first
  let cleanedText = basicDataCleaning(rawText);
  
  // AI-powered advanced cleaning for complex cases
  if (cleanedText.length > 10000 || containsComplexFormatting(cleanedText)) {
    try {
      cleanedText = await withSpan('doc.ai.clean', async () => aiAssistedCleaning(cleanedText));
    } catch (error) {
      console.warn('AI-assisted cleaning failed, using basic cleaning:', error);
    }
  }
  
  return cleanedText;
}

function basicDataCleaning(text: string): string {
  return text
    // Remove headers and footers patterns
    .replace(/^[\s\S]*?(?=Page \d+|CONFIDENTIAL|PROPRIETARY)/gim, '')
    .replace(/Page \d+ of \d+/gi, '')
    .replace(/Copyright ©.*$/gim, '')
    
    // Remove excessive whitespace
    .replace(/\n{3,}/g, '\n\n')
    .replace(/\s{3,}/g, ' ')
    
    // Remove page numbers and document metadata
    .replace(/^\d+\s*$/gm, '')
    .replace(/Document ID:.*$/gim, '')
    .replace(/Last Modified:.*$/gim, '')
    .replace(/Version:.*$/gim, '')
    
    // Clean up formatting artifacts
    .replace(/_{3,}/g, '')
    .replace(/-{3,}/g, '')
    .replace(/={3,}/g, '')
    
    // Normalize quotes and apostrophes
    .replace(/[""]/g, '"')
    .replace(/['']/g, "'")
    
    // Remove email footers and disclaimers
    .replace(/This email.*confidential.*$/gims, '')
    .replace(/Please consider.*environment.*$/gims, '')
    
    .trim();
}

function containsComplexFormatting(text: string): boolean {
  const indicators = [
    /\[TOC\]/i,           // Table of contents
    /Table of Contents/i,  // Table of contents
    /Index$/gm,           // Index sections
    /Bibliography/i,      // Bibliography
    /References$/gm,      // References
    /Appendix [A-Z]/i,    // Appendix markers
    /Figure \d+:/i,       // Figure captions
    /Table \d+:/i,        // Table captions
  ];
  
  return indicators.some(pattern => pattern.test(text));
}

async function aiAssistedCleaning(text: string): Promise<string> {
  const prompt = `
Clean and normalize the following document text by:

1. Removing headers, footers, page numbers, and document metadata
2. Removing table of contents, indexes, and appendices
3. Removing figure/table captions and references
4. Preserving policy content and legal text
5. Maintaining paragraph structure and logical flow
6. Removing formatting artifacts but keeping meaningful punctuation

Text to clean:
${text.substring(0, 8000)} ${text.length > 8000 ? '...[truncated]' : ''}

Return only the cleaned text content without any additional commentary.
`;

  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-5',
      messages: [
        { 
          role: 'system', 
          content: 'You are a document processing expert specializing in cleaning policy and legal documents while preserving their essential content.' 
        },
        { role: 'user', content: prompt }
      ],
      temperature: 0.1,
      max_tokens: 4000
    });

    return response.choices[0].message.content?.trim() || text;
  } catch (error) {
    console.error('AI-assisted cleaning failed:', error);
    return text; // Fallback to original text
  }
}

// Enhanced semantic chunking based on document structure
export function enhancedChunkText(text: string, maxChunkSize: number = 1000): string[] {
  // First, try semantic chunking
  const semanticChunks = performSemanticChunking(text, maxChunkSize);
  
  // If semantic chunking fails or produces poor results, fall back to sentence-based
  if (semanticChunks.length === 0 || semanticChunks.some(chunk => chunk.length > maxChunkSize * 1.5)) {
    return fallbackSentenceChunking(text, maxChunkSize);
  }
  
  return semanticChunks;
}

function performSemanticChunking(text: string, maxChunkSize: number): string[] {
  const chunks: string[] = [];
  
  // Identify structural elements
  const sections = identifyDocumentSections(text);
  
  for (const section of sections) {
    if (section.content.length <= maxChunkSize) {
      // Section fits in one chunk
      chunks.push(section.content.trim());
    } else {
      // Split large sections by paragraphs, then sentences if needed
      const paragraphs = section.content.split(/\n\s*\n/).filter(p => p.trim().length > 0);
      let currentChunk = '';
      
      for (const paragraph of paragraphs) {
        if (currentChunk.length + paragraph.length + 2 <= maxChunkSize) {
          currentChunk += (currentChunk ? '\n\n' : '') + paragraph.trim();
        } else {
          if (currentChunk) {
            chunks.push(currentChunk);
          }
          
          // Handle oversized paragraphs
          if (paragraph.length > maxChunkSize) {
            chunks.push(...fallbackSentenceChunking(paragraph, maxChunkSize));
            currentChunk = '';
          } else {
            currentChunk = paragraph.trim();
          }
        }
      }
      
      if (currentChunk) {
        chunks.push(currentChunk);
      }
    }
  }
  
  return chunks.filter(chunk => chunk.trim().length > 50);
}

interface DocumentSection {
  type: 'header' | 'paragraph' | 'list' | 'table';
  content: string;
  level?: number;
}

function identifyDocumentSections(text: string): DocumentSection[] {
  const sections: DocumentSection[] = [];
  const lines = text.split('\n');
  
  let currentSection = '';
  let currentType: DocumentSection['type'] = 'paragraph';
  
  for (const line of lines) {
    const trimmedLine = line.trim();
    
    if (!trimmedLine) {
      if (currentSection) {
        sections.push({ type: currentType, content: currentSection.trim() });
        currentSection = '';
      }
      continue;
    }
    
    // Detect headers (numbered sections, all caps, or specific patterns)
    if (isHeaderLine(trimmedLine)) {
      if (currentSection) {
        sections.push({ type: currentType, content: currentSection.trim() });
      }
      sections.push({ type: 'header', content: trimmedLine });
      currentSection = '';
      currentType = 'paragraph';
    }
    // Detect list items
    else if (isListItem(trimmedLine)) {
      if (currentType !== 'list' && currentSection) {
        sections.push({ type: currentType, content: currentSection.trim() });
        currentSection = '';
      }
      currentType = 'list';
      currentSection += (currentSection ? '\n' : '') + trimmedLine;
    }
    // Regular paragraph content
    else {
      if (currentType !== 'paragraph' && currentSection) {
        sections.push({ type: currentType, content: currentSection.trim() });
        currentSection = '';
      }
      currentType = 'paragraph';
      currentSection += (currentSection ? '\n' : '') + trimmedLine;
    }
  }
  
  if (currentSection) {
    sections.push({ type: currentType, content: currentSection.trim() });
  }
  
  return sections;
}

function isHeaderLine(line: string): boolean {
  return (
    // Numbered sections (1., 1.1, Article 1, Section A, etc.)
    /^\d+\./.test(line) ||
    /^(Article|Section|Chapter|Part)\s+[A-Z0-9]/i.test(line) ||
    // All caps headers (minimum 3 words)
    (/^[A-Z\s]{10,}$/.test(line) && line.split(/\s+/).length >= 3) ||
    // Headers with specific patterns
    /^[A-Z][a-z]+.*:$/.test(line) ||
    // Numbered lists that look like headers
    /^[A-Z]\.\s+[A-Z]/.test(line)
  );
}

function isListItem(line: string): boolean {
  return (
    /^\s*[-•*]\s+/.test(line) ||          // Bullet points
    /^\s*\d+\.\s+/.test(line) ||          // Numbered lists
    /^\s*[a-z]\)\s+/.test(line) ||        // Lettered lists
    /^\s*[IVX]+\.\s+/.test(line)          // Roman numerals
  );
}

function fallbackSentenceChunking(text: string, maxChunkSize: number): string[] {
  const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 0);
  const chunks: string[] = [];
  let currentChunk = '';

  for (const sentence of sentences) {
    const trimmedSentence = sentence.trim();
    if (currentChunk.length + trimmedSentence.length + 1 <= maxChunkSize) {
      currentChunk += (currentChunk ? '. ' : '') + trimmedSentence;
    } else {
      if (currentChunk) {
        chunks.push(currentChunk + '.');
      }
      currentChunk = trimmedSentence;
    }
  }

  if (currentChunk) {
    chunks.push(currentChunk + '.');
  }

  return chunks.filter(chunk => chunk.trim().length > 50);
}

// Legacy function for backward compatibility
export function chunkText(text: string, maxChunkSize: number = 1000): string[] {
  return enhancedChunkText(text, maxChunkSize);
}

// Export supported file types for compatibility
export const SUPPORTED_FILE_TYPES = {
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'],
  'application/msword': ['.doc'],
  'text/plain': ['.txt'],
  'application/rtf': ['.rtf']
};

export function getSupportedExtensions(): string[] {
  return Object.values(SUPPORTED_FILE_TYPES).flat();
}

export function isFileTypeSupported(mimeType: string, fileName: string): boolean {
  const extension = path.extname(fileName).toLowerCase();
  if (SUPPORTED_FILE_TYPES[mimeType as keyof typeof SUPPORTED_FILE_TYPES]) return true;
  return getSupportedExtensions().includes(extension);
}

// Optional OCR using system tools (pdftoppm + tesseract) with parallelization and caching.
async function tryOcrPdfParallel(filePath: string): Promise<string> {
  try {
    const base = filePath.replace(/\.[^/.]+$/, '');
    await execAsync(`pdftoppm -r 200 -png "${filePath}" "${base}_ocr"`);
    const dir = path.dirname(filePath);
    const files = fs.readdirSync(dir).filter(f => f.startsWith(path.basename(base) + '_ocr') && f.endsWith('.png'));
    const maxParallel = Math.max(2, Math.min(os.cpus().length, 8));
    const chunks: string[][] = [];
    for (let i = 0; i < files.length; i += maxParallel) chunks.push(files.slice(i, i + maxParallel));
    let outText = '';
    for (const batch of chunks) {
      const results = await Promise.all(batch.map(async (img) => {
        const imgPath = path.join(dir, img);
        const hashKey = 'ocrpg:' + crypto.createHash('sha1').update(fs.readFileSync(imgPath)).digest('hex');
        const cachePath = path.join(dir, `${hashKey}.txt`);
        try {
          if (fs.existsSync(cachePath)) {
            return fs.readFileSync(cachePath, 'utf-8');
          }
          const outTxt = imgPath.replace(/\.png$/, '');
          await execAsync(`tesseract "${imgPath}" "${outTxt}" -l eng`);
          const txt = fs.readFileSync(`${outTxt}.txt`, 'utf-8');
          fs.writeFileSync(cachePath, txt);
          try { fs.unlinkSync(`${outTxt}.txt`); } catch {}
          return txt;
        } finally {
          try { fs.unlinkSync(imgPath); } catch {}
        }
      }));
      outText += '\n' + results.join('\n');
    }
    return outText.trim();
  } catch (e) {
    console.warn('OCR fallback not available or failed:', (e as any)?.message || e);
    return '';
  }
}

function computeSimHash(text: string): string {
  const tokens = text.toLowerCase().replace(/[^a-z0-9\s]/g,' ').split(/\s+/).filter(Boolean);
  const vec = new Array(64).fill(0);
  for (const tok of tokens) {
    const h = crypto.createHash('sha1').update(tok).digest();
    for (let i = 0; i < 64; i++) {
      const bit = (h[Math.floor(i/8)] >> (i % 8)) & 1;
      vec[i] += bit ? 1 : -1;
    }
  }
  const bits = vec.map(v => (v >= 0 ? '1' : '0')).join('');
  let hex = '';
  for (let i = 0; i < 64; i += 4) {
    hex += parseInt(bits.slice(i, i+4), 2).toString(16);
  }
  return hex;
}

async function hammingDistanceHex(a: string, b: string): Promise<number> {
  // Fallback without BigInt: compare nibble by nibble
  const xored: number[] = [];
  const len = Math.min(a.length, b.length);
  for (let i = 0; i < len; i++) {
    const av = parseInt(a[i], 16);
    const bv = parseInt(b[i], 16);
    xored.push(av ^ bv);
  }
  let count = 0;
  const bits = [1,2,4,8];
  for (const n of xored) {
    for (const bit of bits) if ((n & bit) !== 0) count++;
  }
  return count + Math.abs(a.length - b.length) * 4;
}

async function flagNearDuplicate(documentId: string, simhash: string, threshold: number = 6): Promise<void> {
  try {
    const res: any = await db.execute(sql`select id, simhash from document_dedup order by created_at desc limit 500` as any);
    const rows: Array<{ id: string; simhash: string }> = res?.rows ?? [];
    for (const r of rows) {
      const dist = await hammingDistanceHex(simhash, String(r.simhash));
      if (dist <= threshold) {
        await db.execute(sql`insert into document_dupes (document_id, duplicate_of, distance) values (${documentId}::uuid, ${r.id}::uuid, ${dist}) on conflict do nothing` as any);
        break;
      }
    }
    await db.execute(sql`insert into document_dedup (id, simhash) values (${documentId}::uuid, ${simhash}) on conflict (id) do update set simhash=excluded.simhash` as any);
  } catch {}
}

async function recordOcrMetrics(params: { documentId: string; filePath: string; usedOcr: boolean; simhash: string }): Promise<void> {
  try {
    await db.execute(sql`insert into ocr_metrics (document_id, file_name, used_ocr, simhash, created_at) values (${params.documentId}::uuid, ${path.basename(params.filePath)}, ${params.usedOcr}, ${params.simhash}, now())` as any);
  } catch {}
}

// PII detection heuristics
function detectPii(text: string): { emails: number; phones: number; niNumbers: number } {
  const emails = (text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) || []).length;
  const phones = (text.match(/(?:\+\d{1,3}\s?)?(?:\(?\d{2,4}\)?[\s-]?)?\d{3,4}[\s-]?\d{3,4}/g) || []).length;
  const niNumbers = (text.match(/\b[ABCEGHJKLMNPRSTWXYZ]{2}\d{6}[A-D]\b/gi) || []).length; // UK NI pattern
  return { emails, phones, niNumbers };
}

// Table extraction heuristic: count lines with multiple separators/columns
function estimateTableDensity(text: string): number {
  const lines = text.split('\n');
  let tableLines = 0;
  for (const l of lines) {
    const separators = (l.match(/[\t\|;,]/g) || []).length;
    if (separators >= 3) tableLines += 1;
  }
  return tableLines;
}

// Persist sidecar metadata next to the file for later use
function persistMetadata(filePath: string, documentId: string, cleanedText: string, usedOcr: boolean) {
  try {
    const stats = {
      chars: cleanedText.length,
      words: cleanedText.split(/\s+/).filter(Boolean).length,
      lines: cleanedText.split('\n').length,
      tableLines: estimateTableDensity(cleanedText),
    };
    const pii = detectPii(cleanedText);
    const meta = { stats, pii, processing: { ocrUsed: usedOcr } };
    const metaPath = path.join(path.dirname(filePath), `${documentId}.meta.json`);
    fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2));
  } catch (e) {
    console.warn('Failed to persist metadata:', (e as any)?.message || e);
  }
}
