🎥 GCP Video Uploader with Resumable Uploads
This project enables large video file uploads (up to 5GB or more) directly to Google Cloud Storage (GCS) using a secure, resumable upload strategy. The backend is built with Laravel and the frontend with React.

Built for performance, security, and scalability—no file passes through your own server.

✨ Features
🔐 Signed URL generation for secure access

📤 Resumable video uploads to GCS

🔄 Pause/Resume support for large files

🧾 Chunked uploads (default: 10MB)

✅ CORS-compliant setup for browser compatibility

🌐 Laravel backend API + React frontend

🛠️ Tech Stack
Backend: Laravel 10+, Google Cloud PHP SDK

Frontend: React 18+, Axios, Fetch API

Cloud: Google Cloud Storage (GCS)

📁 Folder Structure
bash
Copy
Edit
├── backend/               # Laravel API
│   └── app/Http/Controllers/UploadController.php
│   └── routes/api.php
├── frontend/              # React App
│   └── src/VideoUploader.jsx
└── .env                   # GCP credentials
🚀 Getting Started
1. Clone the Repository
bash
Copy
Edit
git clone https://github.com/yourusername/gcp-video-uploader.git
cd gcp-video-uploader
🔧 Backend Setup (Laravel)
Navigate to the backend directory:

bash
Copy
Edit
cd backend
composer install
Create a .env file and set your Google service credentials:

env
Copy
Edit
GOOGLE_APPLICATION_CREDENTIALS=/absolute/path/to/service-account.json
Add a route in routes/api.php:

php
Copy
Edit
Route::get('/get-resumeable-upload-url', [UploadController::class, 'generateResumableUploadUrl']);
Example controller method:

php
Copy
Edit
use Google\Cloud\Storage\StorageClient;

public function generateResumableUploadUrl(Request $request)
{
    $fileName = $request->query('filename');

    $storage = new StorageClient([
        'keyFilePath' => env('GOOGLE_APPLICATION_CREDENTIALS'),
    ]);

    $bucket = $storage->bucket('your-bucket-name');
    $object = $bucket->object("videos/{$fileName}");

    $url = $object->signedUrl(
        new \DateTime('+15 minutes'),
        [
            'method' => 'PUT',
            'headers' => ['x-goog-resumable' => 'start'],
        ]
    );

    return response()->json(['url' => $url]);
}
🌐 Frontend Setup (React)
Navigate to frontend directory:

bash
Copy
Edit
cd frontend
npm install
Run the development server:

bash
Copy
Edit
npm run dev
Use VideoUploader.jsx component for uploading:

jsx
Copy
Edit
const uploadFileToGCS = async (file) => {
  const response = await fetch(`http://localhost:8000/api/get-resumeable-upload-url?filename=${file.name}`);
  const { url } = await response.json();

  const chunkSize = 10 * 1024 * 1024; // 10MB
  let offset = 0;

  while (offset < file.size) {
    const chunk = file.slice(offset, offset + chunkSize);
    await fetch(url, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/octet-stream',
        'Content-Range': `bytes ${offset}-${offset + chunk.size - 1}/${file.size}`,
      },
      body: chunk,
    });
    offset += chunk.size;
  }
};
⚙️ CORS Configuration
Create a cors.json file:

json
Copy
Edit
[
  {
    "origin": ["*"],
    "method": ["PUT", "POST", "GET", "OPTIONS"],
    "responseHeader": ["Content-Type", "x-goog-resumable"],
    "maxAgeSeconds": 3600
  }
]
Update CORS for your bucket:

bash
Copy
Edit
gsutil cors set cors.json gs://your-bucket-name
✅ Permissions Checklist
Ensure your service account has these IAM roles:

Storage Object Admin (roles/storage.objectAdmin)

(Optional) Storage Admin for full control

Assign via:

bash
Copy
Edit
gsutil iam ch serviceAccount:your-service-account@project-id.iam.gserviceaccount.com:roles/storage.objectAdmin gs://your-bucket-name
📦 Build & Deploy
Laravel API can be hosted on any PHP-compatible host or Cloud Run

React frontend can be hosted via Vercel, Netlify, Firebase Hosting, etc.

🙏 Acknowledgments
Google Cloud Storage

Laravel Framework

ReactJS

Axios + Fetch APIs

📄 License
MIT
