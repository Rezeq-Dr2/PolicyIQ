import { useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { useMutation, useQueryClient, useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { isUnauthorizedError } from "@/lib/authUtils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import FileUpload from "@/components/ui/file-upload";
import { ArrowLeft, Upload, FileStack, CheckCircle, AlertCircle, X, Shield } from "lucide-react";
import { useLocation } from "wouter";

export default function UploadPage() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [title, setTitle] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [enhancedUKAnalysis, setEnhancedUKAnalysis] = useState(true);

  const { data: formatsData } = useQuery({
    queryKey: ["/api/policies/supported-formats"],
  });

  const uploadMutation = useMutation({
    mutationFn: async (data: { title: string; file: File }) => {
      const formData = new FormData();
      formData.append("title", data.title);
      formData.append("document", data.file);

      return await apiRequest("POST", "/api/policies/upload", formData);
    },
    onSuccess: () => {
      toast({
        title: "Upload Successful",
        description: "Your policy document has been uploaded and analysis has started.",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/policies"] });
      queryClient.invalidateQueries({ queryKey: ["/api/reports"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/stats"] });
      setTitle("");
      setSelectedFile(null);
    },
    onError: (error) => {
      if (isUnauthorizedError(error)) {
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
      toast({
        title: "Upload Failed",
        description: error.message || "Failed to upload policy document",
        variant: "destructive",
      });
    },
  });

  const batchUploadMutation = useMutation({
    mutationFn: async (files: File[]) => {
      const formData = new FormData();
      files.forEach((file) => {
        formData.append("documents", file);
      });

      return await apiRequest("POST", "/api/policies/batch-upload", formData);
    },
    onSuccess: (data: any) => {
      const { totalUploaded, totalFiles, errors } = data;
      toast({
        title: "Batch Upload Successful",
        description: `${totalUploaded} of ${totalFiles} documents uploaded successfully. Analysis has started.`,
      });
      
      if (errors && errors.length > 0) {
        toast({
          title: "Some Files Failed",
          description: `${errors.length} files could not be processed. Check the details below.`,
          variant: "destructive",
        });
      }
      
      queryClient.invalidateQueries({ queryKey: ["/api/policies"] });
      queryClient.invalidateQueries({ queryKey: ["/api/reports"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/stats"] });
      setSelectedFiles([]);
    },
    onError: (error) => {
      if (isUnauthorizedError(error)) {
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
      toast({
        title: "Batch Upload Failed",
        description: error.message || "Failed to upload policy documents",
        variant: "destructive",
      });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!selectedFile) {
      toast({
        title: "No File Selected",
        description: "Please select a DOCX file to upload.",
        variant: "destructive",
      });
      return;
    }

    if (!title.trim()) {
      toast({
        title: "Title Required",
        description: "Please provide a title for your policy document.",
        variant: "destructive",
      });
      return;
    }

    uploadMutation.mutate({ title: title.trim(), file: selectedFile });
  };

  const handleFileSelect = (file: File) => {
    setSelectedFile(file);
    if (!title) {
      // Auto-set title from filename
      const nameWithoutExt = file.name.replace(/\.[^/.]+$/, "");
      setTitle(nameWithoutExt);
    }
  };

  const handleBatchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!selectedFiles || selectedFiles.length === 0) {
      toast({
        title: "No Files Selected",
        description: "Please select at least one file to upload.",
        variant: "destructive",
      });
      return;
    }

    batchUploadMutation.mutate(selectedFiles);
  };

  const handleMultipleFileSelect = (files: FileList | null) => {
    if (files) {
      setSelectedFiles(Array.from(files));
    }
  };

  const removeFile = (index: number) => {
    setSelectedFiles(files => files.filter((_, i) => i !== index));
  };

  return (
    <div className="h-full overflow-auto">
        {/* Header */}
        <header className="bg-card border-b border-border px-6 py-4">
          <div className="flex items-center space-x-4">
            <Button 
              variant="ghost" 
              size="sm" 
              onClick={() => setLocation("/")}
              data-testid="button-back"
            >
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to Dashboard
            </Button>
            <div>
              <h1 className="text-2xl font-bold text-foreground" data-testid="text-page-title">
                Upload Policy Documents
              </h1>
              <p className="text-sm text-muted-foreground">
                Upload your policy documents for comprehensive compliance analysis
              </p>
              {formatsData && (formatsData as any).supportedTypes && (
                <div className="mt-2 flex flex-wrap gap-2">
                  <span className="text-xs text-muted-foreground">Supported:</span>
                  {(formatsData as any).supportedTypes?.map((type: any) => (
                    <span key={type.extension} className="text-xs bg-muted px-2 py-1 rounded">
                      {type.description}
                    </span>
                  ))}
                  {(formatsData as any).comingSoon && (formatsData as any).comingSoon.length > 0 && (
                    <>
                      <span className="text-xs text-muted-foreground">Coming soon:</span>
                      {(formatsData as any).comingSoon.map((type: any) => (
                        <span key={type.extension} className="text-xs bg-muted/50 px-2 py-1 rounded opacity-60">
                          {type.description}
                        </span>
                      ))}
                    </>
                  )}
                </div>
              )}
            </div>
          </div>
        </header>

        {/* Main Content */}
        <main className="p-6">
          <div className="max-w-4xl mx-auto">
            <Tabs defaultValue="single" className="w-full">
              <TabsList className="grid w-full grid-cols-2 mb-6">
                <TabsTrigger value="single" data-testid="tab-single-upload">
                  <Upload className="w-4 h-4 mr-2" />
                  Single Upload
                </TabsTrigger>
                <TabsTrigger value="batch" data-testid="tab-batch-upload">
                  <FileStack className="w-4 h-4 mr-2" />
                  Batch Upload
                </TabsTrigger>
              </TabsList>

              {/* Single Upload Tab */}
              <TabsContent value="single">
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center space-x-2">
                      <Upload className="w-5 h-5" />
                      <span>Upload Single Document</span>
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <form onSubmit={handleSubmit} className="space-y-6">
                      <div className="space-y-2">
                        <Label htmlFor="title">Document Title</Label>
                        <Input
                          id="title"
                          value={title}
                          onChange={(e) => setTitle(e.target.value)}
                          placeholder="e.g., Privacy Policy v2.1"
                          required
                          data-testid="input-title"
                        />
                      </div>

                      <div className="space-y-2">
                        <Label>Policy Document (DOCX only)</Label>
                        <FileUpload
                          onFileSelect={handleFileSelect}
                          selectedFile={selectedFile}
                        />
                      </div>

                      <div className="bg-blue-50 dark:bg-blue-950/50 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center space-x-3">
                            <Shield className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                            <div>
                              <Label htmlFor="enhanced-analysis" className="font-medium text-blue-900 dark:text-blue-100">
                                Enhanced DPA 2018 Analysis
                              </Label>
                              <p className="text-sm text-blue-700 dark:text-blue-300 mt-1">
                                Deep UK compliance analysis citing specific DPA 2018 sections and ICO guidance
                              </p>
                            </div>
                          </div>
                          <Switch
                            id="enhanced-analysis"
                            checked={enhancedUKAnalysis}
                            onCheckedChange={setEnhancedUKAnalysis}
                            data-testid="switch-enhanced-analysis"
                          />
                        </div>
                      </div>

                      <div className="bg-muted p-4 rounded-lg">
                        <h4 className="font-medium text-foreground mb-2">What happens next?</h4>
                        <ul className="text-sm text-muted-foreground space-y-1">
                          <li>• Your document will be securely processed and analyzed</li>
                          <li>• AI will compare your policy against UK GDPR with DPA 2018 provisions and ICO guidance</li>
                          {enhancedUKAnalysis && (
                            <li className="text-blue-600 dark:text-blue-400 font-medium">
                              • Enhanced analysis includes specific DPA 2018 section citations and UK enforcement risk assessment
                            </li>
                          )}
                          <li>• Analysis typically completes within 5 minutes</li>
                          <li>• You'll receive a detailed compliance report with risk assessment</li>
                        </ul>
                      </div>

                      <div className="flex space-x-3">
                        <Button
                          type="submit"
                          disabled={uploadMutation.isPending}
                          data-testid="button-upload"
                        >
                          {uploadMutation.isPending ? "Uploading..." : "Upload & Analyze"}
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => setLocation("/")}
                          data-testid="button-cancel"
                        >
                          Cancel
                        </Button>
                      </div>
                    </form>
                  </CardContent>
                </Card>
              </TabsContent>

              {/* Batch Upload Tab */}
              <TabsContent value="batch">
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center space-x-2">
                      <FileStack className="w-5 h-5" />
                      <span>Upload Multiple Documents</span>
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <form onSubmit={handleBatchSubmit} className="space-y-6">
                      <div className="space-y-2">
                        <Label>Policy Documents (DOCX only)</Label>
                        <div className="border-2 border-dashed border-border rounded-lg p-6 text-center">
                          <input
                            type="file"
                            multiple
                            accept=".docx"
                            onChange={(e) => handleMultipleFileSelect(e.target.files)}
                            className="hidden"
                            id="batch-upload"
                          />
                          <label
                            htmlFor="batch-upload"
                            className="cursor-pointer flex flex-col items-center space-y-2"
                          >
                            <FileStack className="w-12 h-12 text-muted-foreground" />
                            <div>
                              <p className="text-lg font-medium">Drop files here or click to browse</p>
                              <p className="text-sm text-muted-foreground">Upload up to 10 DOCX files at once</p>
                            </div>
                          </label>
                        </div>
                      </div>

                      {/* Selected Files List */}
                      {selectedFiles.length > 0 && (
                        <div className="space-y-2">
                          <Label>Selected Files ({selectedFiles.length})</Label>
                          <div className="space-y-2 max-h-48 overflow-y-auto">
                            {selectedFiles.map((file, index) => (
                              <div key={index} className="flex items-center justify-between p-3 border rounded-lg">
                                <div className="flex items-center space-x-3">
                                  <CheckCircle className="w-4 h-4 text-green-500" />
                                  <div>
                                    <p className="text-sm font-medium">{file.name}</p>
                                    <p className="text-xs text-muted-foreground">
                                      {(file.size / (1024 * 1024)).toFixed(2)} MB
                                    </p>
                                  </div>
                                </div>
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => removeFile(index)}
                                  data-testid={`button-remove-file-${index}`}
                                >
                                  <X className="w-4 h-4" />
                                </Button>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      <div className="bg-muted p-4 rounded-lg">
                        <h4 className="font-medium text-foreground mb-2">Batch Processing Benefits</h4>
                        <ul className="text-sm text-muted-foreground space-y-1">
                          <li>• Process multiple policies simultaneously for faster analysis</li>
                          <li>• Get comprehensive compliance overview across all documents</li>
                          <li>• Automatic document naming based on filename</li>
                          <li>• Individual reports generated for each document</li>
                          <li>• Historical trends tracked across your entire policy suite</li>
                        </ul>
                      </div>

                      <div className="flex space-x-3">
                        <Button
                          type="submit"
                          disabled={batchUploadMutation.isPending || selectedFiles.length === 0}
                          data-testid="button-batch-upload"
                        >
                          {batchUploadMutation.isPending ? (
                            <>
                              <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2" />
                              Processing {selectedFiles.length} files...
                            </>
                          ) : (
                            <>
                              <FileStack className="w-4 h-4 mr-2" />
                              Upload & Analyze {selectedFiles.length} {selectedFiles.length === 1 ? 'File' : 'Files'}
                            </>
                          )}
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => setLocation("/")}
                          data-testid="button-cancel-batch"
                        >
                          Cancel
                        </Button>
                      </div>
                    </form>
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>
          </div>
        </main>
    </div>
  );
}