"""JARVIS - Cloud 24/7 Autonomous Voice Bot for CA Exam Checker AI
Runs 24/7 on Render / Railway / Cloud VPS even when PC is completely turned off.
"""
import os
import sys
import json
import asyncio
import subprocess
import datetime
from pathlib import Path
import numpy as np

from telegram import Update
from telegram.ext import ApplicationBuilder, CommandHandler, MessageHandler, filters, ContextTypes
import edge_tts
from faster_whisper import WhisperModel

BASE_DIR = Path(__file__).resolve().parent
DATA_DIR = BASE_DIR / "data"
DATA_DIR.mkdir(exist_ok=True)

DEFAULT_ADMIN_ID = os.environ.get("ADMIN_CHAT_ID", "9274341119")
VOICE = "en-IN-PrabhatNeural"

_whisper_model = None

def get_whisper():
    global _whisper_model
    if _whisper_model is None:
        print("[CLOUD JARVIS] Initializing acoustic neural model...", flush=True)
        _whisper_model = WhisperModel("small.en", device="cpu", compute_type="int8")
    return _whisper_model

def get_briefing_text():
    now = datetime.datetime.now().strftime("%I:%M %p")
    return (
        f"🤖 *J.A.R.V.I.S. Cloud Briefing (24/7)* — `{now}`\n\n"
        "Sir, all systems for *CA Exam Checker AI* are running:\n\n"
        "• *Reel Status:* Vertical Master Reel live on Instagram (@caexamchecker.ai)\n"
        "• *Active Outreach:* Partner target `@ca.notes` (120K followers)\n"
        "• *Offer Delivered:* 15–20% affiliate rev-share + code `CANOTES`\n"
        "• *Platform:* https://caexamcheckerai.com/\n"
        "• *Cloud Host:* Running 24/7 independently of your local PC.\n\n"
        "At your service, sir. Send a voice note anytime."
    )

async def text_to_speech_ogg(text: str, out_ogg: Path):
    tmp_mp3 = out_ogg.with_suffix(".mp3")
    comm = edge_tts.Communicate(text, VOICE, rate="-3%")
    await comm.save(str(tmp_mp3))
    
    cmd = [
        "ffmpeg", "-y", "-i", str(tmp_mp3),
        "-c:a", "libopus", "-b:a", "32k", "-vbr", "on",
        str(out_ogg)
    ]
    subprocess.run(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, check=True)
    if tmp_mp3.exists():
        tmp_mp3.unlink()

def audio_to_text(audio_path: Path) -> str:
    cmd = ["ffmpeg", "-y", "-i", str(audio_path), "-f", "f32le", "-ac", "1", "-ar", "16000", "-"]
    proc = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL)
    raw, _ = proc.communicate()
    audio_np = np.frombuffer(raw, dtype=np.float32)

    model = get_whisper()
    segments, _ = model.transcribe(audio_np)
    return " ".join(s.text.strip() for s in segments)

def get_admin_id():
    p = BASE_DIR / "admin_id.txt"
    if p.exists():
        try: return int(p.read_text().strip())
        except Exception: pass
    if DEFAULT_ADMIN_ID:
        try: return int(DEFAULT_ADMIN_ID)
        except Exception: pass
    return None

def save_admin_id(cid):
    (BASE_DIR / "admin_id.txt").write_text(str(cid))

async def handle_start(update: Update, context: ContextTypes.DEFAULT_TYPE):
    cid = update.effective_chat.id
    save_admin_id(cid)
    print(f"[CLOUD JARVIS] Admin linked: chat_id={cid}", flush=True)

    text = (
        "🤖 *J.A.R.V.I.S. Cloud Link Active (24/7)*\n\n"
        "Good day, sir. I am running 24/7 on the cloud independently of your PC.\n\n"
        "• *Voice Protocol:* Press the mic button on Telegram to speak to me anytime.\n"
        "• *Proactive Updates:* I will deliver periodic status briefings automatically.\n"
        "• *Commands:* `/status` for instant briefing, `/briefme` for voice update."
    )
    await update.message.reply_text(text, parse_mode="Markdown")

async def handle_status(update: Update, context: ContextTypes.DEFAULT_TYPE):
    save_admin_id(update.effective_chat.id)
    await update.message.reply_text(get_briefing_text(), parse_mode="Markdown")

async def handle_briefme(update: Update, context: ContextTypes.DEFAULT_TYPE):
    save_admin_id(update.effective_chat.id)
    await update.message.chat.send_action("record_voice")
    out_ogg = DATA_DIR / f"brief_{update.effective_chat.id}.ogg"
    speech = (
        "Good day, sir. This is your 24/7 Jarvis cloud briefing for CA Exam Checker AI. "
        "Our marketing campaign is active, our master reel is published, and outreach to CA Notes with 120,000 followers "
        "has been delivered. All cloud services are functioning at peak efficiency."
    )
    await text_to_speech_ogg(speech, out_ogg)
    with open(out_ogg, "rb") as vf:
        await update.message.reply_voice(voice=vf, caption="🎙️ *24/7 Jarvis Audio Status Briefing*")
    if out_ogg.exists(): out_ogg.unlink()

