import { useState } from 'react';
import { doc, updateDoc, arrayUnion } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { Attachment } from '../types';
import { saveFile } from '../lib/idb';

export const useUploadAttachment = (projectId: string, taskId: string) => {
  const [isUploading, setIsUploading] = useState(false);
  const [progress, setProgress] = useState(0);

  const uploadFile = async (file: File, fileIndex: number, totalFiles: number, fileProgresses: number[]) => {
    console.log("Saving file to IndexedDB:", file.name, "size:", file.size);
    if (!taskId || taskId === 'undefined' || taskId === 'null') {
      console.error("Invalid taskId:", taskId);
      throw new Error("Invalid taskId");
    }

    const fileId = Date.now().toString() + Math.random();
    
    // Simulate progress for UI feedback
    return new Promise<Attachment>((resolve) => {
      let currentProgress = 0;
      const interval = setInterval(() => {
        currentProgress += 20;
        fileProgresses[fileIndex] = Math.min(currentProgress, 100);
        const totalProgress = fileProgresses.reduce((sum, val) => sum + val, 0) / totalFiles;
        setProgress(totalProgress);
        
        if (currentProgress >= 100) {
          clearInterval(interval);
          
          saveFile({
            id: fileId,
            name: file.name,
            type: file.type || 'application/octet-stream',
            file: file,
            createdAt: Date.now()
          }).then(() => {
            resolve({
              id: fileId,
              taskId,
              url: `idb://${fileId}`,
              name: file.name,
              type: file.type.startsWith('image/') ? 'image' : 
                    file.type.startsWith('video/') ? 'video' : 
                    file.type.startsWith('audio/') ? 'audio' : 'file',
              size: file.size,
              createdAt: Date.now(),
            });
          });
        }
      }, 100); // Quick 500ms upload simulation
    });
  };

  const uploadMultipleFiles = async (files: FileList | File[]) => {
    console.log("uploadMultipleFiles started with files:", files);
    const MAX_SIZE = 20 * 1024 * 1024;
    const fileArray = Array.from(files);
    console.log("fileArray length:", fileArray.length);
    const invalidFiles = fileArray.filter(f => f.size > MAX_SIZE);
    
    if (invalidFiles.length > 0) {
      const msg = `The following files exceed 20MB: ${invalidFiles.map(f => f.name).join(', ')}`;
      console.error(msg);
      throw new Error(msg);
    }

    setIsUploading(true);
    setProgress(0);
    const fileProgresses = new Array(fileArray.length).fill(0);
    
    try {
      console.log("Starting Promise.all for uploads...");
      const attachments = await Promise.all(fileArray.map((file, i) => uploadFile(file, i, fileArray.length, fileProgresses)));
      console.log("All uploads finished, attachments:", attachments);
      
      const taskRef = doc(db, 'projects', projectId, 'tasks', taskId);
      console.log("Updating Firestore doc:", taskRef.path);
      await updateDoc(taskRef, {
        attachments: arrayUnion(...attachments)
      });
      console.log("Firestore updated successfully.");
      return attachments;
    } catch (e) {
      console.error('Upload failed with error:', e);
      throw e;
    } finally {
      setIsUploading(false);
    }
  };

  const uploadLink = async (rawUrl: string) => {
    setIsUploading(true);
    let url = rawUrl.trim();
    if (!url.match(/^[a-zA-Z]+:\/\//)) {
      url = 'https://' + url;
    }
    let title = url;
    let description = '';
    let image = '';
    let favicon = '';

    try {
      // Try to fetch metadata using Microlink as a free serverless API
      const response = await fetch(`https://api.microlink.io?url=${encodeURIComponent(url)}`);
      if (response.ok) {
        const data = await response.json();
        if (data && data.status === 'success' && data.data) {
          title = data.data.title || url;
          description = data.data.description || '';
          image = data.data.image?.url || '';
          favicon = data.data.logo?.url || '';
        }
      }
    } catch (e) {
      console.warn('Failed to fetch link metadata', e);
    }

    const newAttachment: Attachment = {
      id: Date.now().toString(),
      taskId,
      url,
      name: title,
      type: 'link',
      size: 0,
      createdAt: Date.now(),
      linkMetadata: {
        title,
        description,
        image,
        favicon
      }
    };
    const taskRef = doc(db, 'projects', projectId, 'tasks', taskId);
    await updateDoc(taskRef, {
      attachments: arrayUnion(newAttachment)
    });
    setIsUploading(false);
  };

  return { uploadMultipleFiles, uploadLink, isUploading, progress };
};
