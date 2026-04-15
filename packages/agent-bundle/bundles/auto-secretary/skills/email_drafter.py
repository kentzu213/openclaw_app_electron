"""Email Drafter — Dự thảo email chuyên nghiệp."""
async def execute(context, params=None):
    to = (params or {}).get('to', '')
    subject = (params or {}).get('subject', '')
    context_info = (params or {}).get('context', '')
    tone = context.config.get('email_tone', 'professional')
    
    prompt = f"""Dự thảo email:
To: {to}
Subject: {subject}
Context: {context_info}
Tone: {tone}

Viết email chuyên nghiệp, ngắn gọn, có greeting và closing."""
    
    draft = await context.llm.generate(prompt)
    return {'status': 'success', 'draft': draft, 'to': to, 'subject': subject}
