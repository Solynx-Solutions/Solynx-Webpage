from http.server import BaseHTTPRequestHandler
from urllib.parse import parse_qs
from html import escape
import re
import json
import os
from hashlib import sha256
from datetime import datetime, timedelta, timezone
from urllib.request import Request, urlopen
from urllib.error import URLError
from urllib.parse import urlsplit

PLANS = [
    ("Scout", "Lead Capture Foundation", "Capture and organize inquiries in one CRM.", "$297/month · $2,970/year"),
    ("Prowler", "Customer Response System", "Recover missed calls, follow up and coordinate scheduling.", "$497/month · $4,970/year"),
    ("Nexus", "Connected Growth System", "Connect workflows across systems and track reviews, listings and results.", "$747/month · $7,470/year"),
    ("Apex", "Custom Business Infrastructure", "Design and implement a custom system across your business.", "Custom pricing after a consultation"),
]
QUESTIONS = [
    ("Where do new inquiries go today?", ["One place", "Several inboxes or spreadsheets", "We need a CRM"]),
    ("What happens when someone misses a call?", ["We have a reliable process", "We need callback reminders or scheduling"]),
    ("Which systems need to work together?", ["A contact list and intake form", "Calls, follow-up and scheduling", "Multiple tools, reviews and reporting", "Custom systems across departments"]),
    ("How much implementation support do you need?", ["Self-guided onboarding", "Guided setup", "Custom architecture and implementation"]),
    ("Would you like content created while we build your foundation?", ["Yes, filming or photography", "Yes, an AI-assisted concept", "Let's discuss both", "Foundation only for now"]),
]

def render(body):
    return ('<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Find your SOLYNX plan</title><link rel="stylesheet" href="/plan-fit-assets/style.css"><header><img src="/assets/images/SLX-WRD.png" alt="SOLYNX"></header><main>' + body + '</main><footer><a href="/privacy.html">Privacy policy</a> · <a href="/terms.html">Terms of service</a></footer></html>').encode()

def hidden(answers):
    return ''.join(f'<input type="hidden" name="q{i}" value="{v}">' for i,v in enumerate(answers))

def screen(answers, fields=None, receipt=None):
    i = len(answers)
    if i < 5:
        prompt, choices = QUESTIONS[i]
        options = ''.join(f'<label class="option"><input type="radio" required name="q{i}" value="{n}"> {escape(c)}</label>' for n,c in enumerate(choices))
        return render(f'<p class="tag">Plan fit · Question {i+1} of 5</p><progress value="{i+1}" max="5"></progress><form method="post"><fieldset><legend>{prompt}</legend>{options}</fieldset>{hidden(answers)}<button>Continue →</button></form>')
    tier = max(answers[1], answers[2], [0,1,3][answers[3]])
    name, category, purpose, price = PLANS[tier]
    intro = f'<p class="tag">Your recommended plan</p><h1>{name}</h1><h2>{category}</h2><p>{purpose}</p>'
    if fields is None:
        inputs = ''.join(f'<label>{label}<input type="{typ}" name="{key}" maxlength="200" required autocomplete="{auto}"></label>' for label,typ,key,auto in [('Decision-maker name','text','person','name'),('Business name','text','business','organization'),('Work email','email','email','email'),('Phone number','tel','phone','tel')])
        return render(intro+f'<form method="post">{hidden(answers)}<h2>How can we reach you?</h2><p>Share your business details so our team can follow up on this request.</p>{inputs}<div class="actions"><button name="action" value="price">See my pricing</button><button class="secondary" name="action" value="callback">Request a callback</button></div></form>')
    if receipt is None:
        raise ValueError("CRM receipt required")
    result = f'<h2>{price}</h2>' if fields['action']=='price' else '<h2>Your callback request is in.</h2>'
    return render(intro + result + '<p>Our team has received your plan request.</p><a class="button" href="/">Return home</a>')

def parse_request(body):
    data = parse_qs(body.decode("utf-8"), max_num_fields=10, strict_parsing=True)
    if any(len(values) != 1 for values in data.values()):
        raise ValueError("Duplicate field")
    answers = []
    for i, (_, choices) in enumerate(QUESTIONS):
        key = f"q{i}"
        if key not in data:
            break
        value = int(data.pop(key)[0])
        if value not in range(len(choices)):
            raise ValueError("Invalid choice")
        answers.append(value)
    if not data and answers:
        return answers, None
    if len(answers) != len(QUESTIONS) or set(data) != {"person","business","email","phone","action"}:
        raise ValueError("Incomplete request")
    fields = {key: values[0].strip() for key, values in data.items()}
    if any(not value or len(value)>200 or re.search(r"[\x00-\x1f]", value) for value in fields.values()):
        raise ValueError("Invalid field")
    if fields["action"] not in {"callback","price"} or not re.fullmatch(r"[^@\s]+@[^@\s]+\.[^@\s]+",fields["email"]):
        raise ValueError("Invalid contact details")
    if not re.fullmatch(r"[+\d(). \-]+",fields["phone"]) or not 7<=len(re.sub(r"\D","",fields["phone"]))<=15:
        raise ValueError("Invalid phone")
    return answers, fields

