# Clutchr Week 1: Complete Setup Guide

## ⚡ Quick Start (5 minutes)

### Backend

```bash
cd backend

# Create virtual environment
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt

# Create .env file
cp .env.example .env

# For SQLite (no PostgreSQL needed):
# Edit .env and set: USE_SQLITE=True

# Run migrations
python manage.py migrate

# Create superuser (optional)
python manage.py createsuperuser

# Start server
python manage.py runserver
```

**Backend runs on:** `http://localhost:8000`
**API docs:** `http://localhost:8000/api/docs/`

### Frontend

```bash
cd frontend

# Install dependencies
npm install

# Start dev server
npm start
```

**Frontend runs on:** `http://localhost:4200`

---

## 🔑 API Endpoints (Week 1)

### Authentication

```bash
# Register
POST /api/v1/auth/register/
{
  "username": "wendy",
  "email": "wendy@example.com",
  "password": "secure123!",
  "password_confirm": "secure123!",
  "first_name": "Wendy",
  "last_name": "Raz"
}

# Login
POST /api/v1/auth/login/
{
  "username": "wendy",
  "password": "secure123!"
}

Response:
{
  "user_id": 1,
  "username": "wendy",
  "email": "wendy@example.com",
  "token": "abc123xyz...",
  "profile_complete": false
}
```

### Profile Management

```bash
# Get current user profile
GET /api/v1/profile/me/
Authorization: Token abc123xyz...

# Import LinkedIn + CV
POST /api/v1/profile/import_profile/
Authorization: Token abc123xyz...
Content-Type: multipart/form-data

- linkedin_pdf: (file)
- cv_pdf: (file)
- target_roles: ["Python Developer", "Backend Engineer"]
- target_locations: ["Paris", "Lyon", "Remote"]
- years_experience: 5

Response:
{
  "success": true,
  "profile": { ... },
  "skills_extracted": 24,
  "message": "Profile imported successfully"
}
```

---

## 📁 File Structure

```
clutchr-week1/
├── backend/
│   ├── clutchr/
│   │   ├── settings.py          # Django config
│   │   ├── urls.py              # API routes
│   │   └── wsgi.py
│   ├── jobs/
│   │   ├── models.py            # UserProfile, Job models
│   │   ├── serializers.py       # REST serializers
│   │   ├── views.py             # API endpoints
│   │   ├── admin.py
│   │   └── migrations/
│   ├── utils/
│   │   ├── pdf_parser.py        # PDF text extraction
│   │   └── skill_extractor.py   # Skill detection
│   ├── requirements.txt
│   ├── manage.py
│   └── .env.example
│
├── frontend/
│   ├── src/
│   │   ├── app/
│   │   │   ├── core/
│   │   │   │   └── auth/
│   │   │   │       └── auth.service.ts
│   │   │   └── features/
│   │   │       ├── auth/          # Login/Register
│   │   │       └── onboarding/    # Profile import
│   │   ├── manifest.webmanifest   # PWA config
│   │   ├── styles.scss            # Global styles (Clutchr theme)
│   │   └── index.html
│   ├── ngsw-config.json           # Service Worker caching
│   ├── angular.json
│   ├── package.json
│   └── tsconfig.json
│
└── docs/
    ├── API.md
    ├── PWA.md
    └── ARCHITECTURE.md
```

---

## 🧪 Testing

### Backend

```bash
cd backend

# Run tests
python manage.py test jobs

# Run with coverage
pip install coverage
coverage run --source='.' manage.py test jobs
coverage report
```

### Frontend

```bash
cd frontend

# Run unit tests
npm test

# Run e2e tests
npm run e2e
```

---

## 🐛 Troubleshooting

### PostgreSQL not installed

Use SQLite instead:
```bash
# Edit .env
USE_SQLITE=True

# Or in settings.py, DATABASES will fall back to SQLite
```

### Port already in use

```bash
# Django on different port
python manage.py runserver 8001

# Angular on different port
ng serve --port 4201
```

### PDF parsing fails

```bash
# Make sure PyPDF2 is installed
pip install PyPDF2 --upgrade

# Try a simple PDF first to test
```

### CORS errors

- Ensure `CORS_ALLOWED_ORIGINS` in `backend/clutchr/settings.py` includes frontend URL
- Check that frontend is on `http://localhost:4200`

---

## 🚀 Next Steps

After Week 1 is working:

1. **Week 2:** Job scraping + matching engine
2. **Week 3:** Skill gap + AI features (Gemini)
3. **Week 4:** Deploy to production

---

## 📚 Resources

- Django docs: https://docs.djangoproject.com/
- Angular docs: https://angular.io/docs
- DRF docs: https://www.django-rest-framework.org/
- PWA docs: https://web.dev/progressive-web-apps/
- Service Worker: https://developer.mozilla.org/en-US/docs/Web/API/Service_Worker_API

---

## 🆘 Getting Help

If stuck:
1. Check the error message carefully
2. Read the relevant documentation
3. Look at API response (use browser DevTools)
4. Check Django logs (terminal output)
5. Test with Postman/curl before debugging Angular

---

## ✅ Checklist for Week 1 Complete

- [ ] Backend running on 8000
- [ ] Frontend running on 4200
- [ ] Can register new user
- [ ] Can login with registered user
- [ ] Can upload PDF and extract text
- [ ] Skills are extracted correctly
- [ ] Service Worker is registered (check DevTools)
- [ ] App is installable on mobile
- [ ] Offline browsing works (load page, disconnect, refresh)

Good luck! 🎉
