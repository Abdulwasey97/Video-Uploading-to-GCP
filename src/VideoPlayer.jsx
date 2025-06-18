import React, { useEffect, useState } from "react";

const VideoPlayer = ({ filename, className = "", showControls = true }) => {
  const [videoUrl, setVideoUrl] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!filename) return;
    
    setLoading(true);
    setError(null);
    
    fetch(`http://127.0.0.1:8000/api/video-url/${filename}`)
      .then((res) => {
        if (!res.ok) {
          throw new Error(`HTTP error! status: ${res.status}`);
        }
        return res.json();
      })
      .then((data) => {
        setVideoUrl(data.url);
        setLoading(false);
      })
      .catch((err) => {
        console.error("Error fetching video URL", err);
        setError(err.message);
        setLoading(false);
      });
  }, [filename]);

  if (loading) {
    return (
      <div className={`flex items-center justify-center bg-gray-100 rounded-lg ${className}`}>
        <div className="text-center p-8">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mx-auto mb-2"></div>
          <p className="text-gray-600">Loading video...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={`flex items-center justify-center bg-red-50 rounded-lg ${className}`}>
        <div className="text-center p-8">
          <svg className="mx-auto h-12 w-12 text-red-400 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <p className="text-red-600">Error loading video</p>
          <p className="text-red-500 text-sm mt-1">{error}</p>
        </div>
      </div>
    );
  }

  return videoUrl ? (
    <video 
      controls={showControls}
      className={`w-full h-full object-contain rounded-lg ${className}`}
      preload="metadata"
    >
      <source src={videoUrl} type="video/mp4" />
      Your browser does not support the video tag.
    </video>
  ) : (
    <div className={`flex items-center justify-center bg-gray-100 rounded-lg ${className}`}>
      <p className="text-gray-600">No video available</p>
    </div>
  );
};

export default VideoPlayer; 