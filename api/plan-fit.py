from http.server import BaseHTTPRequestHandler
from urllib.parse import parse_qs
from html import escape
import re
import json
import logging
import os
from hashlib import sha256
from datetime import datetime, timedelta, timezone
from urllib.request import Request, urlopen
from urllib.error import HTTPError, URLError
from urllib.parse import urlsplit

PLAN_FIT_USER_AGENT = "SOLYNX-Plan-Finder/1.0"
_LOGGER = logging.getLogger("plan_fit")

PLANS = [
    ("Scout", "Lead Capture Foundation", "Capture and organize inquiries in one CRM.", "$297/month · $2,970/year"),
    ("Prowler", "Customer Response System", "Recover missed calls, follow up and coordinate scheduling.", "$497/month · $4,970/year"),
    ("Nexus", "Connected Growth System", "Connect workflows across systems and track reviews, listings and results.", "$747/month · $7,470/year"),
    ("Apex", "Custom Business Infrastructure", "Design and implement a custom system across your business.", "Custom pricing after a consultation"),
]
QUESTIONS = [
    ("Where do new inquiries land today?", ["One place", "Several inboxes or spreadsheets", "Nowhere consistent — we need a CRM"]),
    ("What happens when a call or form gets missed?", ["We always follow up the same day", "We need callback reminders or scheduling"]),
    ("Who actually uses the leads once they come in?", ["Just me", "A couple of us, with some handoffs between calls and booking", "Several people across intake, sales and scheduling"]),
    ("How often does your team re-enter the same info across tools?", ["Rarely — everything's already connected", "Sometimes, between a couple of tools", "Constantly — info gets retyped across several systems"]),
    ("Does any part of your business need something a standard connected system can't handle — like multiple locations, special approval steps, or fully custom workflows?", ["No, a standard connected system covers us", "Yes — multiple locations, special approvals, or custom workflows"]),
]
# Optional, unscored add-on shown alongside the final question. It never gates
# a tier and is never required, so skipping it has no effect on the flow.
MEDIA_QUESTION = ("Would you like content created while we build your foundation?",
                  ["Yes, filming or photography", "Yes, an AI-assisted concept", "Let's discuss both", "Not right now"])
CONTACT_FIELDS = [
    ("Decision-maker name", "text", "person", "name"),
    ("Business name", "text", "business", "organization"),
    ("Work email", "email", "email", "email"),
]
# Mirrors the whitelist carried by js/regional-questionnaire-attribution.js so
# campaign attribution stays consistent across the site's lead-capture entry points.
MARKET_PARAMS = [
    "utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term",
    "meta_ad_id", "meta_adset_id", "meta_campaign_id", "fbclid",
]
# Explicit per-question tier floors. Keeping these as lookup tables (instead of
# using each answer's raw index directly) means a new answer choice only needs
# a new entry here, and a forgotten entry raises IndexError instead of silently
# mis-scoring a brand-new choice.
MISSED_FOLLOWUP_TIER = [0, 1]
HANDOFF_TIER = [0, 1, 2]
REENTRY_TIER = [0, 1, 2]
CUSTOM_ROUTING_TIER = [0, 3]

DEMO_RECEIPT_PREFIX = "demo-"
DEMO_BANNER_TEXT = "Preview demo — answers are for testing only. No CRM record was created."

def is_preview_deployment():
    """True only on a Vercel Preview deployment (VERCEL_ENV=preview), set
    automatically by Vercel and never present in Production. Local runs and
    Production both fall through to the real, CRM-writing path unchanged."""
    return os.environ.get("VERCEL_ENV") == "preview"

def tier_for(answers):
    return max(
        MISSED_FOLLOWUP_TIER[answers[1]],
        HANDOFF_TIER[answers[2]],
        REENTRY_TIER[answers[3]],
        CUSTOM_ROUTING_TIER[answers[4]],
    )

def render(body):
    return ('<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Find your SOLYNX plan</title><link rel="stylesheet" href="/plan-fit-assets/style.css"><header><img src="/assets/images/SLX-WRD.png" alt="SOLYNX"></header><main>' + body + '</main><footer><a href="/privacy.html">Privacy policy</a> · <a href="/terms.html">Terms of service</a></footer></html>').encode()

