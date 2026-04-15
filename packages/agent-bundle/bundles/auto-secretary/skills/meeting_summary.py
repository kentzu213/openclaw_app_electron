"""Meeting Summarizer — Tóm tắt cuộc họp từ notes."""
async def execute(context, params=None):
    notes = (params or {}).get('notes', '')
    if not notes: return {'status': 'error', 'message': 'Notes required'}
    
    prompt = f"""Tóm tắt cuộc họp từ notes sau:
{notes}

Format:
📋 **Tóm tắt cuộc họp**
- Thành viên: ...
- Nội dung chính: ...
- Action items: ...
- Deadline: ..."""
    
    summary = await context.llm.generate(prompt)
    return {'status': 'success', 'summary': summary}
