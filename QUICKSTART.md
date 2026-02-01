# ThinkFlow - Quick Start Guide

## 🚀 Getting Started in 3 Steps

### Step 1: Extract and Install
```bash
# Extract the zip file
unzip thinkflow.zip
cd thinkflow

# Install all dependencies
npm install
cd client && npm install
cd ../server && npm install
cd ..
```

### Step 2: Run the Application
```bash
# From the root thinkflow directory
npm run dev
```

This will start both the frontend and backend servers:
- Frontend: http://localhost:3000
- Backend: http://localhost:5000

### Step 3: Start Using ThinkFlow!
Open your browser and visit http://localhost:3000

## 📋 Features Overview

### Tasks Tab
- Create tasks with title, description, priority (low/medium/high), and status
- Mark tasks as complete with a single click
- Edit existing tasks
- Delete completed tasks
- Visual priority indicators
- Automatic timestamp tracking

### Notes Tab
- Create rich notes with titles and content
- Add tags for organization (comma-separated)
- Search and filter by tags
- Edit and delete notes
- Timestamp tracking
- Clean card-based layout

## 🛠️ Tech Stack

**Frontend:**
- Next.js 14 (React Framework)
- TypeScript
- Tailwind CSS
- SWR for data fetching

**Backend:**
- Node.js + Express
- SQLite Database
- RESTful API

## 📁 Project Structure

```
thinkflow/
├── client/          # Next.js frontend application
├── server/          # Express backend API
├── database/        # SQLite database and schema
├── package.json     # Root package.json for running both
└── README.md        # Full documentation
```

## 🔧 Troubleshooting

**"Port 5000 already in use"**
- Edit `server/.env` and change PORT to another number (e.g., 5001)
- Update `client/.env.local` to match: `NEXT_PUBLIC_API_URL=http://localhost:5001`

**"Cannot connect to API"**
- Ensure the backend is running (check terminal output)
- Verify the API URL in `client/.env.local` matches your backend port

**"Database errors"**
- The database will be created automatically on first run
- If issues persist, delete `database/thinkflow.db` and restart

## 🎨 Customization

### Change Color Scheme
Edit `client/tailwind.config.js` to modify the primary color palette

### Add New Features
- Backend: Add new routes in `server/routes/`
- Frontend: Create new components in `client/components/`
- Database: Modify schema in `server/models/database.js`

## 📚 API Endpoints

### Tasks
- `GET /api/tasks` - Get all tasks
- `POST /api/tasks` - Create task
- `PUT /api/tasks/:id` - Update task
- `DELETE /api/tasks/:id` - Delete task

### Notes
- `GET /api/notes` - Get all notes
- `POST /api/notes` - Create note
- `PUT /api/notes/:id` - Update note
- `DELETE /api/notes/:id` - Delete note

## 🚢 Production Deployment

### Build for Production
```bash
# Build frontend
cd client
npm run build

# Backend is ready as-is
cd ../server
```

### Run in Production
```bash
# Frontend
cd client
npm start

# Backend
cd server
npm start
```

## 💡 Tips

1. **Keyboard Shortcuts**: Use Tab to navigate between form fields
2. **Tags**: Use commas to separate multiple tags in notes
3. **Priority**: High priority tasks are highlighted in red
4. **Status**: Click the checkbox to quickly toggle task completion
5. **Dark Mode**: Automatically detects your system preference

## 🤝 Need Help?

Check the full README.md for detailed documentation, or:
- Review the API endpoints
- Check the console for error messages
- Ensure all dependencies are installed
- Verify environment variables are set correctly

## 🎉 Enjoy ThinkFlow!

Happy organizing! 📝✅