def hidden_fields(answers, contact=None, market=None):
    parts = [f'<input type="hidden" name="q{i}" value="{v}">' for i, v in enumerate(answers)]
    if contact:
        parts += [f'<input type="hidden" name="{key}" value="{escape(value)}">' for key, value in contact.items()]
    if market:
        parts += [f'<input type="hidden" name="{key}" value="{escape(value)}">' for key, value in market.items()]
    return ''.join(parts)

def _preview_banner():
    return f'<p class="tag demo-banner">{DEMO_BANNER_TEXT}</p>' if is_preview_deployment() else ''

def entrance_screen(market):
    carry = hidden_fields([], None, market)
    inputs = ''.join(f'<label>{label}<input type="{typ}" name="{key}" maxlength="200" required autocomplete="{auto}"></label>' for label, typ, key, auto in CONTACT_FIELDS)
    body = (_preview_banner() + f'<p class="tag">Plan fit</p><h1>Find your SOLYNX plan</h1>'
            f'<p>Tell us who to follow up with, then answer five quick questions for verified pricing.</p>'
            f'<form method="post">{carry}{inputs}<button>Continue →</button></form>')
    return render(body)

def screen(answers, contact=None, market=None, receipt=None):
    i = len(answers)
    carry = hidden_fields(answers, contact, market)
    if i < len(QUESTIONS):
        prompt, choices = QUESTIONS[i]
        options = ''.join(f'<label class="option"><input type="radio" required name="q{i}" value="{n}"> {escape(c)}</label>' for n, c in enumerate(choices))
        media_fieldset = ''
        if i == len(QUESTIONS) - 1:
            media_prompt, media_choices = MEDIA_QUESTION
            media_options = ''.join(f'<label class="option"><input type="radio" name="media" value="{n}"> {escape(c)}</label>' for n, c in enumerate(media_choices))
            media_fieldset = f'<fieldset><legend>{media_prompt} (optional)</legend>{media_options}</fieldset>'
        return render(_preview_banner() + f'<p class="tag">Plan fit · Question {i+1} of {len(QUESTIONS)}</p><progress value="{i+1}" max="{len(QUESTIONS)}"></progress><form method="post"><fieldset><legend>{prompt}</legend>{options}</fieldset>{media_fieldset}{carry}<button>Continue →</button></form>')
    tier = tier_for(answers)
    name, category, purpose, price = PLANS[tier]
    intro = f'<p class="tag">Your recommended plan</p><h1>{name}</h1><h2>{category}</h2><p>{purpose}</p>'
    if contact is None:
        return render(intro + '<p>We could not confirm your contact details.</p><a class="button" href="/plan-fit">Start over</a>')
    if receipt is None:
        raise ValueError("CRM receipt required")
    demo = receipt.startswith(DEMO_RECEIPT_PREFIX)
    banner = (f'<p class="tag demo-banner">{DEMO_BANNER_TEXT}</p>' if demo else '')
    disclosure = ('This is a preview demo of your verified pricing. No CRM record was created and our team will not follow up.'
                  if demo else 'This is your verified pricing. Our team has this request on file.')
    callback_form = (f'<form method="post">{carry}'
                      '<label>Phone number<input type="tel" name="phone" maxlength="40" autocomplete="tel"></label>'
                      '<button class="secondary" name="action" value="callback">Request a callback</button></form>')
    return render(banner + intro + f'<h2>{price}</h2><p>{disclosure}</p>'
                  f'<p>Want us to call you about next steps?</p>{callback_form}<a class="button" href="/">Return home</a>')

def failure_screen(answers, contact, market):
    """Shown when a live (non-preview) submission's CRM write fails. Shows the
    recommendation computed locally from the answers so nothing is lost. A
    partial write (e.g. the contact or note created but the final
    confirmation step failing) is possible, so this never claims nothing was
    saved — only that the save could not be confirmed — and never offers a
    resubmit form, which could duplicate a write that actually went through."""
    tier = tier_for(answers)
    name, category, purpose, price = PLANS[tier]
    intro = f'<p class="tag">Your recommended plan</p><h1>{name}</h1><h2>{category}</h2><p>{purpose}</p>'
    summary = ''.join(f'<li>{escape(question)} {escape(choices[value])}</li>' for (question, choices), value in zip(QUESTIONS, answers))
    contact_line = f'<p>{escape(contact["person"])} · {escape(contact["business"])} · {escape(contact["email"])}</p>'
    body = (intro + f'<h2>{price}</h2>'
            '<p>We were unable to confirm this request with our system just now. '
            'Your answers are shown below so you do not have to retype them — please call or email us directly so we can follow up.</p>'
            f'{contact_line}<ul>{summary}</ul><a class="button" href="/">Return home</a>')
    return render(body)

