import fs from 'fs';
import path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import mammoth from 'mammoth';

const execAsync = promisify(exec);

// Supported file types (PDF and RTF support coming soon)
export const SUPPORTED_FILE_TYPES = {
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'],
  'application/msword': ['.doc'],
  'text/plain': ['.txt']
};

export function getSupportedExtensions(): string[] {
  return Object.values(SUPPORTED_FILE_TYPES).flat();
}

export function isFileTypeSupported(mimeType: string, fileName: string): boolean {
  const extension = path.extname(fileName).toLowerCase();
  
  // Check by MIME type first
  if (SUPPORTED_FILE_TYPES[mimeType as keyof typeof SUPPORTED_FILE_TYPES]) {
    return true;
  }
  
  // Fallback to extension check
  return getSupportedExtensions().includes(extension);
}

export async function processDocument(documentId: string, filePath: string): Promise<string> {
  try {
    console.log(`Processing document ${documentId} at ${filePath}`);
    
    const extension = path.extname(filePath).toLowerCase();
    let extractedText = '';

    switch (extension) {
      case '.pdf':
        extractedText = await extractFromPDF(filePath);
        break;
      case '.docx':
        extractedText = await extractFromDOCX(filePath);
        break;
      case '.doc':
        extractedText = await extractFromDOCUsingPython(filePath, documentId);
        break;
      case '.txt':
        extractedText = await extractFromTXT(filePath);
        break;
      case '.rtf':
        extractedText = await extractFromRTF(filePath);
        break;
      default:
        throw new Error(`Unsupported file format: ${extension}`);
    }

    // Clean up uploaded file
    try {
      fs.unlinkSync(filePath);
    } catch (cleanupError) {
      console.warn(`Warning: Could not clean up file ${filePath}:`, cleanupError);
    }

    if (!extractedText || extractedText.trim().length === 0) {
      throw new Error("No text extracted from document");
    }

    console.log(`Successfully extracted ${extractedText.length} characters from ${extension} document ${documentId}`);
    return extractedText;
  } catch (error) {
    // Clean up files on error
    try {
      fs.unlinkSync(filePath);
    } catch (cleanupError) {
      console.warn("Warning: Could not clean up file on error:", cleanupError);
    }
    
    console.error(`Error processing document ${documentId}:`, error);
    throw new Error(`Failed to process document: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

async function extractFromPDF(filePath: string): Promise<string> {
  try {
    // For now, use a simple fallback - we'll implement proper PDF parsing later
    throw new Error('PDF support is being implemented. Please use DOCX, TXT, or RTF files for now.');
  } catch (error) {
    throw new Error(`Failed to extract text from PDF: ${error instanceof Error ? error.message : 'Unknown error'}`);
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
    // For now, use a simple fallback - we'll implement proper RTF parsing later
    throw new Error('RTF support is being implemented. Please use DOCX or TXT files for now.');
  } catch (error) {
    throw new Error(`Failed to extract text from RTF: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

export function chunkText(text: string, maxChunkSize: number = 1000): string[] {
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

  return chunks.filter(chunk => chunk.trim().length > 50); // Filter out very short chunks
}
