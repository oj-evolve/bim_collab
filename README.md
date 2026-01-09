# BIM Viewer & Collaboration Platform

A real-time, role-based collaboration platform designed for construction and engineering professionals. This application allows teams to view Building Information Modeling (BIM) data, share documents, and communicate securely across different stages of a construction project.

## 🚀 Key Features

*   **Role-Based Access**: Specialized dashboards for Architects, Engineers, Contractors, Quantity Surveyors, and Owners.
*   **Project Stages**: Navigate through the project lifecycle from Briefing to Completion.
*   **Real-Time Collaboration**:
    *   **Live Chat**: End-to-end encrypted messaging.
    *   **File Sharing**: Drag-and-drop support for images, PDFs, and 3D models (`.glb`, `.gltf`).
    *   **Typing Indicators**: See when others are contributing.
*   **3D Model Viewer**: Integrated support for viewing 3D assets directly in the browser.
*   **Multi-Project Management**: Owners can create, switch, and manage multiple project workspaces.
*   **Security**: Client-side encryption for sensitive project data.

## 🛠️ Getting Started

### Prerequisites
*   A modern web browser (Chrome, Edge, Firefox).
*   An active internet connection (for Firebase services).

### Installation
1.  Clone or download the repository.
2.  Serve the directory using a local web server (e.g., Live Server in VS Code, `http-server`, or Python's `http.server`).
    *   *Note: The app uses ES Modules and cannot be run directly from the file system (`file://`).*

## 📖 Usage Guide

### 1. Accessing the Workspace
Upon loading the application, you will be prompted to unlock the secure workspace.
*   **Default Project Key**: `bim-collab-secure-2024`
*   *Note: This key is used to derive encryption keys for secure communication.*

### 2. Selecting a Role
Use the dropdown menu in the top header to select your professional role. This customizes your dashboard and permissions:
*   **Owner**: Full access to project settings, creating new projects, and archiving chats.
*   **Architect/Quantity Surveyor**: Full access to all views and streams.
*   **Engineer/Contractor**: Focused view (restricted to specific streams relevant to execution).

### 3. Navigation
*   **Project Roadmap (Left Sidebar)**: Click on a stage (e.g., "Design Development", "Construction Phase") to switch contexts. Chat history and files are segregated by stage.
*   **Dashboard**:
    *   **Viewers**: Panels for viewing shared files and 3D models.
    *   **Streams**: Chat interfaces corresponding to the viewers.

### 4. Collaboration Tools
*   **Messaging**: Type in the chat box to send encrypted messages. Use the emoji button or quick reactions.
*   **File Upload**: Click the paperclip icon or drag and drop files into the chat card.
    *   Supported formats: Images, PDF, GLB/GLTF (3D), Audio/Video.
*   **Search**: Click the magnifying glass icon in any chat header to filter messages.

### 5. Owner Controls
If you are logged in as an **Owner**:
*   **Project Management**: Click your avatar > Settings to create new projects, rename the current project, or delete projects.
*   **Archiving**: You can archive chat histories or pin important messages for the team to see.

### 6. Settings
Click your **User Avatar** (top right) to access:
*   **Profile**: Update your display name and status (Online/Busy).
*   **Appearance**: Toggle Dark Mode.
*   **Notifications**: Mute sound effects.

## 🔒 Security
This application uses **End-to-End Encryption (E2EE)**.
*   Messages are encrypted on your device before being sent to the server.
*   The server (Firebase) only stores encrypted text.
*   Decryption happens locally in the browser using the Project Key.


## 📧 Contact & Support

Need help? Use the **Contact Us** link in the footer to send a message to the administration team.

---
&copy; 2024 OJ Evolve