def callback_failure_screen(answers, phone):
    """Shown when a live (non-preview) callback request's CRM write fails.
    Shows the recommendation. A partial write is possible, so this never
    claims no one has been notified — only that the callback could not be
    confirmed — and never offers a resubmit form."""
    tier = tier_for(answers)
    name, category, purpose, price = PLANS[tier]
    intro = f'<p class="tag">Your recommended plan</p><h1>{name}</h1><h2>{category}</h2><p>{purpose}</p>'
    body = (intro + f'<h2>{price}</h2>'
            f'<p>We were unable to confirm your callback request for {escape(phone)}. '
            'Please call or email us directly so we can follow up.</p>'
            '<a class="button" href="/">Return home</a>')
    return render(body)

def callback_screen(answers, receipt):
    tier = tier_for(answers)
    name, category, purpose, _price = PLANS[tier]
    intro = f'<p class="tag">Your recommended plan</p><h1>{name}</h1><h2>{category}</h2><p>{purpose}</p>'
    demo = receipt.startswith(DEMO_RECEIPT_PREFIX)
    if demo:
        banner = f'<p class="tag demo-banner">{DEMO_BANNER_TEXT}</p>'
        body = '<h2>Demo callback request simulated.</h2><p>No CRM task was created and no one will call you — in production this would notify our team instantly.</p>'
    else:
        banner = ''
        body = '<h2>Your callback request is in.</h2><p>Our team has your pricing and contact details on file.</p>'
    return render(banner + intro + body + '<a class="button" href="/">Return home</a>')

def sanitize_market(data):
    market = {}
    for key in MARKET_PARAMS:
        if key not in data:
            continue
        values = data.pop(key)
        if len(values) != 1:
            continue
        value = values[0].strip()
        if value and len(value) <= 100 and not re.search(r"[\x00-\x1f]", value):
            market[key] = value
    return market

def parse_contact(data):
    fields = {}
    for key in ("person", "business", "email"):
        if key not in data:
            raise ValueError("Incomplete contact details")
        fields[key] = data.pop(key)[0].strip()
    if any(not value or len(value) > 200 or re.search(r"[\x00-\x1f]", value) for value in fields.values()):
        raise ValueError("Invalid field")
    if not re.fullmatch(r"[^@\s]+@[^@\s]+\.[^@\s]+", fields["email"]):
        raise ValueError("Invalid contact details")
    return fields

def parse_answers(data):
    answers = []
    for i, (_, choices) in enumerate(QUESTIONS):
        key = f"q{i}"
        if key not in data:
            break
        value = int(data.pop(key)[0])
        if value not in range(len(choices)):
            raise ValueError("Invalid choice")
        answers.append(value)
    return answers

def parse_media(data):
    if "media" not in data:
        return None
    value = data.pop("media")[0]
    choices = MEDIA_QUESTION[1]
    if value not in {str(n) for n in range(len(choices))}:
        raise ValueError("Invalid choice")
    return int(value)

def parse_request(body):
    data = parse_qs(body.decode("utf-8"), max_num_fields=len(MARKET_PARAMS) + len(CONTACT_FIELDS) + len(QUESTIONS) + 3, strict_parsing=True)
    if any(len(values) != 1 for values in data.values()):
        raise ValueError("Duplicate field")
    market = sanitize_market(data)
    answers = parse_answers(data)
    if len(answers) < len(QUESTIONS):
        contact = parse_contact(data)
        if data:
            raise ValueError("Unexpected field")
        kind = "entrance" if not answers else "question"
        return {"kind": kind, "answers": answers, "contact": contact, "market": market}
    has_phone = "phone" in data
    has_action = "action" in data
    if not has_phone and not has_action:
        media = parse_media(data)
        contact = parse_contact(data)
        if data:
            raise ValueError("Unexpected field")
        return {"kind": "complete", "answers": answers, "media": media, "contact": contact, "market": market}
    if not (has_phone and has_action):
        raise ValueError("Incomplete callback request")
    if data.pop("action")[0] != "callback":
        raise ValueError("Invalid action")
    phone = data.pop("phone")[0].strip()
    if not re.fullmatch(r"[+\d(). \-]+", phone) or not 7 <= len(re.sub(r"\D", "", phone)) <= 15:
        raise ValueError("Invalid phone")
    contact = parse_contact(data)
    if data:
        raise ValueError("Unexpected field")
    return {"kind": "callback", "answers": answers, "contact": contact, "market": market, "phone": phone}

