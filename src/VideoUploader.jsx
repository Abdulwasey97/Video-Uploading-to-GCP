import React, { useRef, useState } from 'react';
import axios from 'axios';
import VideoPlayer from './VideoPlayer';

export default function VideoUploader() {
  const fileInput = useRef(null);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [selectedFile, setSelectedFile] = useState(null);
  const [uploadedVideos, setUploadedVideos] = useState([]);
  const [loading, setLoading] = useState(false);
  const [chunkProgress, setChunkProgress] = useState({ current: 0, total: 0 });

  const handleFileSelect = (e) => {
    const file = e.target.files[0];
    setSelectedFile(file);
  };

  const fetchAllVideos = async () => {
    try {
      setLoading(true);
      const response = await axios.get('http://127.0.0.1:8000/api/videos');
      setUploadedVideos(response.data.videos || []);
    } catch (error) {
      console.error('Failed to fetch videos:', error);
    } finally {
      setLoading(false);
    }
  };

  // Resumable upload functions for large files (>30MB)
  const getResumableUploadUrl = async (filename) => {
    const response = await fetch(`http://127.0.0.1:8000/api/get-resumeable-upload-url?filename=${encodeURIComponent(filename)}`);
    const data = await response.json();
    return data.url;
  };

  const uploadFileToGCS = async (file) => {
    const chunkSize = 10 * 1024 * 1024; // 10MB
    const resumableUrl = await getResumableUploadUrl(file.name);

    let offset = 0;
    const totalSize = file.size;
    const totalChunks = Math.ceil(totalSize / chunkSize);
    let currentChunk = 0;

    setChunkProgress({ current: 0, total: totalChunks });

    while (offset < totalSize) {
      const chunk = file.slice(offset, offset + chunkSize);

      const headers = {
        'Content-Type': 'application/octet-stream',
        'Content-Range': `bytes ${offset}-${offset + chunk.size - 1}/${totalSize}`,
      };

      const response = await fetch(resumableUrl, {
        method: 'PUT',
        headers,
        body: chunk,
      });

      if (!response.ok && response.status !== 308) {
        throw new Error(`Upload failed at offset ${offset}: ${response.statusText}`);
      }

      offset += chunk.size;
      currentChunk++;
      
      // Update progress
      const progress = Math.round((offset / totalSize) * 100);
      setUploadProgress(progress);
      setChunkProgress({ current: currentChunk, total: totalChunks });
      
      console.log(`Uploaded chunk ${currentChunk}/${totalChunks} - up to byte ${offset}`);
    }

    console.log('Resumable upload complete!');
    return file.name;
  };

  // Chunked upload function for medium files (20-30MB)
  async function uploadFileInChunks(file) {
    const chunkSize = 10 * 1024 * 1024; // 10MB chunks
    const totalChunks = Math.ceil(file.size / chunkSize);
    const fileId = `${Date.now()}-${file.name}`;

    setChunkProgress({ current: 0, total: totalChunks });

    try {
      for (let i = 0; i < totalChunks; i++) {
        const chunk = file.slice(i * chunkSize, (i + 1) * chunkSize);

        // Get signed URL for this chunk
        const res = await fetch('http://127.0.0.1:8000/api/get-upload-url', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            fileId,
            chunkIndex: i,
          }),
        });

        if (!res.ok) {
          throw new Error(`Failed to get upload URL for chunk ${i + 1}`);
        }

        const { url, objectName } = await res.json();

        // Upload chunk using PUT
        await fetch(url, {
          method: 'PUT',	
          headers: { 'Content-Type': 'application/octet-stream' },
          body: chunk,
        });

        // Update progress
        const progress = Math.round(((i + 1) / totalChunks) * 100);
        setUploadProgress(progress);
        setChunkProgress({ current: i + 1, total: totalChunks });
        
        console.log(`Uploaded chunk ${i + 1}/${totalChunks}`);
      }

      // After all chunks uploaded, ask backend to compose
      const composeRes = await fetch('http://127.0.0.1:8000/api/merge-video', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fileId,
          totalChunks,
          finalName: file.name,
        }),
      });

      if (!composeRes.ok) {
        throw new Error('Failed to compose file chunks');
      }

      const composeData = await composeRes.json();
      
      // Return both fileId and signed URL
      return {
        signedUrl: composeData.signed_url,
      };
    } catch (error) {
      console.error('Chunked upload failed:', error);
      throw error;
    }
  }

  // Regular upload function for smaller files
  async function uploadFileDirect(file) {
    try {
      // Get signed URL from backend
      const res = await axios.post('http://127.0.0.1:8000/api/reassigned-file', {
        fileName: file.name,
      });

      const signedUrl = res.data.url;

      // Upload video using PUT request
      await axios.put(signedUrl, file, {
        headers: {
          'Content-Type': 'video/mp4', // Set correct type
        },
        onUploadProgress: (progressEvent) => {
          const percent = Math.round((progressEvent.loaded * 100) / progressEvent.total);
          setUploadProgress(percent);
          console.log(`Uploading: ${percent}%`);
        },
      });

      return file.name;
    } catch (error) {
      console.error('Direct upload failed:', error);
      throw error;
    }
  }

  const uploadVideo = async () => {
    const file = fileInput.current.files[0];
    if (!file) return;

    setUploading(true);
    setUploadProgress(0);
    setChunkProgress({ current: 0, total: 0 });

    try {
      let uploadResult;
      const fileSizeMB = file.size / (1024 * 1024);

      // Use resumable upload for files larger than 30MB
      if (fileSizeMB > 30) {
        console.log('Large file detected (>30MB), using resumable upload...');
        uploadResult = await uploadFileToGCS(file);
      }
      // Use chunked upload for files between 20-30MB
      else if (fileSizeMB > 20) {
        console.log('Medium file detected (20-30MB), using chunked upload...');
        uploadResult = await uploadFileInChunks(file);
      } else {
        console.log('Small file detected (<20MB), using direct upload...');
        uploadResult = await uploadFileDirect(file);
      }

      setUploading(false);
      setUploadProgress(100);
      
      // Handle different return types from upload functions
      let filename, signedUrl;
      if (typeof uploadResult === 'object') {
        // Chunked upload result
        filename = uploadResult.fileId;
        signedUrl = uploadResult.signedUrl;
        console.log('Video composed successfully! Signed URL:', signedUrl);
      } else {
        // Direct upload or resumable upload result
        filename = uploadResult;
      }
      
      // Add the uploaded video to the list with the filename
      const newVideo = {
        filename: filename,
        originalName: file.name,
        size: file.size,
        uploadedAt: new Date().toISOString(),
        signedUrl: signedUrl // Store signed URL if available
      };
      
      setUploadedVideos(prev => [newVideo, ...prev]);
      
      if (signedUrl) {
        alert(`Upload complete! Video is now available.\nSigned URL: ${signedUrl}`);
      } else {
        alert('Upload complete! Video is now available.');
      }
      
      // Reset form
      setSelectedFile(null);
      fileInput.current.value = '';
      setChunkProgress({ current: 0, total: 0 });
      
    } catch (error) {
      console.error('Upload failed:', error);
      setUploading(false);
      setUploadProgress(0);
      setChunkProgress({ current: 0, total: 0 });
      alert('Upload failed. Please try again.');
    }
  };

  const triggerFileInput = () => {
    fileInput.current.click();
  };

  // Load videos on component mount
  React.useEffect(() => {
    fetchAllVideos();
  }, []);

  // Helper function to determine upload method
  const getUploadMethod = (fileSizeMB) => {
    if (fileSizeMB > 30) return 'Resumable (10MB chunks)';
    if (fileSizeMB > 20) return 'Chunked (10MB chunks)';
    return 'Direct';
  };

  return (
    <div className="space-y-6">
      {/* Upload Section */}
      <div className="max-w-md mx-auto bg-white rounded-xl shadow-lg p-6">
        <div className="text-center">
          <h2 className="text-2xl font-bold text-gray-800 mb-6">Video Upload</h2>
          
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
                Supports MP4, AVI, MOV, and other video formats
              </p>
              {selectedFile && (
                <p className="text-xs text-blue-500 mt-1">
                  {(selectedFile.size / (1024 * 1024)).toFixed(2)} MB - 
                  {getUploadMethod(selectedFile.size / (1024 * 1024))}
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
              <p className="text-sm text-gray-600">
                <span className="font-medium">Upload Method:</span> 
                {getUploadMethod(selectedFile.size / (1024 * 1024))}
              </p>
            </div>
          )}

          {/* Progress section */}
          {uploading && (
            <div className="mt-4">
              {/* Main progress bar */}
              <div className="flex justify-between text-sm text-gray-600 mb-1">
                <span>
                  {chunkProgress.total > 0 ? 'Uploading chunks...' : 'Uploading...'}
                </span>
                <span>{uploadProgress}%</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2 mb-2">
                <div 
                  className="bg-blue-500 h-2 rounded-full transition-all duration-300"
                  style={{ width: `${uploadProgress}%` }}
                ></div>
              </div>

              {/* Chunk progress indicator */}
              {chunkProgress.total > 0 && (
                <div className="text-xs text-gray-500">
                  Chunk {chunkProgress.current} of {chunkProgress.total}
                  {chunkProgress.current === chunkProgress.total && chunkProgress.total > 1 && (
                    <span className="text-orange-500 ml-1">(Composing file...)</span>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Upload button */}
          <button 
            onClick={uploadVideo} 
            disabled={uploading || !selectedFile}
            className={`w-full mt-6 py-3 px-4 rounded-lg font-semibold transition-all duration-200 ${
              uploading || !selectedFile
                ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                : 'bg-blue-500 hover:bg-blue-600 text-white shadow-md hover:shadow-lg'
            }`}
          >
            {uploading ? 
              (chunkProgress.total > 0 ? 
                `Uploading chunk ${chunkProgress.current}/${chunkProgress.total}...` : 
                `Uploading... ${uploadProgress}%`
              ) : 
              'Upload Video'
            }
          </button>
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
                  <h3 className="font-semibold text-gray-800 truncate" title={video.originalName || video.name}>
                    {video.originalName || video.name}
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
                        // Use signed URL if available, otherwise fetch from API
                        if (video.signedUrl) {
                          window.open(video.signedUrl, '_blank');
                        } else {
                          fetch(`http://127.0.0.1:8000/api/video-url/${video.filename || video.name}`)
                            .then(res => res.json())
                            .then(data => window.open(data.url, '_blank'))
                            .catch(err => console.error('Error opening video:', err));
                        }
                      }}
                      className="flex-1 bg-blue-500 hover:bg-blue-600 text-white text-center py-2 px-3 rounded-lg text-sm transition-colors duration-200"
                    >
                      Open
                    </button>
                    <button
                      onClick={() => {
                        // Use signed URL if available, otherwise fetch from API
                        if (video.signedUrl) {
                          navigator.clipboard.writeText(video.signedUrl);
                          alert('Video URL copied to clipboard!');
                        } else {
                          fetch(`http://127.0.0.1:8000/api/video-url/${video.filename || video.name}`)
                            .then(res => res.json())
                            .then(data => {
                              navigator.clipboard.writeText(data.url);
                              alert('Video URL copied to clipboard!');
                            })
                            .catch(err => console.error('Error copying URL:', err));
                        }
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