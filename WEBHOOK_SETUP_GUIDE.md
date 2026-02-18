# GoHighLevel Webhook Setup Guide for SOLYNX Website

This guide will walk you through setting up a webhook in GoHighLevel to capture contact form submissions from your solynx.solutions website.

---

## Step 1: Log into GoHighLevel

1. Go to [app.gohighlevel.com](https://app.gohighlevel.com)
2. Log in with your credentials
3. Select your **SOLYNX** sub-account (if applicable)

---

## Step 2: Create a New Workflow

1. In the left sidebar, navigate to **Automation** → **Workflows**
2. Click the **"+ Create Workflow"** button (top right)
3. Give it a name: `SOLYNX Website Contact Form`
4. Click **"Create"** or **"Start From Scratch"**

---

## Step 3: Add a Webhook Trigger

### Choose Webhook Type:
1. In the workflow builder, click **"Add New Workflow Trigger"** or the **"+"** button
2. Look for **"Inbound Webhook"** or **"Custom Webhook"** (this is simpler than the standard webhook)
3. Select it

### Get Your Webhook URL:
1. After selecting the webhook trigger, GoHighLevel will generate a webhook URL
2. **Copy this URL** - it will look like:
   ```
   https://services.leadconnectorhq.com/hooks/abc123xyz456...
   ```
3. **Keep this URL safe** - you'll need it in a moment
4. Click **"Save"** on the webhook trigger

> 💡 **Tip:** If GoHighLevel asks for "mapping reference" or sample data:
> - Don't worry! We'll send a test submission later
> - For now, just save the webhook and continue
> - The webhook will automatically capture the data structure when you submit a test form

---

## Step 4: Add Actions to Process Contact Data

### Action 1: Create/Update Contact

1. Click the **"+"** button below the webhook trigger
2. Select **"CRM"** → **"Create/Update Contact"**
3. Configure the contact fields using webhook data:

   **Field Mappings:**
   - **First Name/Full Name**: `{{webhook.body.name}}`
   - **Email**: `{{webhook.body.email}}`
   - **Phone**: `{{webhook.body.phone}}`
   - **Source**: Type "SOLYNX Website" (static text)

   > 📝 **Note:** The exact variable path might be `{{trigger.name}}` instead of `{{webhook.body.name}}` depending on your webhook type. If one doesn't work, try the other.

4. Click **"Save"**

### Action 2: Add a Tag (Optional but Recommended)

1. In the Create/Update Contact action, scroll to the **Tags** section
2. Click **"+ Add Tag"**
3. Add tag: "Website Lead" or "SOLYNX Contact Form"
4. This helps you identify leads that came from your website

### Action 3: Send Notification Email to Yourself (Optional)

1. Click **"+"** to add another action
2. Select **"Email"** → **"Send Email"**
3. Configure:
   - **To**: Your email (e.g., rafael@solynx.solutions)
   - **Subject**: "New Contact from SOLYNX Website"
   - **Body**: Include details like:
     ```
     Name: {{webhook.body.name}}
     Email: {{webhook.body.email}}
     Phone: {{webhook.body.phone}}
     Message: {{webhook.body.message}}
     ```
4. Click **"Save"**

### Action 4: Send Auto-Reply to Contact (Optional)

1. Click **"+"** to add another action
2. Select **"Email"** → **"Send Email"**
3. Configure:
   - **To**: `{{webhook.body.email}}`
   - **Subject**: "Thank you for contacting SOLYNX"
   - **Body**: Create a professional response thanking them for reaching out
4. Click **"Save"**

---

## Step 5: Publish the Workflow

1. Review all your actions in the workflow
2. Click the **"Publish"** button in the top right corner
3. Confirm to activate the workflow

> ✅ **Your webhook is now live and ready to receive data!**

---

## Step 6: Provide the Webhook URL

Now that you have your webhook URL from Step 3, **send it to me** so I can integrate it into your website's contact form.

The webhook URL should look like:
```
https://services.leadconnectorhq.com/hooks/YOUR_UNIQUE_ID_HERE
```

---

## What Data Will Be Sent?

When someone fills out your contact form on solynx.solutions, the following data will be sent to your webhook:

```json
{
  "name": "John Doe",
  "email": "john@example.com",
  "phone": "+1 (555) 123-4567",
  "message": "I'm interested in your services...",
  "source": "SOLYNX Website",
  "timestamp": "2026-01-11T09:47:00.000Z"
}
```

**Field Reference:**
- `name` - Contact's full name from the form
- `email` - Contact's email address
- `phone` - Contact's phone number (optional field)
- `message` - Their message/inquiry
- `source` - Always "SOLYNX Website" to identify the lead source
- `timestamp` - When the form was submitted (ISO 8601 format)

---

## Step 7: Testing (After Integration)

After I integrate the webhook into your website, we'll test it:

1. Go to your website
2. Fill out the contact form with test data
3. Submit the form
4. Check in GoHighLevel:
   - Go to **Contacts** → Look for your test contact
   - Go to **Automation** → **Workflows** → Your workflow → **Workflow History**
   - Verify the webhook was triggered and data was received

---

## Troubleshooting

### Webhook Not Receiving Data?
- ✓ Workflow must be **Published** (not draft)
- ✓ Check entire webhook URL is copied correctly (no extra spaces)
- ✓ Verify no ad blockers or firewall blocking the request

### Contact Created But Missing Fields?
- ✓ Check webhook history/logs to see what data was actually received
- ✓ Verify field paths match your webhook type (`{{trigger.field}}` vs `{{webhook.body.field}}`)
- ✓ Ensure field mapping in Create/Update Contact action is correct

### Data Format Issues?
- ✓ Make sure you're using the correct variable paths
- ✓ Check that the webhook received all expected fields
- ✓ Review the workflow execution history to see any errors

---

## Quick Reference: Variable Paths

Depending on your webhook type, use these variable paths:

| Data Field | Inbound Webhook | Standard Webhook |
|------------|-----------------|------------------|
| Name       | `{{webhook.body.name}}` | `{{trigger.name}}` |
| Email      | `{{webhook.body.email}}` | `{{trigger.email}}` |
| Phone      | `{{webhook.body.phone}}` | `{{trigger.phone}}` |
| Message    | `{{webhook.body.message}}` | `{{trigger.message}}` |
| Source     | `{{webhook.body.source}}` | `{{trigger.source}}` |

---

## Next Steps

1. ✅ Complete Steps 1-5 above to create your webhook
2. 📋 Copy your webhook URL
3. 💬 Share the webhook URL with me
4. ⚙️ I'll integrate it into your website's contact form
5. 🧪 We'll test the complete flow together

---

**Need help?** If you get stuck on any step, let me know exactly where you're stuck and I'll guide you through it!