LOCATION_ID = "X7gmSDv2qIOri1Al4ewE"
MEL_OWNER_ID = "cpawmCyP6PpNZV56KCNA"
CRM_BASE = "https://services.leadconnectorhq.com/contacts"

def _guard_env():
    """Resolves the guard's REST URL/token pair. Falls back to the
    auto-provisioned KV_REST_API_URL/KV_REST_API_TOKEN (Upstash Vercel
    integration) only as a coherent pair — a lone dedicated var is never
    mixed with the other source's value — and the chosen pair still has to
    pass the same https Upstash validation either way."""
    token = os.environ.get("PLAN_FIT_CRM_TOKEN")
    guard = os.environ.get("PLAN_FIT_GUARD_REST_URL", "").rstrip("/")
    guard_token = os.environ.get("PLAN_FIT_GUARD_REST_TOKEN")
    if not guard or not guard_token:
        guard = os.environ.get("KV_REST_API_URL", "").rstrip("/")
        guard_token = os.environ.get("KV_REST_API_TOKEN")
    if not token or not guard_token or not re.fullmatch(r"https://[a-z0-9-]+\.upstash\.io", guard):
        # Booleans only: presence/shape flags, never the underlying values.
        _LOGGER.error(
            "plan-fit stage=guard_env status=config_missing crm_token_present=%s "
            "guard_url_present=%s guard_url_valid=%s guard_token_present=%s",
            bool(token), bool(guard), bool(re.fullmatch(r"https://[a-z0-9-]+\.upstash\.io", guard or "")), bool(guard_token),
        )
        raise ConnectionError("Plan intake unavailable")
    return token, guard, guard_token

def _log_failure(stage, status):
    """Fixed stage/status pair only. Never log credentials, request/response
    bodies, PII, full URLs, identities, or exception reprs."""
    _LOGGER.error("plan-fit stage=%s status=%s", stage, status)

def _call(url, credential, body=None, *, stage):
    """stage identifies the calling service/step (e.g. "crm.notes_lookup")
    for safe failure logging via _log_failure."""
    request = Request(url, data=json.dumps(body).encode() if body is not None else None,
                      headers={"Authorization":"Bearer "+credential,"Content-Type":"application/json",
                               "Version":"v3","User-Agent":PLAN_FIT_USER_AGENT})
    try:
        with urlopen(request,timeout=5) as response:
            return json.load(response)
    except HTTPError as error:
        _log_failure(stage, error.code)
        raise ConnectionError("Receiver unavailable") from error
    except URLError as error:
        _log_failure(stage, "transport_failure")
        raise ConnectionError("Receiver unavailable") from error
    except OSError as error:
        _log_failure(stage, "transport_failure")
        raise ConnectionError("Receiver unavailable") from error
    except ValueError as error:
        _log_failure(stage, "invalid_response")
        raise ConnectionError("Receiver unavailable") from error

def _redis(guard, guard_token, command):
    response = _call(guard, guard_token, command, stage="guard.redis")
    if "error" in response or "result" not in response:
        _log_failure("guard.redis", "redis_response_invalid")
        raise ConnectionError("Guard unavailable")
    return response["result"]

def _lock_or_replay(guard, guard_token, key):
    """Returns a cached receipt id if this exact request already completed.
    Otherwise claims a short-lived lock and returns None so the caller can proceed."""
    receipt = _redis(guard, guard_token, ["GET", key])
    if receipt and receipt.startswith("done:"):
        return receipt[5:]
    if _redis(guard, guard_token, ["SET", key, "pending", "NX", "EX", 180]) != "OK":
        _log_failure("guard.lock", "lock_busy")
        raise ConnectionError("Request in progress")
    return None

def _throttle(guard, guard_token, identity):
    throttle = "local c=redis.call('INCR',KEYS[1]);if c==1 then redis.call('EXPIRE',KEYS[1],3600) end;return c"
    if _redis(guard, guard_token, ["EVAL", throttle, 1, "plan-fit:rate:all"]) > 60:
        _log_failure("guard.throttle_global", "rate_limited")
        raise ConnectionError("Request limit reached")
    if _redis(guard, guard_token, ["EVAL", throttle, 1, "plan-fit:rate:"+sha256(identity.encode()).hexdigest()]) > 5:
        _log_failure("guard.throttle_identity", "rate_limited")
        raise ConnectionError("Request limit reached")