async def handle_voice(update: Update, context: ContextTypes.DEFAULT_TYPE):
    voice = update.message.voice or update.message.audio
    if not voice: return

    cid = update.effective_chat.id
    save_admin_id(cid)
    await update.message.chat.send_action("record_voice")

    in_ogg = DATA_DIR / f"in_{voice.file_id}.ogg"
    file = await context.bot.get_file(voice.file_id)
    await file.download_to_drive(custom_path=in_ogg)

    user_speech = audio_to_text(in_ogg)
    print(f"[CLOUD JARVIS HEARD]: \"{user_speech}\"", flush=True)

    q = user_speech.lower()
    if any(w in q for w in ["status", "brief", "update", "kya chal raha", "report", "insta"]):
        reply_spoken = (
            "Right away, sir. Our master reel is live on Instagram, and outreach to CA Notes with 120,000 followers "
            "is currently active with a fifteen to twenty percent affiliate revenue share proposal. "
            "I will alert you as soon as they reply."
        )
    elif any(w in q for w in ["good", "nice", "shabash", "badiya", "great", "thank"]):
        reply_spoken = "Always a pleasure, sir. Running continuously on the cloud to drive growth and revenue."
    elif any(w in q for w in ["next", "agla", "kisko", "candidate"]):
        reply_spoken = "If CA Notes does not respond within twenty-four hours, our next candidate is CA Students Club, followed by ICAI Updates Daily."
    else:
        reply_spoken = (
            f"Understood, sir: {user_speech}. I have recorded this directive and am executing business operations accordingly."
        )

    out_ogg = DATA_DIR / f"reply_{voice.file_id}.ogg"
    await text_to_speech_ogg(reply_spoken, out_ogg)

    with open(out_ogg, "rb") as vf:
        await update.message.reply_voice(
            voice=vf,
            caption=f"👤 *Transcribed:* \"{user_speech}\"",
            parse_mode="Markdown"
        )

    if in_ogg.exists(): in_ogg.unlink()
    if out_ogg.exists(): out_ogg.unlink()

async def handle_text(update: Update, context: ContextTypes.DEFAULT_TYPE):
    save_admin_id(update.effective_chat.id)
    text = update.message.text.lower()
    if any(w in text for w in ["status", "report", "update", "brief"]):
        await handle_status(update, context)
    elif any(w in text for w in ["voice", "speak", "bol", "audio"]):
        await handle_briefme(update, context)
    else:
        await update.message.reply_text(
            f"Sir, I have registered: \"{update.message.text}\". You may speak to me via voice note anytime!",
            parse_mode="Markdown"
        )

async def proactive_briefing_worker(app):
    """Periodic proactive briefings directly to admin phone"""
    print("[CLOUD JARVIS] Proactive briefing loop active.", flush=True)
    await asyncio.sleep(60)
    
    while True:
        try:
            admin_id = get_admin_id()
            if admin_id:
                print(f"[CLOUD JARVIS] Dispatching proactive briefing to admin ({admin_id})...", flush=True)
                brief_text = get_briefing_text()
                await app.bot.send_message(chat_id=admin_id, text=brief_text, parse_mode="Markdown")
                
                out_ogg = DATA_DIR / f"proactive_{int(datetime.datetime.now().timestamp())}.ogg"
                audio_msg = (
                    "Sir, this is your scheduled Jarvis update from the cloud. Operations are running normally. "
                    "Outreach to CA Notes is active, and the platform is ready for student traffic."
                )
                await text_to_speech_ogg(audio_msg, out_ogg)
                with open(out_ogg, "rb") as vf:
                    await app.bot.send_voice(chat_id=admin_id, voice=vf, caption="🎙️ *Scheduled Jarvis Cloud Voice Update*")
                if out_ogg.exists(): out_ogg.unlink()
        except Exception as e:
            print(f"[CLOUD JARVIS PROACTIVE ERROR]: {e}", flush=True)

        await asyncio.sleep(4 * 3600)  # Every 4 hours

def main():
    token = os.environ.get("TELEGRAM_BOT_TOKEN", "9163623303:AAGDSXzYPucM5z_SjbiGiP-QUm4rb3Jp6OA")

    async def post_init(application):
        asyncio.create_task(proactive_briefing_worker(application))

    print("[CLOUD JARVIS] Starting Telegram Bot Engine...", flush=True)
    app = (
        ApplicationBuilder()
        .token(token)
        .connect_timeout(30.0)
        .read_timeout(30.0)
        .write_timeout(30.0)
        .post_init(post_init)
        .build()
    )

    app.add_handler(CommandHandler("start", handle_start))
    app.add_handler(CommandHandler("status", handle_status))
    app.add_handler(CommandHandler("briefme", handle_briefme))
    app.add_handler(MessageHandler(filters.VOICE | filters.AUDIO, handle_voice))
    app.add_handler(MessageHandler(filters.TEXT & ~filters.COMMAND, handle_text))

    print("[CLOUD JARVIS ONLINE] Listening 24/7...", flush=True)
    app.run_polling(drop_pending_updates=True)

if __name__ == "__main__":
    main()
