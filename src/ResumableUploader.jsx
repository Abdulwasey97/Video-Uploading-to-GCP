import React, { useRef, useState, useEffect } from 'react';
import axios from 'axios';
import VideoPlayer from './VideoPlayer';

export default function ResumableUploader() {
  const fileInput = useRef(null);
  const [selectedFile, setSelectedFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadedVideos, setUploadedVideos] = useState([]);
  const [loading, setLoading] = useState(false);
  const [resumeData, setResumeData] = useState(null);
  const [uploadCancelToken, setUploadCancelToken] = useState(null);
  const [uploadPaused, setUploadPaused] = useState(false);

  // Load resume data from localStorage on component mount
  useEffect(() => {
    const savedResumeData = localStorage.getItem('resumeUploadData');
    if (savedResumeData) {
      setResumeData(JSON.parse(savedResumeData));
    }
  }, []);

  const saveResumeData = (data) => {
    localStorage.setItem('resumeUploadData', JSON.stringify(data));
    setResumeData(data);
  };

  const clearResumeData = () => {
    localStorage.removeItem('resumeUploadData');
    setResumeData(null);
    setUploadProgress(0);
  };

  const getUploadStatus = async (uploadUrl) => {
    try {
      const response = await fetch(uploadUrl, {
        method: 'PUT',
        headers: {
          'Content-Range': 'bytes */*'
        }
      });
      
      if (response.status === 308) {
        const range = response.headers.get('Range');
        if (range) {
          const uploadedBytes = parseInt(range.split('-')[1]) + 1;
          return uploadedBytes;
        }
      }
      return 0;
    } catch (error) {
      console.error('Error getting upload status:', error);
      return 0;
    }
  };

  const uploadFileToGCS = async (file, resumeFromByte = 0, existingUploadUrl = null) => {
    let uploadUrl = existingUploadUrl;
    let currentResumeData = resumeData;
    
    try {
      
      if (!uploadUrl) {
      // Step 1: Fetch signed URL from backend
      console.log('Fetching resumable upload URL...');
      const response = await fetch(
          `http://127.0.0.1:8000/api/get-resumeable-upload-url?filename=${file.name}`
      );
            const { url } = await response.json();
      const sessionRes = await fetch(url, {
        method: 'POST',
        headers: {
          'x-goog-resumable': 'start',
          'Content-Type': 'video/mp4'
        }
      });
        uploadUrl = sessionRes.headers.get('Location');
        
        // Save resume data
        currentResumeData = {
          file: {
            name: file.name,
            size: file.size,
            type: file.type
          },
          uploadUrl: uploadUrl,
          uploadedBytes: resumeFromByte
        };
        saveResumeData(currentResumeData);
      }

      // Create cancel token for axios
      const cancelToken = axios.CancelToken.source();
      setUploadCancelToken(cancelToken);

      // Prepare file slice for resume
      const fileSlice = resumeFromByte > 0 ? file.slice(resumeFromByte) : file;
      const totalSize = file.size;
      
      console.log(`Starting upload from byte ${resumeFromByte} of ${totalSize}`);
      
      // Step 2: Upload file directly to GCS using axios with progress tracking
      await axios.put(uploadUrl, fileSlice, {
        headers: {
          'Content-Type': 'video/mp4',
          ...(resumeFromByte > 0 && {
            'Content-Range': `bytes ${resumeFromByte}-${totalSize - 1}/${totalSize}`
          })
        },
        onUploadProgress: (progressEvent) => {
          const uploadedBytes = resumeFromByte + progressEvent.loaded;
          const percent = Math.round((uploadedBytes * 100) / totalSize);
          setUploadProgress(percent);
          console.log(`Uploading: ${percent}% (${uploadedBytes}/${totalSize} bytes)`);
          
          // Always update resume data during upload
          const updatedResumeData = {
            ...currentResumeData,
            uploadedBytes: uploadedBytes
          };
          saveResumeData(updatedResumeData);
          currentResumeData = updatedResumeData;
        },
        cancelToken: cancelToken.token
      });

        console.log('Resumable upload successful!');
        setUploadProgress(100);
      clearResumeData(); // Clear resume data on successful completion
      
      // Fetch the video URL after successful upload
      try {
        const urlResponse = await fetch(`http://127.0.0.1:8000/api/video-url/${file.name}`);
        console.log('urlResponse:', urlResponse);
        const urlData = await urlResponse.json();
        console.log('urlData:', urlData);
        console.log('Upload completed! Video URL:', urlData.url);
        return { filename: file.name, url: urlData.url };
      } catch (error) {
        console.error('Error fetching video URL:', error);
        return { filename: file.name, url: null };
      }
    } catch (error) {
      if (axios.isCancel(error)) {
        console.log('Upload paused by user at', currentResumeData?.uploadedBytes || 0, 'bytes');
        setUploadPaused(true);
        throw new Error('Upload paused');
      } else {
        console.error('Resumable upload failed:', error);
        throw error;
      }
    }
  };

  const handleFileSelect = (event) => {
    const file = event.target.files[0];
    if (file) {
      setSelectedFile(file);
      setUploadPaused(false); // Reset paused state
      
      // Check if there's existing resume data for this file
      if (resumeData && resumeData.file.name === file.name && resumeData.file.size === file.size) {
        const percent = Math.round((resumeData.uploadedBytes * 100) / resumeData.file.size);
        setUploadProgress(percent);
        console.log(`Found resume data for ${file.name}: ${percent}% completed`);
      } else {
        clearResumeData(); // Clear old resume data
        setUploadProgress(0);
      }
    }
  };

  const triggerFileInput = () => {
    fileInput.current.click();
  };

  const uploadVideo = async () => {
    console.log('Uploading video...');
    if (!selectedFile) return;
    console.log('Selected file:', selectedFile);
    
    setUploading(true);
    setUploadPaused(false);

    try {
      const result = await uploadFileToGCS(selectedFile);
      console.log('Upload completed:', result);
      
      // Show success message with URL
      if (result.url) {
        alert(`Upload completed successfully!\n\nVideo URL: ${result.url}\n\nURL copied to clipboard!`);
        navigator.clipboard.writeText(result.url).catch(err => console.error('Failed to copy URL:', err));
      } else {
        alert('Upload completed successfully!');
      }
      
      // Add to uploaded videos list
      const newVideo = {
        filename: result.filename,
        name: selectedFile.name,
        size: selectedFile.size,
        uploadedAt: new Date().toISOString(),
        url: result.url
      };
      setUploadedVideos(prev => [...prev, newVideo]);
      
      // Reset form
      setSelectedFile(null);
      setUploadProgress(0);
      setUploadPaused(false);
      if (fileInput.current) {
        fileInput.current.value = '';
      }
    } catch (error) {
      if (error.message !== 'Upload paused') {
        console.error('Upload failed:', error);
        alert('Upload failed: ' + error.message);
        setUploadPaused(false);
      }
    } finally {
      setUploading(false);
      setUploadCancelToken(null);
    }
  };

  const resumeUpload = async () => {
    if (!resumeData || !selectedFile) return;
    
    console.log('Resuming upload from:', resumeData.uploadedBytes, 'bytes');
    setUploading(true);
    setUploadPaused(false);
    
    try {
      // Use the saved uploadedBytes as the resume point
      const resumeFromByte = resumeData.uploadedBytes || 0;
      console.log('Resuming from byte:', resumeFromByte);
      
      const result = await uploadFileToGCS(
        selectedFile, 
        resumeFromByte, 
        resumeData.uploadUrl
      );
      
      console.log('Resume upload completed:', result);
      
      // Show success message with URL
      if (result.url) {
        alert(`Resume upload completed successfully!\n\nVideo URL: ${result.url}\n\nURL copied to clipboard!`);
        navigator.clipboard.writeText(result.url).catch(err => console.error('Failed to copy URL:', err));
      } else {
        alert('Resume upload completed successfully!');
      }
      
      // Add to uploaded videos list
      const newVideo = {
        filename: result.filename,
        name: selectedFile.name,
        size: selectedFile.size,
        uploadedAt: new Date().toISOString(),
        url: result.url
      };
      setUploadedVideos(prev => [...prev, newVideo]);
      
      // Reset form
      setSelectedFile(null);
      setUploadProgress(0);
      setUploadPaused(false);
      if (fileInput.current) {
        fileInput.current.value = '';
      }
    } catch (error) {
      if (error.message !== 'Upload paused') {
        console.error('Resume upload failed:', error);
        alert('Resume upload failed: ' + error.message);
        setUploadPaused(false);
      }
    } finally {
      setUploading(false);
      setUploadCancelToken(null);
    }
  };

  const pauseUpload = () => {
    if (uploadCancelToken) {
      console.log('Pausing upload...');
      uploadCancelToken.cancel('Upload paused by user');
    }
  };

  const cancelUpload = () => {
    if (uploadCancelToken) {
      uploadCancelToken.cancel('Upload cancelled by user');
    }
    clearResumeData();
    setUploading(false);
    setUploadPaused(false);
    setUploadProgress(0);
  };

  const fetchAllVideos = async () => {
    setLoading(true);
    try {
      const response = await fetch('http://127.0.0.1:8000/api/videos');
      const videos = await response.json();
      setUploadedVideos(videos);
    } catch (error) {
      console.error('Error fetching videos:', error);
    } finally {
      setLoading(false);
    }
  };

  // Check if current file can be resumed
  const canResumeCurrentFile = selectedFile && resumeData && 
    resumeData.file.name === selectedFile.name && 
    resumeData.file.size === selectedFile.size && 
    resumeData.uploadedBytes > 0 && 
    !uploading;

  const isUploadInProgress = uploading || uploadPaused;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="text-center">
        <h1 className="text-3xl font-bold text-gray-800 mb-2">Resumable Video Upload</h1>
        <p className="text-gray-600">Upload video files with pause and resume capability</p>
      </div>

      {/* Upload Section */}
      <div className="max-w-md mx-auto bg-white rounded-xl shadow-lg p-6">
        <div className="text-center">
          <h2 className="text-2xl font-bold text-gray-800 mb-6">File Upload</h2>
          
          {/* Hidden file input */}
          <input 
            type="file" 
            ref={fileInput} 
            accept="video/*" 
            onChange={handleFileSelect}
            className="hidden"
          />
          
          {/* Custom file upload area */}
          <div 
            onClick={triggerFileInput}
            className="border-2 border-dashed border-gray-300 rounded-lg p-8 cursor-pointer hover:border-blue-400 hover:bg-blue-50 transition-all duration-200"
          >
            <div className="text-center">
              <svg className="mx-auto h-12 w-12 text-gray-400 mb-4" stroke="currentColor" fill="none" viewBox="0 0 48 48">
                <path d="M28 8H12a4 4 0 00-4 4v20m32-12v8m0 0v8a4 4 0 01-4 4H12a4 4 0 01-4-4v-4m32-4l-3.172-3.172a4 4 0 00-5.656 0L28 28M8 32l9.172-9.172a4 4 0 015.656 0L28 28m0 0l4 4m4-24h8m-4-4v8m-12 4h.02" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              <p className="text-gray-600">
                {selectedFile ? selectedFile.name : 'Click to select a video file'}
              </p>
              <p className="text-sm text-gray-400 mt-2">
                Upload with pause and resume capability
              </p>
              {selectedFile && (
                <p className="text-xs text-blue-500 mt-1">
                  {(selectedFile.size / (1024 * 1024)).toFixed(2)} MB
                </p>
              )}
            </div>
          </div>

          {/* File info */}
          {selectedFile && (
            <div className="mt-4 p-3 bg-gray-50 rounded-lg">
              <p className="text-sm text-gray-600">
                <span className="font-medium">File:</span> {selectedFile.name}
              </p>
              <p className="text-sm text-gray-600">
                <span className="font-medium">Size:</span> {(selectedFile.size / (1024 * 1024)).toFixed(2)} MB
              </p>
              {canResumeCurrentFile && (
              <p className="text-sm text-green-600">
                  <span className="font-medium">Resume available:</span> {uploadProgress}% completed
              </p>
              )}
            </div>
          )}

          {/* Resume notification */}
          {canResumeCurrentFile && (
            <div className="mt-4 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
              <p className="text-sm text-yellow-800 font-medium">Resume Available</p>
              <p className="text-xs text-yellow-600">
                {uploadProgress}% was uploaded previously
              </p>
            </div>
          )}

          {/* Progress section */}
          {(isUploadInProgress || uploadProgress > 0) && (
            <div className="mt-4">
              <div className="flex justify-between text-sm text-gray-600 mb-1">
                <span>
                  {uploading ? 'Uploading...' : uploadPaused ? 'Upload Paused' : canResumeCurrentFile ? 'Ready to resume' : 'Upload complete'}
                </span>
                <span>{uploadProgress}%</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-3 mb-2">
                <div 
                  className={`h-3 rounded-full transition-all duration-300 ${
                    uploadPaused ? 'bg-yellow-500' : uploadProgress === 100 ? 'bg-blue-500' : 'bg-green-500'
                  }`}
                  style={{ width: `${uploadProgress}%` }}
                ></div>
              </div>
              {uploadPaused && (
                <p className="text-xs text-yellow-600 text-center">
                  Upload paused at {uploadProgress}% - click Resume to continue
                </p>
              )}
            </div>
          )}

          {/* Upload buttons */}
          <div className="mt-6 space-y-2">
            {!uploading && !canResumeCurrentFile && (
            <button 
              onClick={uploadVideo} 
                disabled={!selectedFile}
              className={`w-full py-3 px-4 rounded-lg font-semibold transition-all duration-200 ${
                  !selectedFile
                  ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                  : 'bg-green-500 hover:bg-green-600 text-white shadow-md hover:shadow-lg'
              }`}
            >
                Start Upload
              </button>
            )}

            {canResumeCurrentFile && !uploading && (
              <div className="space-y-2">
                <button 
                  onClick={resumeUpload}
                  className="w-full py-3 px-4 rounded-lg font-semibold bg-blue-500 hover:bg-blue-600 text-white transition-all duration-200"
                >
                  Resume Upload ({uploadProgress}%)
                </button>
                <button 
                  onClick={clearResumeData}
                  className="w-full py-2 px-4 rounded-lg font-semibold bg-gray-500 hover:bg-gray-600 text-white transition-all duration-200"
                >
                  Start Over
            </button>
              </div>
            )}
            
            {uploading && (
              <div className="space-y-2">
                <button 
                  onClick={pauseUpload}
                  className="w-full py-3 px-4 rounded-lg font-semibold bg-yellow-500 hover:bg-yellow-600 text-white transition-all duration-200"
                >
                  Pause Upload
                </button>
              <button 
                onClick={cancelUpload}
                className="w-full py-2 px-4 rounded-lg font-semibold bg-red-500 hover:bg-red-600 text-white transition-all duration-200"
              >
                  Cancel Upload
              </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Uploaded Videos Section */}
      <div className="max-w-4xl mx-auto">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-2xl font-bold text-gray-800">Uploaded Videos</h2>
          <button
            onClick={fetchAllVideos}
            disabled={loading}
            className="bg-green-500 hover:bg-green-600 text-white px-4 py-2 rounded-lg transition-colors duration-200 disabled:bg-gray-300"
          >
            {loading ? 'Loading...' : 'Refresh'}
          </button>
        </div>

        {uploadedVideos.length === 0 ? (
          <div className="bg-white rounded-xl shadow-lg p-8 text-center">
            <svg className="mx-auto h-16 w-16 text-gray-400 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 002 2v8a2 2 0 002 2z" />
            </svg>
            <p className="text-gray-500">No videos uploaded yet</p>
          </div>
        ) : (
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {uploadedVideos.map((video, index) => (
              <div key={index} className="bg-white rounded-xl shadow-lg overflow-hidden">
                <div className="aspect-video bg-black">
                  <VideoPlayer 
                    filename={video.filename || video.name} 
                    className="w-full h-full"
                  />
                </div>
                <div className="p-4">
                  <h3 className="font-semibold text-gray-800 truncate" title={video.name}>
                    {video.name}
                  </h3>
                  <p className="text-sm text-gray-500 mt-1">
                    Size: {(video.size / (1024 * 1024)).toFixed(2)} MB
                  </p>
                  {video.uploadedAt && (
                    <p className="text-sm text-gray-500">
                      Uploaded: {new Date(video.uploadedAt).toLocaleDateString()}
                    </p>
                  )}
                  <div className="mt-3 flex space-x-2">
                    <button
                      onClick={() => {
                        fetch(`http://127.0.0.1:8000/api/video-url/${video.filename || video.name}`)
                          .then(res => res.json())
                          .then(data => window.open(data.url, '_blank'))
                          .catch(err => console.error('Error opening video:', err));
                      }}
                      className="flex-1 bg-blue-500 hover:bg-blue-600 text-white text-center py-2 px-3 rounded-lg text-sm transition-colors duration-200"
                    >
                      Open
                    </button>
                    <button
                      onClick={() => {
                        fetch(`http://127.0.0.1:8000/api/video-url/${video.filename || video.name}`)
                          .then(res => res.json())
                          .then(data => {
                            navigator.clipboard.writeText(data.url);
                            alert('Video URL copied to clipboard!');
                          })
                          .catch(err => console.error('Error copying URL:', err));
                      }}
                      className="flex-1 bg-gray-500 hover:bg-gray-600 text-white py-2 px-3 rounded-lg text-sm transition-colors duration-200"
                    >
                      Copy URL
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
} 