def _upsert_contact(token, contact):
    identity = contact["email"].casefold()
    payload = {"locationId":LOCATION_ID,"name":contact["person"],"email":identity,"companyName":contact["business"]}
    if contact.get("phone"):
        payload["phone"] = contact["phone"]
    contact_record = _call(CRM_BASE+"/upsert",token,payload,stage="crm.upsert_contact").get("contact",{})
    cid = contact_record.get("id","")
    if contact_record.get("locationId") != LOCATION_ID or not re.fullmatch(r"[a-zA-Z0-9_-]+",cid):
        _log_failure("crm.upsert_contact", "receipt_invalid")
        raise ConnectionError("Contact receipt missing")
    return cid

def _guarded_note(seed, key_prefix, marker, body_lines, contact):
    """Persist a durable contact note keyed by signature. Never creates a task."""
    token, guard, guard_token = _guard_env()
    signature = sha256(json.dumps(seed).encode()).hexdigest()
    key = key_prefix+signature
    cached = _lock_or_replay(guard, guard_token, key)
    if cached is not None:
        return cached
    identity = contact["email"].casefold()
    _throttle(guard, guard_token, identity)
    cid = _upsert_contact(token, contact)
    path = CRM_BASE+"/"+cid+"/notes"
    notes = _call(path,token,stage="crm.notes_lookup").get("notes")
    if not isinstance(notes,list):
        _log_failure("crm.notes_lookup", "lookup_invalid")
        raise ConnectionError("Note lookup unavailable")
    previous = next((note for note in notes if note.get("body","").startswith(marker)),None)
    if previous is None:
        note = _call(path,token,{"body": marker+"\n"+"\n".join(body_lines)},stage="crm.notes_create").get("note",{})
    else:
        note = previous
    if note.get("contactId")!=cid or not note.get("id"):
        _log_failure("crm.notes_create", "receipt_invalid")
        raise ConnectionError("Note receipt missing")
    if _redis(guard, guard_token, ["SET",key,"done:"+note["id"],"EX",86400])!="OK":
        _log_failure("guard.confirm_note", "confirmation_failed")
        raise ConnectionError("Could not confirm receipt")
    return note["id"]

def _guarded_task(seed, key_prefix, title, body_lines, contact):
    """Create exactly one task assigned to Mel, keyed by signature. Replay-safe."""
    token, guard, guard_token = _guard_env()
    signature = sha256(json.dumps(seed).encode()).hexdigest()
    key = key_prefix+signature
    cached = _lock_or_replay(guard, guard_token, key)
    if cached is not None:
        return cached
    identity = contact["email"].casefold()
    _throttle(guard, guard_token, identity)
    cid = _upsert_contact(token, contact)
    path = CRM_BASE+"/"+cid+"/tasks"
    tasks = _call(path,token,stage="crm.tasks_lookup").get("tasks")
    if not isinstance(tasks,list):
        _log_failure("crm.tasks_lookup", "lookup_invalid")
        raise ConnectionError("Task lookup unavailable")
    previous = next((task for task in tasks if task.get("title")==title),None)
    if previous is None:
        due = (datetime.now(timezone.utc)+timedelta(days=1)).isoformat()
        task = _call(path,token,{"title":title,"body":"\n".join(body_lines),"dueDate":due,"completed":False,"assignedTo":MEL_OWNER_ID},stage="crm.tasks_create").get("task",{})
    else:
        task = previous
    if task.get("assignedTo")!=MEL_OWNER_ID or task.get("contactId")!=cid or not task.get("id"):
        _log_failure("crm.tasks_create", "receipt_invalid")
        raise ConnectionError("Assigned task receipt missing")
    if _redis(guard, guard_token, ["SET",key,"done:"+task["id"],"EX",86400])!="OK":
        _log_failure("guard.confirm_task", "confirmation_failed")
        raise ConnectionError("Could not confirm receipt")
    return task["id"]

def _attribution_line(market):
    return "Attribution: " + ", ".join(f"{key}={value}" for key, value in market.items()) if market else "Attribution: none"

