import React from 'react'
import { BrowserRouter as Router, Routes, Route, Link, useLocation } from 'react-router-dom'
import VideoUploader from './VideoUploader'
import ResumableUploader from './ResumableUploader'

// Navigation component
const Navigation = () => {
  const location = useLocation();
  
  return (
    <div className="max-w-4xl mx-auto mb-8">
      <nav className="bg-white rounded-xl shadow-lg p-4">
        <div className="flex justify-center space-x-4">
          <Link
            to="/"
            className={`px-6 py-3 rounded-lg font-semibold transition-all duration-200 ${
              location.pathname === '/'
                ? 'bg-blue-500 text-white shadow-md'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            Regular Upload
          </Link>
          <Link
            to="/resumable"
            className={`px-6 py-3 rounded-lg font-semibold transition-all duration-200 ${
              location.pathname === '/resumable'
                ? 'bg-green-500 text-white shadow-md'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            Resumable Upload
          </Link>
        </div>
        <div className="mt-3 text-center">
          <p className="text-sm text-gray-600">
            {location.pathname === '/' 
              ? 'For files ≤30MB with chunked upload option'
              : 'For large files >30MB with resume capability'
            }
          </p>
        </div>
      </nav>
    </div>
  );
};

// Main App component
const App = () => {
  return (
    <Router>
      <div className="min-h-screen bg-gray-100 py-8 px-4">
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-gray-800 mb-2">Video Upload Platform</h1>
          <p className="text-gray-600">Upload your videos securely to the cloud</p>
        </div>
        
        <Navigation />
        
        <Routes>
          <Route path="/" element={<VideoUploader />} />
          <Route path="/resumable" element={<ResumableUploader />} />
        </Routes>
      </div>
    </Router>
  )
}

export default App;