import { ComplianceReport, AnalysisResult } from "@shared/schema";
import puppeteer from "puppeteer";

export async function generateReport(
  report: ComplianceReport, 
  analysisResults: AnalysisResult[]
): Promise<Buffer> {
  try {
    console.log(`Generating PDF report for ${report.id}`);

    const htmlContent = generateReportHTML(report, analysisResults);
    
    const browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    
    const page = await browser.newPage();
    await page.setContent(htmlContent, { waitUntil: 'networkidle0' });
    
    const pdfBuffer = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: {
        top: '20mm',
        right: '20mm',
        bottom: '20mm',
        left: '20mm'
      }
    });
    
    await browser.close();
    
    console.log(`PDF report generated successfully for ${report.id}`);
    return Buffer.from(pdfBuffer);
  } catch (error) {
    console.error(`Error generating PDF report for ${report.id}:`, error);
    throw new Error(`Failed to generate PDF report: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

function generateReportHTML(report: ComplianceReport, analysisResults: AnalysisResult[]): string {
  const highRiskResults = analysisResults.filter(r => r.riskLevel === 'High' || r.riskLevel === 'Critical');
  const mediumRiskResults = analysisResults.filter(r => r.riskLevel === 'Medium');
  const lowRiskResults = analysisResults.filter(r => r.riskLevel === 'Low');
  const totalIssues = highRiskResults.length + mediumRiskResults.length;
  const compliancePercentage = Math.round(report.overallScore || 0);
  
  // Determine report type based on analysis results - simplified approach for now
  const hasHealthSafety = analysisResults.some(r => 
    r.summary?.toLowerCase().includes('health') ||
    r.summary?.toLowerCase().includes('safety') ||
    r.policyChunkText?.toLowerCase().includes('health and safety')
  );
  const hasDataProtection = analysisResults.some(r => 
    r.summary?.toLowerCase().includes('gdpr') || 
    r.summary?.toLowerCase().includes('data protection') ||
    r.policyChunkText?.toLowerCase().includes('personal data')
  );
  
  let reportTitle = 'Compliance Analysis Report';
  if (hasHealthSafety && hasDataProtection) {
    reportTitle = 'Comprehensive Compliance Analysis Report';
  } else if (hasHealthSafety) {
    reportTitle = 'Health & Safety Compliance Analysis Report';
  } else if (hasDataProtection) {
    reportTitle = 'Data Protection Compliance Analysis Report';
  }

  return `
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>PolicyIQ Compliance Report</title>
    <style>
        body {
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            line-height: 1.6;
            color: #333;
            max-width: 800px;
            margin: 0 auto;
            padding: 20px;
        }
        .header {
            text-align: center;
            border-bottom: 3px solid #3B82F6;
            padding-bottom: 20px;
            margin-bottom: 30px;
        }
        .logo {
            font-size: 24px;
            font-weight: bold;
            color: #3B82F6;
            margin-bottom: 10px;
        }
        .report-title {
            font-size: 28px;
            font-weight: bold;
            margin-bottom: 10px;
        }
        .report-meta {
            color: #666;
            font-size: 14px;
        }
        .summary-section {
            background: #F8FAFC;
            padding: 20px;
            border-radius: 8px;
            margin-bottom: 30px;
        }
        .summary-grid {
            display: grid;
            grid-template-columns: repeat(3, 1fr);
            gap: 20px;
            margin-top: 15px;
        }
        .summary-item {
            text-align: center;
            padding: 15px;
            background: white;
            border-radius: 6px;
            border: 1px solid #E5E7EB;
        }
        .summary-value {
            font-size: 24px;
            font-weight: bold;
            margin-bottom: 5px;
        }
        .summary-label {
            font-size: 12px;
            color: #666;
            text-transform: uppercase;
        }
        .score-good { color: #10B981; }
        .score-warning { color: #F59E0B; }
        .score-danger { color: #EF4444; }
        .section {
            margin-bottom: 30px;
        }
        .section-title {
            font-size: 20px;
            font-weight: bold;
            margin-bottom: 15px;
            padding-bottom: 5px;
            border-bottom: 2px solid #E5E7EB;
        }
        .analysis-item {
            background: white;
            border: 1px solid #E5E7EB;
            border-radius: 6px;
            padding: 20px;
            margin-bottom: 15px;
        }
        .analysis-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 10px;
        }
        .risk-badge {
            padding: 4px 12px;
            border-radius: 20px;
            font-size: 12px;
            font-weight: bold;
            text-transform: uppercase;
        }
        .risk-high {
            background: #FEE2E2;
            color: #DC2626;
        }
        .risk-medium {
            background: #FEF3C7;
            color: #D97706;
        }
        .risk-low {
            background: #D1FAE5;
            color: #059669;
        }
        .analysis-summary {
            margin-bottom: 15px;
            line-height: 1.5;
        }
        .suggested-wording {
            background: #F0F9FF;
            padding: 15px;
            border-radius: 4px;
            border-left: 4px solid #3B82F6;
        }
        .suggested-label {
            font-weight: bold;
            color: #1E40AF;
            margin-bottom: 8px;
        }
        .policy-chunk {
            background: #F9FAFB;
            padding: 10px;
            border-radius: 4px;
            font-size: 13px;
            color: #4B5563;
            margin-bottom: 10px;
            font-style: italic;
        }
        .footer {
            margin-top: 40px;
            padding-top: 20px;
            border-top: 1px solid #E5E7EB;
            text-align: center;
            font-size: 12px;
            color: #666;
        }
    </style>
</head>
<body>
    <div class="header">
        <div class="logo">PolicyIQ</div>
        <h1 class="report-title">${reportTitle}</h1>
        <div class="report-meta">
            Report ID: ${report.id.slice(0, 8).toUpperCase()}<br>
            Generated on ${new Date().toLocaleDateString('en-GB')} at ${new Date().toLocaleTimeString('en-GB')}<br>
            Analysis completed: ${report.completedAt ? new Date(report.completedAt).toLocaleDateString('en-GB') : 'In Progress'}
        </div>
    </div>

    <div class="summary-section">
        <h2>Executive Summary</h2>
        <p style="margin-bottom: 20px; color: #4B5563; line-height: 1.6;">
            This comprehensive compliance analysis examines your policy documents against applicable UK regulatory requirements. 
            ${totalIssues === 0 ? 
              'Your policies demonstrate strong compliance with regulatory standards.' : 
              `Our analysis identified ${totalIssues} area${totalIssues > 1 ? 's' : ''} requiring attention to achieve full regulatory compliance.`
            }
        </p>
        
        <div class="summary-grid">
            <div class="summary-item">
                <div class="summary-value ${getScoreClass(report.overallScore || 0)}">
                    ${compliancePercentage}%
                </div>
                <div class="summary-label">Overall Compliance Score</div>
            </div>
            <div class="summary-item">
                <div class="summary-value ${totalIssues === 0 ? 'score-good' : 'score-warning'}">
                    ${totalIssues}
                </div>
                <div class="summary-label">Issues Identified</div>
            </div>
            <div class="summary-item">
                <div class="summary-value ${getRiskClass(report.riskLevel)}">
                    ${report.riskLevel || 'Low'}
                </div>
                <div class="summary-label">Risk Assessment</div>
            </div>
            <div class="summary-item">
                <div class="summary-value score-good">
                    ${lowRiskResults.length}
                </div>
                <div class="summary-label">Compliant Areas</div>
            </div>
        </div>
        
        ${hasHealthSafety && hasDataProtection ? `
        <div style="margin-top: 20px; padding: 15px; background: #F0F9FF; border-left: 4px solid #3B82F6; border-radius: 4px;">
            <p style="margin: 0; font-size: 14px; color: #1E40AF;">
                <strong>Multi-Regulatory Analysis:</strong> This report covers both Data Protection and Health & Safety compliance requirements.
            </p>
        </div>
        ` : ''}
    </div>

    ${highRiskResults.length > 0 ? `
    <div class="section">
        <h2 class="section-title">High Priority Issues (${highRiskResults.length})</h2>
        ${highRiskResults.map(result => generateAnalysisItemHTML(result, 'high')).join('')}
    </div>
    ` : ''}

    ${mediumRiskResults.length > 0 ? `
    <div class="section">
        <h2 class="section-title">Medium Priority Issues (${mediumRiskResults.length})</h2>
        ${mediumRiskResults.map(result => generateAnalysisItemHTML(result, 'medium')).join('')}
    </div>
    ` : ''}

    ${lowRiskResults.length > 0 ? `
    <div class="section">
        <h2 class="section-title">Compliant Sections (${lowRiskResults.length})</h2>
        ${lowRiskResults.map(result => generateAnalysisItemHTML(result, 'low')).join('')}
    </div>
    ` : ''}

    <div class="footer">
        <div style="border-top: 2px solid #E5E7EB; padding-top: 20px; margin-top: 30px;">
            <h3 style="color: #3B82F6; margin-bottom: 15px;">Important Notice</h3>
            <p style="margin-bottom: 10px; font-size: 12px; line-height: 1.5;">
                This report was generated by PolicyIQ's AI-powered compliance analysis system using advanced natural language processing 
                to assess policy documents against UK regulatory requirements including GDPR, DPA 2018, Health and Safety at Work etc. Act 1974, and other applicable legislation.
            </p>
            <p style="margin-bottom: 10px; font-size: 12px; line-height: 1.5;">
                <strong>Disclaimer:</strong> This automated analysis is provided for informational purposes only and should not be considered 
                as legal advice. The findings and recommendations in this report should be reviewed by qualified legal counsel to ensure 
                complete compliance with all applicable laws and regulations.
            </p>
            <p style="margin-bottom: 10px; font-size: 12px; line-height: 1.5;">
                Report generated: ${new Date().toLocaleDateString('en-GB')} ${new Date().toLocaleTimeString('en-GB')} | 
                Report ID: ${report.id.slice(0, 8).toUpperCase()} | 
                PolicyIQ Compliance Platform
            </p>
            <div style="text-align: center; margin-top: 15px; color: #6B7280; font-size: 10px;">
                © ${new Date().getFullYear()} PolicyIQ. Advanced AI-Powered Compliance Analysis.
            </div>
        </div>
    </div>
</body>
</html>
  `;
}

function generateAnalysisItemHTML(result: AnalysisResult, riskLevel: string): string {
  return `
    <div class="analysis-item">
        <div class="analysis-header">
            <div>
                <strong>Compliance Score: ${Math.round((result.complianceScore || 0) * 100)}%</strong>
            </div>
            <span class="risk-badge risk-${riskLevel}">${result.riskLevel}</span>
        </div>
        
        <div class="policy-chunk">
            Policy Section: "${(result.policyChunkText || '').substring(0, 200)}${(result.policyChunkText || '').length > 200 ? '...' : ''}"
        </div>
        
        <div class="analysis-summary">
            ${result.summary || 'No summary available'}
        </div>
        
        ${result.suggestedWording ? `
        <div class="suggested-wording">
            <div class="suggested-label">Recommended Action:</div>
            ${result.suggestedWording}
        </div>
        ` : ''}
    </div>
  `;
}

function getScoreClass(score: number): string {
  if (score >= 80) return 'score-good';
  if (score >= 60) return 'score-warning';
  return 'score-danger';
}

function getRiskClass(riskLevel: string | null): string {
  switch (riskLevel) {
    case 'Low': return 'score-good';
    case 'Medium': return 'score-warning';
    case 'High': return 'score-danger';
    default: return 'score-warning';
  }
}
