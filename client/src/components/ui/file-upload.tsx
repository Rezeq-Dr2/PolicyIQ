import { useCallback, useState } from "react";
import { useDropzone } from "react-dropzone";
import { useQuery } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import { CloudUpload, File, X } from "lucide-react";
import { Button } from "./button";

interface FileUploadProps {
  onFileSelect: (file: File) => void;
  selectedFile?: File | null;
  className?: string;
}

interface SupportedFormatsResponse {
  supportedExtensions: string[];
  maxFileSize: number;
  supportedTypes: Array<{ extension: string; description: string }>;
  comingSoon?: Array<{ extension: string; description: string }>;
}

export default function FileUpload({
  onFileSelect,
  selectedFile,
  className,
}: FileUploadProps) {
  const [error, setError] = useState<string>("");

  const { data: formatsData } = useQuery<SupportedFormatsResponse>({
    queryKey: ["/api/policies/supported-formats"],
  });

  const maxSize = formatsData?.maxFileSize || 10 * 1024 * 1024;
  const supportedTypes = formatsData?.supportedTypes || [];
  const supportedExtensions = formatsData?.supportedExtensions || [".docx"];

  const onDrop = useCallback(
    (acceptedFiles: File[], rejectedFiles: any[]) => {
      setError("");

      if (rejectedFiles.length > 0) {
        const rejection = rejectedFiles[0];
        if (rejection.errors[0]?.code === "file-too-large") {
          setError(`File is too large. Maximum size is ${Math.round(maxSize / 1024 / 1024)}MB.`);
        } else if (rejection.errors[0]?.code === "file-invalid-type") {
          const supportedFormats = supportedTypes.map(t => t.description).join(", ");
          setError(`Unsupported file type. Supported formats: ${supportedFormats}`);
        } else {
          setError("File upload failed. Please try again.");
        }
        return;
      }

      if (acceptedFiles.length > 0) {
        onFileSelect(acceptedFiles[0]);
      }
    },
    [onFileSelect, maxSize]
  );

  // Build accept object dynamically based on supported types
  const acceptTypes = {
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": [".docx"],
    "application/msword": [".doc"],
    "text/plain": [".txt"],
  };

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: acceptTypes,
    maxSize,
    multiple: false,
  });

  const removeFile = () => {
    setError("");
    onFileSelect(null as any);
  };

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return "0 Bytes";
    const k = 1024;
    const sizes = ["Bytes", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
  };

  return (
    <div className={cn("space-y-4", className)}>
      {!selectedFile ? (
        <div
          {...getRootProps()}
          className={cn(
            "border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors",
            isDragActive
              ? "border-primary bg-muted"
              : "border-border hover:border-primary hover:bg-muted",
            error && "border-destructive"
          )}
          data-testid="dropzone-upload"
        >
          <input {...getInputProps()} />
          <div className="flex flex-col items-center space-y-4">
            <div className="w-16 h-16 bg-muted rounded-full flex items-center justify-center">
              <CloudUpload className="w-8 h-8 text-muted-foreground" />
            </div>
            <div>
              <p className="text-lg font-medium text-foreground">
                {isDragActive ? "Drop your file here" : "Drop your policy document here"}
              </p>
              <p className="text-sm text-muted-foreground">or click to browse</p>
            </div>
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">
                Supported formats: {supportedTypes.map(t => t.extension.toUpperCase()).join(", ")}
              </p>
              <p className="text-xs text-muted-foreground">
                Maximum file size: {Math.round(maxSize / 1024 / 1024)}MB
              </p>
              {formatsData?.comingSoon && formatsData.comingSoon.length > 0 && (
                <p className="text-xs text-muted-foreground opacity-75">
                  Coming soon: {formatsData.comingSoon.map(t => t.extension.toUpperCase()).join(", ")}
                </p>
              )}
            </div>
          </div>
        </div>
      ) : (
        <div className="border border-border rounded-lg p-4">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
              <File className="w-5 h-5 text-blue-600" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-foreground truncate" data-testid="text-selected-file">
                {selectedFile.name}
              </p>
              <p className="text-xs text-muted-foreground">
                {formatFileSize(selectedFile.size)}
              </p>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={removeFile}
              data-testid="button-remove-file"
            >
              <X className="w-4 h-4" />
            </Button>
          </div>
        </div>
      )}

      {error && (
        <p className="text-sm text-destructive" data-testid="text-upload-error">
          {error}
        </p>
      )}
    </div>
  );
}
