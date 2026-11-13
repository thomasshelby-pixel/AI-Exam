# 🚀 J.A.R.V.I.S. Cloud Deployment (100% Free 24/7 Hosting)

This package lets your Jarvis Telegram Voice Bot run **24 hours a day, 365 days a year** in the cloud for **FREE**, even when your PC is completely turned off!

---

### Option 1: 1-Click Deploy on Render.com (Recommended & Free)

1. Create a free account at [render.com](https://render.com/).
2. Push this `cloud_deploy` folder to a new private GitHub repository.
3. On Render Dashboard: Click **New +** ➔ **Background Worker** (or **Blueprint** using `render.yaml`).
4. Select your GitHub repository.
5. Environment Variables:
   - `TELEGRAM_BOT_TOKEN`: `9163623303:AAGDSXzYPucM5z_SjbiGiP-QUm4rb3Jp6OA`
   - `ADMIN_CHAT_ID`: `9274341119`
6. Click **Deploy**!
7. **Done!** Render will build the Docker container and run Jarvis 24/7. Your laptop can be completely off, and the bot will reply to your voice notes anytime!

---

### Option 2: 1-Click Deploy on Railway.app

1. Go to [railway.app](https://railway.app/).
2. Click **New Project** ➔ **Deploy from GitHub repo**.
3. Select this repository.
4. Add the environment variables:
   - `TELEGRAM_BOT_TOKEN`: `9163623303:AAGDSXzYPucM5z_SjbiGiP-QUm4rb3Jp6OA`
   - `ADMIN_CHAT_ID`: `9274341119`
5. Click **Deploy**!
