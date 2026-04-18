# 🍳 RasoiAI — Smart AI Cooking Assistant

RasoiAI is an AI-powered cooking assistant that generates recipes based on available ingredients using advanced AI models.

---

## 🚀 Features

* 🥗 Ingredient-based recipe generation
* 🖼️ Image upload for ingredient detection
* 🔄 Regenerate recipes (remove ingredients)
* 📄 Download recipe as PDF
* 🔗 External recipe links + YouTube videos
* 🧠 Smart fallback system
* ⚡ Fast & optimized backend
* 🎨 Premium dashboard UI

---

## 🧱 Tech Stack

### Frontend

* React (Vite)
* Tailwind CSS
* Framer Motion

### Backend

* FastAPI (Python)
* Google Gemini API
* Serper API (search)
* YouTube API

---

## ⚙️ Setup Instructions

### 1. Clone Repo

```bash
git clone https://github.com/your-username/rasoi-ai.git
cd rasoi-ai
```

---

### 2. Backend Setup

```bash
cd backend
pip install -r requirements.txt
uvicorn app.main:app --reload
```

---

### 3. Frontend Setup

```bash
cd frontend
npm install
npm run dev
```

---

## 🔗 API Endpoints

* POST `/api/generate-recipe`
* POST `/api/regenerate`
* GET `/api/search-links`
* POST `/api/generate-pdf`
* GET `/api/status`

---

## 💡 Project Idea

This project helps users cook using available ingredients, reducing food waste and simplifying meal decisions.

---

## 📌 Future Improvements

* Voice input
* Multi-language support
* Meal planning system

---

## 👨💻 Author

Your Name
