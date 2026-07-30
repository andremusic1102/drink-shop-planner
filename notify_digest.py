#!/usr/bin/env python3
"""每天一則摘要：若當天有方案被更新，寄 email 給 Andre。用 purchase-tracker 的 Gmail SMTP。"""
import json, os, smtplib, ssl, time
from datetime import datetime, date
from email.message import EmailMessage

BASE = os.path.dirname(os.path.abspath(__file__))
PLANS = os.path.join(BASE, "state", "plans")
MARKER = os.path.join(BASE, "state", "last_digest.json")
CONFIG = "/Users/andremusic/purchase-tracker/config.json"
URL = "https://drinkshop.andremusic.dev"
TO = "andremusic1102@gmail.com"


def load_cfg():
    with open(CONFIG, encoding="utf-8") as f:
        return json.load(f)


def changed_today():
    today = date.today()
    out = []
    if not os.path.isdir(PLANS):
        return out
    for f in os.listdir(PLANS):
        if not f.endswith(".json"):
            continue
        try:
            with open(os.path.join(PLANS, f), encoding="utf-8") as fh:
                d = json.load(fh)
            ts = d.get("ts", 0)
            if ts and datetime.fromtimestamp(ts).date() == today:
                out.append((d.get("name", "未命名"), ts))
        except Exception:
            pass
    out.sort(key=lambda x: x[1], reverse=True)
    return out


def already_sent_today():
    try:
        with open(MARKER, encoding="utf-8") as f:
            return json.load(f).get("date") == date.today().isoformat()
    except Exception:
        return False


def mark_sent():
    try:
        with open(MARKER, "w", encoding="utf-8") as f:
            json.dump({"date": date.today().isoformat(), "ts": int(time.time())}, f)
    except OSError:
        pass


def main():
    if already_sent_today():
        print("digest already sent today; skip")
        return
    changed = changed_today()
    if not changed:
        print("no plans changed today; no email")
        return
    cfg = load_cfg()
    user, pw = cfg["gmail_user"], cfg["gmail_app_password"]
    lines = ["今天有這些飲料店平面方案被更新：", ""]
    for name, ts in changed:
        lines.append("· %s（%s）" % (name, datetime.fromtimestamp(ts).strftime("%H:%M")))
    lines += ["", "打開查看：" + URL]
    body = "\n".join(lines)

    msg = EmailMessage()
    msg["Subject"] = "飲料店平面 · 今日更新 %d 份方案" % len(changed)
    msg["From"] = user
    msg["To"] = TO
    msg.set_content(body)

    ctx = ssl.create_default_context()
    with smtplib.SMTP_SSL("smtp.gmail.com", 465, context=ctx) as s:
        s.login(user, pw)
        s.send_message(msg)
    mark_sent()
    print("digest sent: %d plans" % len(changed))


if __name__ == "__main__":
    main()