def _media_line(media):
    if media is None:
        return "Media interest: not answered"
    return "Media interest: " + MEDIA_QUESTION[1][media]

def _demo_receipt(kind, seed):
    """Deterministic stand-in receipt for a Preview deployment. Makes no
    network call and writes nothing to the CRM or guard store."""
    return DEMO_RECEIPT_PREFIX + kind + "-" + sha256(json.dumps(seed, sort_keys=True).encode()).hexdigest()[:16]

def record_request(answers, contact, market, media=None):
    """Persist a durable CRM contact note with all five answers before releasing
    verified pricing. Pricing-only requests never create a task for Mel.
    On a Vercel Preview deployment this makes no CRM write at all, so every
    tier and the optional callback can be tried without creating a real lead."""
    if is_preview_deployment():
        return _demo_receipt("note", [contact["email"].casefold(), answers])
    tier = tier_for(answers)
    identity = contact["email"].casefold()
    seed = [identity, contact["business"], contact["person"], answers]
    marker = "Plan fit intake · "+sha256(json.dumps(seed).encode()).hexdigest()[:16]
    lines = [f"Plan: {PLANS[tier][0]}", f"Contact: {contact['person']} · {contact['business']}", identity, _attribution_line(market)]
    lines.extend(f"{question} {options[value]}" for (question,options),value in zip(QUESTIONS,answers))
    lines.append(_media_line(media))
    return _guarded_note(seed, "plan-fit:note:v1:", marker, lines, contact)

def record_callback(answers, contact, market, phone):
    """Create exactly one task assigned to Mel, including all five answers,
    before confirming the callback. Safe on replay or partial failure.
    On a Vercel Preview deployment this makes no CRM write at all, so the
    optional callback can be tried without creating a real lead."""
    if is_preview_deployment():
        return _demo_receipt("callback", [contact["email"].casefold(), answers, phone])
    tier = tier_for(answers)
    identity = contact["email"].casefold()
    seed = [identity, contact["business"], contact["person"], answers, "callback", phone]
    title = "Plan fit callback · "+sha256(json.dumps(seed).encode()).hexdigest()[:16]
    lines = [f"Callback requested · Plan: {PLANS[tier][0]}", f"Contact: {contact['person']} · {contact['business']}", f"{identity} · {phone}", _attribution_line(market)]
    lines.extend(f"{question} {options[value]}" for (question,options),value in zip(QUESTIONS,answers))
    return _guarded_task(seed, "plan-fit:callback:v1:", title, lines, dict(contact, phone=phone))

class handler(BaseHTTPRequestHandler):
    def respond(self, body, status=200):
        self.send_response(status)
        self.send_header("Content-Type","text/html; charset=utf-8")
        self.send_header("Cache-Control","private, no-store")
        self.send_header("Referrer-Policy","same-origin")
        self.send_header("X-Content-Type-Options","nosniff")
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        try:
            market = sanitize_market(parse_qs(urlsplit(self.path).query, max_num_fields=50))
        except ValueError:
            market = {}
        self.respond(entrance_screen(market))

    def do_POST(self):
        origin = self.headers.get("Origin","")
        if urlsplit(origin).netloc != self.headers.get("Host") or self.headers.get_content_type()!="application/x-www-form-urlencoded":
            self.respond(render("<h1>Please reopen the plan finder.</h1>"),403)
            return
        try:
            length = int(self.headers.get("Content-Length",0))
            if not 0 < length <= 8000:
                raise ValueError("Invalid length")
            stage = parse_request(self.rfile.read(length))
        except ValueError:
            self.respond(render("<h1>Check your answers</h1><p>Go back and check your selections and business contact details.</p>"),400)
            return
        if stage["kind"] in ("entrance", "question"):
            self.respond(screen(stage["answers"], stage["contact"], stage["market"]))
            return
        if stage["kind"] == "complete":
            try:
                receipt = record_request(stage["answers"], stage["contact"], stage["market"], stage["media"])
            except ConnectionError:
                self.respond(failure_screen(stage["answers"], stage["contact"], stage["market"]), 503)
                return
            self.respond(screen(stage["answers"], stage["contact"], stage["market"], receipt))
            return
        try:
            receipt = record_callback(stage["answers"], stage["contact"], stage["market"], stage["phone"])
        except ConnectionError:
            self.respond(callback_failure_screen(stage["answers"], stage["phone"]), 503)
            return
        self.respond(callback_screen(stage["answers"], receipt))
