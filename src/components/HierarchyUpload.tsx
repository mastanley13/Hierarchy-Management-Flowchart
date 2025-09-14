import React, { useState, useCallback, useRef } from 'react';
import { 
  uploadHierarchyWithMonitoring, 
  validateHierarchyFile, 
  createCarrierAuthToken 
} from '../lib/api';
import type { HierarchyUploadStatus, FileValidationResult, UploadHistoryItem } from '../lib/types';
import './HierarchyUpload.css';

interface HierarchyUploadProps {
  onUploadComplete?: (status: HierarchyUploadStatus) => void;
  onUploadStart?: () => void;
  className?: string;
}

const HierarchyUpload: React.FC<HierarchyUploadProps> = ({
  onUploadComplete,
  onUploadStart,
  className = ''
}) => {
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<HierarchyUploadStatus | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [validation, setValidation] = useState<FileValidationResult | null>(null);
  const [uploadHistory, setUploadHistory] = useState<UploadHistoryItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dragCounter = useRef(0);
  const [isDragOver, setIsDragOver] = useState(false);

  // Handle file selection
  const handleFileSelect = useCallback((file: File) => {
    setError(null);
    setSelectedFile(file);
    
    // Validate file
    const validationResult = validateHierarchyFile(file);
    setValidation(validationResult);
    
    if (!validationResult.isValid) {
      setError(validationResult.errors.join(', '));
    }
  }, []);

  // Handle file input change
  const handleFileInputChange = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      handleFileSelect(file);
    }
  }, [handleFileSelect]);

  // Handle drag and drop
  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current++;
    if (e.dataTransfer.items && e.dataTransfer.items.length > 0) {
      setIsDragOver(true);
    }
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current--;
    if (dragCounter.current === 0) {
      setIsDragOver(false);
    }
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
    dragCounter.current = 0;

    const files = e.dataTransfer.files;
    if (files && files.length > 0) {
      handleFileSelect(files[0]);
    }
  }, [handleFileSelect]);

  // Handle upload
  const handleUpload = useCallback(async () => {
    if (!selectedFile || !validation?.isValid) {
      setError('Please select a valid file to upload');
      return;
    }

    try {
      setIsUploading(true);
      setError(null);
      setUploadProgress(null);
      
      if (onUploadStart) {
        onUploadStart();
      }

      // Create carrier auth token
      const token = createCarrierAuthToken();

      // Upload with monitoring
      const finalStatus = await uploadHierarchyWithMonitoring(
        selectedFile,
        token,
        (status) => {
          setUploadProgress(status);
        }
      );

      // Add to history
      const historyItem: UploadHistoryItem = {
        id: finalStatus.id,
        fileName: selectedFile.name,
        fileSize: selectedFile.size,
        status: finalStatus.status,
        startTime: finalStatus.startTime || new Date().toISOString(),
        endTime: finalStatus.endTime,
        progress: finalStatus.progress || 0,
        totalRecords: finalStatus.totalRecords,
        processedRecords: finalStatus.processedRecords,
        errors: finalStatus.errors,
        warnings: finalStatus.warnings
      };

      setUploadHistory(prev => [historyItem, ...prev]);
      setUploadProgress(finalStatus);

      if (onUploadComplete) {
        onUploadComplete(finalStatus);
      }

      // Reset form after successful upload
      if (finalStatus.status === 'completed') {
        setSelectedFile(null);
        setValidation(null);
        if (fileInputRef.current) {
          fileInputRef.current.value = '';
        }
      }

    } catch (err) {
      console.error('Upload failed:', err);
      setError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setIsUploading(false);
    }
  }, [selectedFile, validation, onUploadStart, onUploadComplete]);

  // Clear selection
  const clearSelection = useCallback(() => {
    setSelectedFile(null);
    setValidation(null);
    setError(null);
    setUploadProgress(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }, []);

  // Format file size
  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  // Format date
  const formatDate = (dateString: string): string => {
    return new Date(dateString).toLocaleString();
  };

  return (
    <div className={`hierarchy-upload ${className}`}>
      <div className="upload-header">
        <h3>📤 Upload Hierarchy Data</h3>
        <p>Upload Excel or CSV files to update your organization's hierarchy structure.</p>
      </div>

      {/* Upload Area */}
      <div 
        className={`upload-area ${isDragOver ? 'drag-over' : ''} ${selectedFile ? 'has-file' : ''}`}
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
      >
        {!selectedFile ? (
          <div className="upload-prompt">
            <div className="upload-icon">📁</div>
            <p>Drag and drop your file here, or</p>
            <button 
              type="button" 
              className="browse-button"
              onClick={() => fileInputRef.current?.click()}
            >
              Browse Files
            </button>
            <p className="file-types">Supported formats: .xls, .xlsx, .csv (max 10MB)</p>
          </div>
        ) : (
          <div className="file-selected">
            <div className="file-info">
              <div className="file-icon">📄</div>
              <div className="file-details">
                <div className="file-name">{selectedFile.name}</div>
                <div className="file-size">{formatFileSize(selectedFile.size)}</div>
                {validation?.fileType && (
                  <div className="file-type">{validation.fileType.toUpperCase()}</div>
                )}
              </div>
            </div>
            <button 
              type="button" 
              className="clear-button"
              onClick={clearSelection}
              disabled={isUploading}
            >
              ✕
            </button>
          </div>
        )}

        <input
          ref={fileInputRef}
          type="file"
          accept=".xls,.xlsx,.csv"
          onChange={handleFileInputChange}
          style={{ display: 'none' }}
        />
      </div>

      {/* Validation Messages */}
      {validation && (
        <div className="validation-messages">
          {validation.errors.length > 0 && (
            <div className="validation-errors">
              {validation.errors.map((error, index) => (
                <div key={index} className="error-message">❌ {error}</div>
              ))}
            </div>
          )}
          {validation.warnings.length > 0 && (
            <div className="validation-warnings">
              {validation.warnings.map((warning, index) => (
                <div key={index} className="warning-message">⚠️ {warning}</div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Error Message */}
      {error && (
        <div className="error-message">
          ❌ {error}
        </div>
      )}

      {/* Upload Progress */}
      {uploadProgress && (
        <div className="upload-progress">
          <div className="progress-header">
            <span>Upload Progress</span>
            <span className="progress-percentage">
              {uploadProgress.progress || 0}%
            </span>
          </div>
          <div className="progress-bar">
            <div 
              className="progress-fill"
              style={{ width: `${uploadProgress.progress || 0}%` }}
            />
          </div>
          <div className="progress-details">
            <div className="progress-status">
              Status: <span className={`status-${uploadProgress.status}`}>
                {uploadProgress.status?.toUpperCase()}
              </span>
            </div>
            {uploadProgress.totalRecords && (
              <div className="progress-records">
                Records: {uploadProgress.processedRecords || 0} / {uploadProgress.totalRecords}
              </div>
            )}
            {uploadProgress.message && (
              <div className="progress-message">{uploadProgress.message}</div>
            )}
          </div>
        </div>
      )}

      {/* Action Buttons */}
      <div className="upload-actions">
        <button
          type="button"
          className="upload-button"
          onClick={handleUpload}
          disabled={!selectedFile || !validation?.isValid || isUploading}
        >
          {isUploading ? '⏳ Uploading...' : '🚀 Upload File'}
        </button>
        
        <button
          type="button"
          className="history-button"
          onClick={() => setShowHistory(!showHistory)}
        >
          📋 Upload History ({uploadHistory.length})
        </button>
      </div>

      {/* Upload History */}
      {showHistory && (
        <div className="upload-history">
          <h4>📋 Upload History</h4>
          {uploadHistory.length === 0 ? (
            <p className="no-history">No uploads yet</p>
          ) : (
            <div className="history-list">
              {uploadHistory.map((item) => (
                <div key={item.id} className="history-item">
                  <div className="history-header">
                    <div className="history-file">
                      <span className="file-icon">📄</span>
                      <span className="file-name">{item.fileName}</span>
                      <span className="file-size">({formatFileSize(item.fileSize)})</span>
                    </div>
                    <div className={`history-status status-${item.status}`}>
                      {item.status?.toUpperCase()}
                    </div>
                  </div>
                  <div className="history-details">
                    <div className="history-time">
                      Started: {formatDate(item.startTime)}
                      {item.endTime && (
                        <span> • Completed: {formatDate(item.endTime)}</span>
                      )}
                    </div>
                    {item.totalRecords && (
                      <div className="history-records">
                        Records: {item.processedRecords || 0} / {item.totalRecords}
                      </div>
                    )}
                    {item.errors && item.errors.length > 0 && (
                      <div className="history-errors">
                        Errors: {item.errors.join(', ')}
                      </div>
                    )}
                    {item.warnings && item.warnings.length > 0 && (
                      <div className="history-warnings">
                        Warnings: {item.warnings.join(', ')}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default HierarchyUpload;
