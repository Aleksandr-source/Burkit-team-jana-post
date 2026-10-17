import React, { useRef, useState, useCallback, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X, Upload, Link as LinkIcon, Mic, Check, Square } from 'lucide-react';
import { useUploadAttachment } from '../../hooks/useAttachments';
import { cn } from '../../lib/utils';

export const AttachmentModal = ({ projectId, taskId, onClose }: { projectId: string; taskId: string; onClose: () => void }) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { uploadMultipleFiles, uploadLink, isUploading, progress } = useUploadAttachment(projectId, taskId);
  const [showLinkInput, setShowLinkInput] = useState(false);
  const [link, setLink] = useState('');
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isDragActive, setIsDragActive] = useState(false);
  
  const [isRecording, setIsRecording] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragActive(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragActive(false);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!isDragActive) {
      setIsDragActive(true);
    }
  }, [isDragActive]);

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const droppedFiles = e.dataTransfer.files;
      try {
        setError(null);
        await uploadMultipleFiles(droppedFiles);
        setSuccess(true);
        setTimeout(onClose, 1000);
      } catch (uploadError) {
        setError('Upload failed. Check CORS settings or network.');
        console.error('Upload error:', uploadError);
      }
    }
  }, [uploadMultipleFiles, onClose]);

  useEffect(() => {
    const handleWindowDragOver = (e: DragEvent) => e.preventDefault();
    const handleWindowDrop = (e: DragEvent) => e.preventDefault();
    
    // Prevent default browser behavior for drag and drop to avoid opening file backwards
    window.addEventListener('dragover', handleWindowDragOver);
    window.addEventListener('drop', handleWindowDrop);
    
    return () => {
      window.removeEventListener('dragover', handleWindowDragOver);
      window.removeEventListener('drop', handleWindowDrop);
    };
  }, []);

  const startRecording = async () => {
    try {
      setError(null);
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          audioChunksRef.current.push(e.data);
        }
      };

      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        const audioFile = new File([audioBlob], `voice-message-${Date.now()}.webm`, { type: 'audio/webm' });
        try {
          if (audioFile.size > 0) {
            setError(null);
            await uploadMultipleFiles([audioFile]);
            setSuccess(true);
            setTimeout(onClose, 1000);
          }
        } catch {
          setError('Failed to upload audio recording.');
        }
        
        // Stop all tracks to release the microphone
        stream.getTracks().forEach((track) => track.stop());
      };

      mediaRecorder.start();
      setIsRecording(true);
    } catch (err) {
      console.error('Mic error:', err);
      setError('Microphone access denied or not available.');
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const files = e.target.files;
      try {
        setError(null);
        await uploadMultipleFiles(files);
        setSuccess(true);
        setTimeout(onClose, 1000);
      } catch (uploadError) {
        let msg = uploadError instanceof Error ? uploadError.message : 'Upload failed. Check network or file size.';
        if (msg.includes("storage") || msg.toLowerCase().includes("permission") || msg.includes("Firebase Storage")) {
          msg = "Upload failed: Ensure Firebase Storage is enabled in the Firebase Console and Storage Rules allow read/write.";
        }
        setError(msg);
        console.error('Upload error in modal:', uploadError);
      } finally {
        if (fileInputRef.current) {
          fileInputRef.current.value = '';
        }
      }
    }
  };

  const handleLinkSubmit = async () => {
    if (link.trim()) {
      try {
        setError(null);
        await uploadLink(link);
        setSuccess(true);
        setTimeout(onClose, 1000);
      } catch {
        setError('Failed to add link');
      }
    }
  };

  return createPortal(
    <div 
      className="fixed inset-0 z-[9990] flex items-center justify-center surface-backdrop transition-colors"
      style={{ WebkitBackdropFilter: 'blur(16px)' }}
      onPointerDown={(e) => {
        e.stopPropagation();
        onClose();
      }}
      onClick={(e) => e.stopPropagation()}
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      <div 
        className={cn(
          "surface textPrimary rounded-xl p-3 w-[240px] shadow-xl animate-in fade-in zoom-in duration-200 transition-all relative overflow-hidden",
          isDragActive ? "border-blue-500 ring-4 ring-blue-500/20 scale-105" : "border-gray-200"
        )}
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => e.stopPropagation()}
      >
        {isDragActive && (
          <div className="absolute inset-0 z-20 flex items-center justify-center bg-white/90 dark:bg-[#0f172a]/90 backdrop-blur-sm pointer-events-none rounded-xl">
            <div className="flex flex-col items-center text-brand-accent animate-pulse">
              <Upload className="w-8 h-8 mb-2" />
              <span className="text-xs font-bold">Drop files here</span>
            </div>
          </div>
        )}

        <div className="flex justify-between items-center mb-2 px-1 relative z-10">
          <span className="text-xs font-bold text-gray-500 dark:text-gray-400">Add Attachment</span>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        {!success ? (
          <>
            {!showLinkInput ? (
              <div className="space-y-1">
                <div className="relative w-full">
                  <button disabled={isUploading} className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-white/10 text-gray-700 dark:text-gray-300 text-sm disabled:opacity-50">
                    <Upload className="w-4 h-4" /> Upload File
                  </button>
                  <input type="file" multiple ref={fileInputRef} onChange={handleFileChange} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer disabled:cursor-not-allowed" disabled={isUploading} />
                </div>
                
                <button disabled={isUploading || isRecording} onClick={() => setShowLinkInput(true)} className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-white/10 text-gray-700 dark:text-gray-300 text-sm disabled:opacity-50">
                  <LinkIcon className="w-4 h-4" /> Paste Link
                </button>
                {isRecording ? (
                  <button onClick={stopRecording} className="w-full flex items-center justify-center gap-2 px-2 py-1.5 rounded-lg bg-red-50 dark:bg-red-500/10 text-red-600 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-500/20 text-sm font-medium animate-pulse border border-red-200 dark:border-red-500/20">
                    <Square className="w-4 h-4 fill-current" /> Stop Recording
                  </button>
                ) : (
                  <button disabled={isUploading} onClick={startRecording} className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-white/10 text-gray-700 dark:text-gray-300 text-sm disabled:opacity-50">
                    <Mic className="w-4 h-4" /> Record Audio
                  </button>
                )}
              </div>
            ) : (
              <div className="space-y-2">
                <input
                  autoFocus
                  disabled={isUploading}
                  placeholder="Paste URL..."
                  value={link}
                  onChange={(e) => setLink(e.target.value)}
                  className="w-full px-2 py-1.5 bg-gray-50 dark:bg-white/5 border border-gray-200 dark:border-white/10 rounded-lg textPrimary text-sm outline-none focus:ring-1 focus:ring-blue-500 disabled:opacity-50"
                  onKeyDown={(e) => e.key === 'Enter' && handleLinkSubmit()}
                />
                <button disabled={isUploading} onClick={handleLinkSubmit} className="w-full bg-blue-500 text-white rounded-lg py-1.5 text-sm font-bold hover:bg-blue-600 disabled:opacity-50">
                  Add Link
                </button>
              </div>
            )}
           </>
        ) : (
          <div className="flex items-center justify-center gap-2 text-emerald-400 py-4"><Check className="w-5 h-5" /> Saved!</div>
        )}

        {isUploading && (
          <div className="mt-2 space-y-1">
            <div className="text-[10px] text-gray-500 flex justify-between">
              <span>{showLinkInput ? "Processing..." : `Uploading ${Math.round(progress)}%`}</span>
            </div>
            <div className="h-1 w-full bg-gray-200 rounded-full overflow-hidden">
              <div 
                className="h-full bg-blue-500 transition-all duration-300"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
        )}
        
        {error && (
          <div className="mt-2 text-[10px] text-red-600 dark:text-red-400 p-2 bg-red-50 dark:bg-red-500/10 border border-red-100 dark:border-red-500/20 rounded-md">
            {error}
          </div>
        )}
      </div>
    </div>,
    document.body
  );
};
