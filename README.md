# Omego 🌟

![Omego Banner](file:///C:/Users/harsh/.gemini/antigravity/brain/7e8abf51-10c2-4d21-9902-7ca70e58343d/omego_banner_1777474806335.png)

> [!CAUTION]
> **18+ ADULT CONTENT ONLY**  
> This application is designed for mature audiences. It facilitates unfiltered adult chat connections. By accessing this platform, users must confirm they are of legal adult age in their jurisdiction.

Omego is a high-performance, real-time text chat platform designed with a focus on modern aesthetics, privacy, and innovative adult social features. By combining WebRTC data channels for peer-to-peer communication with AI-driven sentiment analysis, Omego offers a unique way for adults to connect globally.

**🌐 Live Demo:** [omego.vercel.app](https://omego.vercel.app)

## ✨ Features

- **🚀 Real-Time Communication**: Instant P2P text chat powered by **PeerJS** and **Socket.io**.
- **🧠 AI Sentiment Analysis**: Live feedback on the "mood" of the conversation using natural language processing.
- **☁️ Cloud-Synced Logs**: Automatic conversation logging to **Google Drive/Sheets** for secure data persistence.
- **💎 Premium UI**: A stunning **Glassmorphism** design system built with Vanilla CSS and Vite for lightning-fast loading.
- **🛡️ Secure Backend**: Hardened with **Helmet**, **Rate Limiting**, and **CORS** protection.
- **📱 Responsive Design**: Fully optimized for Desktop, Tablet, and Mobile.

## 🛠️ Tech Stack

### Frontend
- **Vite**: Modern build tool for rapid development.
- **PeerJS**: Simplified WebRTC data channels for secure P2P messaging.
- **Socket.io-client**: Real-time bidirectional communication.
- **Sentiment**: Lightweight NLP for sentiment analysis.
- **Lucide**: Clean and consistent iconography.

### Backend
- **Node.js & Express**: Fast, unopinionated web framework.
- **Socket.io**: Real-time event handling.
- **Google APIs**: Integration with Google Drive and Sheets.
- **Security Middleware**: Helmet, Express-rate-limit, Compression.

## 🚀 Getting Started

### Prerequisites
- Node.js (v18 or higher)
- Google Cloud Service Account (for Drive integration)

### Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/harshpal-coder/aurachat.git
   cd aurachat
   ```

2. **Install dependencies**
   ```bash
   npm run install:all
   ```

3. **Environment Setup**
   Create a `.env` file in the `backend` directory and add your credentials:
   ```env
   PORT=3000
   GOOGLE_DRIVE_FOLDER_ID=your_folder_id
   # Add other required environment variables
   ```

4. **Run the application**
   ```bash
   # Start the development server
   npm run dev
   ```

## 🏗️ Architecture

Omego follows a modular client-server architecture:
- **Frontend** handles the UI state and P2P connection handshake via PeerJS.
- **Backend** acts as a signaling server for Socket.io and manages sensitive integrations with Google Cloud.

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

---

Built with ❤️ by [harshpal-coder](https://github.com/harshpal-coder)