def record_request(answers, fields):
    """Confirm the contact and Mel's assigned task before releasing pricing."""
    token = os.environ.get("PLAN_FIT_CRM_TOKEN")
    guard = os.environ.get("PLAN_FIT_GUARD_REST_URL", "").rstrip("/")
    guard_token = os.environ.get("PLAN_FIT_GUARD_REST_TOKEN")
    if not token or not guard_token or not re.fullmatch(r"https://[a-z0-9-]+\.upstash\.io", guard):
        raise ConnectionError("Plan intake unavailable")
    location = "X7gmSDv2qIOri1Al4ewE"
    owner = "cpawmCyP6PpNZV56KCNA"
    def call(url, credential, body=None):
        request = Request(url, data=json.dumps(body).encode() if body is not None else None,
                          headers={"Authorization":"Bearer "+credential,"Content-Type":"application/json","Version":"v3"})
        try:
            with urlopen(request,timeout=5) as response:
                return json.load(response)
        except (URLError, OSError, ValueError) as error:
            raise ConnectionError("Receiver unavailable") from error
    def redis(command):
        response = call(guard,guard_token,command)
        if "error" in response or "result" not in response:
            raise ConnectionError("Guard unavailable")
        return response["result"]
    identity = fields["email"].casefold()
    signature = sha256(json.dumps([identity,fields["business"],fields["phone"],fields["person"],fields["action"],answers]).encode()).hexdigest()
    key = "plan-fit:v1:"+signature
    receipt = redis(["GET",key])
    if receipt and receipt.startswith("done:"):
        return receipt[5:]
    if redis(["SET",key,"pending","NX","EX",180]) != "OK":
        raise ConnectionError("Request in progress")
    throttle = "local c=redis.call('INCR',KEYS[1]);if c==1 then redis.call('EXPIRE',KEYS[1],3600) end;return c"
    if redis(["EVAL",throttle,1,"plan-fit:rate:all"])>60 or redis(["EVAL",throttle,1,"plan-fit:rate:"+sha256(identity.encode()).hexdigest()])>5:
        raise ConnectionError("Request limit reached")
    base = "https://services.leadconnectorhq.com/contacts"
    contact = call(base+"/upsert",token,{"locationId":location,"name":fields["person"],"email":identity,
        "phone":fields["phone"],"companyName":fields["business"]}).get("contact",{})
    cid = contact.get("id","")
    if contact.get("locationId") != location or not re.fullmatch(r"[a-zA-Z0-9_-]+",cid):
        raise ConnectionError("Contact receipt missing")
    path = base+"/"+cid+"/tasks"
    title = "Plan fit follow-up · "+signature[:16]
    tasks = call(path,token).get("tasks")
    if not isinstance(tasks,list):
        raise ConnectionError("Task lookup unavailable")
    previous = next((task for task in tasks if task.get("title")==title),None)
    tier = max(answers[1],answers[2],[0,1,3][answers[3]])
    brief = [f"Plan: {PLANS[tier][0]}", f"Requested: {fields['action']}", f"Contact: {fields['person']} · {fields['business']}", f"{identity} · {fields['phone']}"]
    brief.extend(f"{question} {options[value]}" for (question,options),value in zip(QUESTIONS,answers))
    if previous is None:
        due = (datetime.now(timezone.utc)+timedelta(days=1)).isoformat()
        task = call(path,token,{"title":title,"body":"\n".join(brief),"dueDate":due,"completed":False,"assignedTo":owner}).get("task",{})
    else:
        task = previous
    if task.get("assignedTo")!=owner or task.get("contactId")!=cid or not task.get("id"):
        raise ConnectionError("Assigned task receipt missing")
    if redis(["SET",key,"done:"+task["id"],"EX",86400])!="OK":
        raise ConnectionError("Could not confirm receipt")
    return task["id"]

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
        self.respond(screen([]))

    def do_POST(self):
        origin = self.headers.get("Origin","")
        if urlsplit(origin).netloc != self.headers.get("Host") or self.headers.get_content_type()!="application/x-www-form-urlencoded":
            self.respond(render("<h1>Please reopen the plan finder.</h1>"),403)
            return
        try:
            length = int(self.headers.get("Content-Length",0))
            if not 0 < length <= 8000:
                raise ValueError("Invalid length")
            answers, fields = parse_request(self.rfile.read(length))
        except ValueError:
            self.respond(render("<h1>Check your answers</h1><p>Go back and check your selections and business contact details.</p>"),400)
            return
        try:
            receipt = record_request(answers,fields) if fields else None
        except ConnectionError:
            self.respond(render("<h1>Your request could not be confirmed.</h1><p>Please try again later.</p>"),503)
            return
        self.respond(screen(answers,fields,receipt))

